// Camada de rede. Dois modos com a mesma interface:
//  - Supabase Realtime (broadcast + presence): todo mundo na internet
//  - Local (BroadcastChannel): só abas do mesmo navegador (testes)
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});

  // Cliente vendorizado (as versões < 2.5x não conectam com as chaves sb_publishable_...). CDN só de reserva.
  const SB_SRC = '/vendor/supabase.js';
  const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('script'));
      document.head.appendChild(s);
    });
  }

  // histórico curto de conexão/queda (fica em FT.netLog e aparece no diagnóstico)
  function netLog(msg) {
    const l = (FT.netLog = FT.netLog || []);
    l.push(new Date().toTimeString().slice(0, 8) + ' ' + msg);
    if (l.length > 40) l.shift();
  }

  function createNet(opts) {
    const { room, sid, cfg } = opts;
    let meta = opts.meta;
    const H = opts; // onMsg, onPeer, onPeerUpdate, onLeave, onStatus
    const known = new Map(); // id -> meta serializada (supabase) / lastSeen (local)
    let api = null;

    // ---------------- modo local ----------------
    function startLocal(quiet) {
      const bc = new BroadcastChannel(room);
      const seen = new Map();
      const post = (o) => { try { bc.postMessage(o); } catch (e) { /* ok */ } };
      bc.onmessage = (e) => {
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.k === 'm') H.onMsg(m.d);
        else if (m.k === 'meta' && m.id !== sid) {
          const isNew = !seen.has(m.id);
          seen.set(m.id, { t: Date.now(), meta: m.meta });
          if (isNew) { H.onPeer(m.id, m.meta); post({ k: 'meta', id: sid, meta }); }
          else H.onPeerUpdate(m.id, m.meta);
        } else if (m.k === 'bye' && seen.has(m.id)) {
          seen.delete(m.id); H.onLeave(m.id);
        }
      };
      post({ k: 'meta', id: sid, meta });
      const hb = setInterval(() => post({ k: 'meta', id: sid, meta }), 4000);
      const sweep = setInterval(() => {
        const now = Date.now();
        for (const [id, v] of seen) if (now - v.t > 15000) { seen.delete(id); H.onLeave(id); }
      }, 5000);
      window.addEventListener('beforeunload', () => post({ k: 'bye', id: sid }));
      if (!quiet) H.onStatus('local');
      api = {
        mode: 'local',
        send: (d) => post({ k: 'm', d }),
        setMeta: (m) => { meta = m; post({ k: 'meta', id: sid, meta }); },
        close: () => { clearInterval(hb); clearInterval(sweep); post({ k: 'bye', id: sid }); bc.close(); },
      };
    }

    // ---------------- modo Supabase ----------------
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const safe = (fn) => (...a) => { try { fn(...a); } catch (e) { console.error('[net] erro tratando jogador/mensagem:', e); } };

    // uma tentativa de conexão; lança erro (com o motivo) se não conectar
    async function connectSupabase() {
      if (!window.supabase) { try { await loadScript(SB_SRC); } catch (e) { await loadScript(SB_CDN); } }
      if (!window.supabase || !window.supabase.createClient) throw new Error('cliente do Supabase não carregou');
      const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, lock: async (_n, _t, fn) => await fn() },
        realtime: { params: { eventsPerSecond: 20 }, timeout: 30000, heartbeatIntervalMs: 12000, worker: true },
      });
      const rt = client.realtime;
      if (rt) {
        if (rt.onOpen) rt.onOpen(() => netLog('socket aberto'));
        if (rt.onClose) rt.onClose((e) => netLog('socket FECHOU' + (e && e.code != null ? ' (código ' + e.code + (e.reason ? ', ' + e.reason : '') + ')' : '')));
        if (rt.onError) rt.onError((e) => netLog('erro do socket' + (e && e.message ? ': ' + e.message : '')));
      }
      const onMsg = safe(H.onMsg), onPeer = safe(H.onPeer), onUpd = safe(H.onPeerUpdate), onLeave = safe(H.onLeave);
      let ch = null, closed = false, trackTimer = null, lastTrack = 0, pending = false;
      let downTimer = null, rejoinTimer = null, rejoinTries = 0, watch = null, firstOk = null, lastBad = '';
      const joined = () => !!ch && ch.state === 'joined';

      // um canal novo (quando o servidor FECHA o canal, a biblioteca não volta sozinha: precisa criar outro)
      const build = () => {
        const c = client.channel(room, { config: { broadcast: { self: false, ack: false }, presence: { key: sid } } });
        c.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
        c.on('presence', { event: 'sync' }, () => {
          const st = c.presenceState();
          const now = new Set();
          for (const key of Object.keys(st)) {
            if (key === sid) continue;
            const arr = st[key];
            const m = arr[arr.length - 1];
            if (!m) continue;
            now.add(key);
            const ser = JSON.stringify(m);
            if (!known.has(key)) { known.set(key, ser); onPeer(key, m); }
            else if (known.get(key) !== ser) { known.set(key, ser); onUpd(key, m); }
          }
          for (const key of [...known.keys()]) if (!now.has(key)) { known.delete(key); onLeave(key); }
        });
        // mensagens do próprio servidor (dizem POR QUE ele fechou/recusou o canal)
        try { c.on('system', {}, (pl) => netLog('servidor: ' + JSON.stringify(pl).slice(0, 140))); } catch (e) { /* ok */ }
        return c;
      };
      const doTrack = () => { pending = false; lastTrack = Date.now(); try { ch.track(meta).catch((e) => console.warn('[net] track falhou', e)); } catch (e) { /* ok */ } };

      // tira o canal velho DE VERDADE da lista da biblioteca (client.channel(room) devolveria o canal antigo se ele ainda estivesse lá)
      const dropChannel = async (c) => {
        try { await Promise.race([client.removeChannel(c), sleep(2500)]); } catch (e) { /* ok */ }
        try { const arr = client.realtime && client.realtime.channels; const i = arr ? arr.indexOf(c) : -1; if (i >= 0) arr.splice(i, 1); } catch (e) { /* ok */ }
      };
      const rejoin = (why) => {
        if (closed || rejoinTimer) return;
        const wait = Math.min(10000, 500 * Math.pow(2, rejoinTries++)); // 0,5 s, 1 s, 2 s, 4 s, 8 s, 10 s...
        netLog('entrando de novo no canal em ' + wait / 1000 + ' s (' + why + ')');
        rejoinTimer = setTimeout(async () => {
          if (closed) { rejoinTimer = null; return; }
          const old = ch;
          await dropChannel(old);
          rejoinTimer = null;
          if (closed) return;
          try { if (client.realtime && client.realtime.isConnected && !client.realtime.isConnected()) client.realtime.connect(); } catch (e) { /* ok */ }
          ch = build(); sub(ch);
        }, wait);
      };

      const onState = (c, status, err) => {
        if (c !== ch || closed) return;
        netLog('canal ' + status + (err && err.message ? ' — ' + err.message : ''));
        if (status === 'SUBSCRIBED') {
          rejoinTries = 0; clearTimeout(downTimer); downTimer = null;
          if (firstOk) { firstOk(); firstOk = null; }
          H.onStatus('online'); doTrack();
          return;
        }
        if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
        lastBad = status + (err && err.message ? ': ' + err.message : '');
        if (!firstOk && !downTimer) downTimer = setTimeout(() => { downTimer = null; if (!closed && !joined()) H.onStatus('error', status); }, 4000);
        if (status === 'CLOSED') rejoin('o servidor fechou o canal'); // CLOSED não volta sozinho
        // CHANNEL_ERROR / TIMED_OUT: a biblioteca tenta de novo; se não voltar em 12 s, a gente refaz o canal
        else setTimeout(() => { if (!closed && c === ch && !joined()) rejoin(status + ' sem recuperar'); }, 12000);
      };
      const sub = (c) => c.subscribe((st, e) => onState(c, st, e), 30000);

      ch = build();
      try {
        await new Promise((resolve, reject) => {
          // o 3D trava o navegador no celular: damos até 45 s pra entrar
          const to = setTimeout(() => { firstOk = null; reject(new Error(lastBad || 'sem resposta do servidor em 45 s')); }, 45000);
          firstOk = () => { clearTimeout(to); resolve(); };
          sub(ch);
        });
      } catch (e) {
        closed = true; clearTimeout(rejoinTimer);
        try { client.removeChannel(ch); client.realtime.disconnect(); } catch (x) { /* ok */ }
        throw e;
      }

      // vigia: a cada 8 s confere se ainda estamos dentro do canal (cobre qualquer queda silenciosa)
      watch = setInterval(() => {
        if (closed || document.hidden || rejoinTimer) return;
        try { if (client.realtime && client.realtime.isConnected && !client.realtime.isConnected()) { netLog('socket caído, religando'); client.realtime.connect(); } } catch (e) { /* ok */ }
        if (!joined() && ch.state !== 'joining') rejoin('vigia: canal ' + ch.state);
      }, 8000);

      const wake = (why) => { // voltou pro app / voltou a internet: confere tudo na hora
        if (closed) return;
        try { if (client.realtime && client.realtime.isConnected && !client.realtime.isConnected()) { netLog('religando (' + why + ')'); client.realtime.connect(); } } catch (e) { /* ok */ }
        if (!joined() && ch.state !== 'joining') rejoin('voltou (' + why + ')'); else doTrack();
      };
      const onVis = () => { if (!document.hidden) wake('voltou pro app'); };
      const onNet = () => wake('internet voltou');
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('online', onNet);
      FT.netInfo = () => 'canal=' + (ch ? ch.state : '?') + ' socket=' + (client.realtime && client.realtime.isConnected && client.realtime.isConnected() ? 'aberto' : 'fechado');
      return {
        mode: 'online',
        send: (d) => { if (joined()) ch.send({ type: 'broadcast', event: 'm', payload: d }); },
        setMeta: (m) => {
          meta = m;
          if (pending) return;
          pending = true;
          trackTimer = setTimeout(() => { if (joined()) doTrack(); else pending = false; }, Math.max(0, 1500 - (Date.now() - lastTrack)));
        },
        close: () => { closed = true; clearInterval(watch); clearTimeout(trackTimer); clearTimeout(rejoinTimer); clearTimeout(downTimer); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onNet); try { client.removeChannel(ch); } catch (e) { /* ok */ } },
      };
    }

    // tenta de novo sozinho (3 s, 6 s, 9 s... até 30 s). Enquanto não conecta, o jogo segue jogável no modo local.
    let stopped = false;
    async function startSupabase() {
      for (let attempt = 1; !stopped; attempt++) {
        try {
          const online = await connectSupabase();
          if (stopped) { online.close(); return; }
          if (api && api.mode === 'local') api.close();
          api = online; FT.netError = null;
          H.onStatus('online');
          return;
        } catch (err) {
          const why = String((err && err.message) || err);
          FT.netError = why;
          console.warn(`[net] tempo real indisponível (tentativa ${attempt}): ${why}`);
          H.onStatus('error', why);
          if (!api) startLocal(true);
          await sleep(Math.min(15000, 2000 * attempt));
        }
      }
    }

    Object.defineProperty(FT, 'netMode', { configurable: true, get: () => (api ? api.mode : 'conectando') });
    const hasCfg = cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY;
    const ready = hasCfg ? startSupabase() : Promise.resolve(startLocal());

    // fachada: funciona antes mesmo da conexão terminar
    return {
      get mode() { return api ? api.mode : 'connecting'; },
      ready,
      send(d) { if (api) api.send(d); },
      setMeta(m) { meta = m; if (api) api.setMeta(m); },
      close() { stopped = true; if (api) api.close(); },
    };
  }

  // Diagnóstico de conexão (toque na etiqueta "online/offline" do jogo): mostra onde está travando.
  FT.netDiag = async function (cfg) {
    const L = [];
    const add = (s) => L.push(s);
    const t0 = performance.now();
    const ms = () => Math.round(performance.now() - t0) + ' ms';
    const c = navigator.connection || {};
    add('Aparelho: ' + navigator.userAgent.replace(/\s+/g, ' ').slice(0, 110));
    add('Internet do navegador: ' + (navigator.onLine ? 'ligada' : 'DESLIGADA') + (c.effectiveType ? ' (' + c.effectiveType + (c.saveData ? ', economia de dados LIGADA' : '') + ')' : ''));
    add('Página: ' + location.origin);
    add('Tempo real: ' + (FT.netMode || '?') + (FT.netError ? ' | último erro: ' + FT.netError : ''));
    if (FT.netInfo) add('Agora: ' + FT.netInfo());
    const hist = (FT.netLog || []).slice(-8);
    if (hist.length) add('Histórico recente:\n  ' + hist.join('\n  '));
    add('Biblioteca do Supabase: ' + (window.supabase && window.supabase.createClient ? 'carregada' : 'NÃO carregou'));
    const url = cfg && cfg.SUPABASE_URL, key = cfg && cfg.SUPABASE_ANON_KEY;
    if (!url || !key) { add('Config do servidor: SEM chaves do Supabase'); return L.join('\n'); }
    add('Servidor: ' + url.replace('https://', ''));
    try {
      const r = await Promise.race([fetch(url + '/auth/v1/health', { headers: { apikey: key } }), new Promise((_, rej) => setTimeout(() => rej(new Error('demorou mais de 8 s')), 8000))]);
      add('Teste 1 (HTTPS até o Supabase): ' + (r.ok ? 'OK' : 'respondeu ' + r.status) + ' em ' + ms());
    } catch (e) { add('Teste 1 (HTTPS até o Supabase): FALHOU — ' + (e && e.message)); }
    await new Promise((res) => {
      let done = false;
      const fin = (s) => { if (done) return; done = true; add('Teste 2 (WebSocket / tempo real): ' + s + ' em ' + ms()); try { ws.close(); } catch (e) { /* ok */ } res(); };
      let ws;
      try { ws = new WebSocket(url.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0'); }
      catch (e) { fin('FALHOU ao criar — ' + (e && e.message)); return; }
      ws.onopen = () => fin('OK');
      ws.onerror = () => fin('FALHOU (rede bloqueou a conexão)');
      ws.onclose = (e) => fin('FECHOU antes de abrir (código ' + e.code + ')');
      setTimeout(() => fin('SEM RESPOSTA em 8 s'), 8000);
    });
    return L.join('\n');
  };

  FT.createNet = createNet;
})();
