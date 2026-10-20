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
        realtime: { params: { eventsPerSecond: 20 } },
      });
      const ch = client.channel(room, { config: { broadcast: { self: false, ack: false }, presence: { key: sid } } });
      const onMsg = safe(H.onMsg), onPeer = safe(H.onPeer), onUpd = safe(H.onPeerUpdate), onLeave = safe(H.onLeave);
      ch.on('broadcast', { event: 'm' }, ({ payload }) => onMsg(payload));
      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState();
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

      let trackTimer = null, lastTrack = 0, pending = false, closed = false;
      const doTrack = () => { pending = false; lastTrack = Date.now(); ch.track(meta).catch((e) => console.warn('[net] track falhou', e)); };
      let first = true;
      try {
        await new Promise((resolve, reject) => {
          const to = setTimeout(() => { first = false; reject(new Error('sem resposta do servidor em 12 s')); }, 12000);
          ch.subscribe((status, err) => {
            if (first) {
              if (status === 'SUBSCRIBED') { first = false; clearTimeout(to); resolve(); }
              else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                first = false; clearTimeout(to); reject(new Error(status + (err && err.message ? ': ' + err.message : '')));
              }
            } else if (!closed) {
              // quedas e voltas depois de conectado (rede móvel, tela bloqueada...): o cliente reconecta sozinho
              if (status === 'SUBSCRIBED') { H.onStatus('online'); doTrack(); }
              else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') H.onStatus('error', status);
            }
          });
        });
      } catch (e) {
        try { client.removeChannel(ch); client.realtime.disconnect(); } catch (x) { /* ok */ }
        throw e;
      }
      doTrack();
      const onVis = () => { if (!document.hidden && !closed) doTrack(); }; // voltou pro app: avisa que está aqui
      document.addEventListener('visibilitychange', onVis);
      return {
        mode: 'online',
        send: (d) => { ch.send({ type: 'broadcast', event: 'm', payload: d }); },
        setMeta: (m) => {
          meta = m;
          if (pending) return;
          pending = true;
          trackTimer = setTimeout(doTrack, Math.max(0, 1500 - (Date.now() - lastTrack)));
        },
        close: () => { closed = true; clearTimeout(trackTimer); document.removeEventListener('visibilitychange', onVis); try { client.removeChannel(ch); } catch (e) { /* ok */ } },
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
          await sleep(Math.min(30000, 3000 * attempt));
        }
      }
    }

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

  FT.createNet = createNet;
})();
