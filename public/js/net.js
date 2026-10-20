// Camada de rede. Dois modos com a mesma interface:
//  - Supabase Realtime (broadcast + presence): todo mundo na internet
//  - Local (BroadcastChannel): só abas do mesmo navegador (testes)
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});

  const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

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
    function startLocal() {
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
      H.onStatus('local');
      api = {
        mode: 'local',
        send: (d) => post({ k: 'm', d }),
        setMeta: (m) => { meta = m; post({ k: 'meta', id: sid, meta }); },
        close: () => { clearInterval(hb); clearInterval(sweep); post({ k: 'bye', id: sid }); bc.close(); },
      };
    }

    // ---------------- modo Supabase ----------------
    async function startSupabase() {
      try {
        if (!window.supabase) await loadScript(SB_SRC);
        const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
          realtime: { params: { eventsPerSecond: 20 } },
        });
        const ch = client.channel(room, { config: { broadcast: { self: false, ack: false }, presence: { key: sid } } });
        ch.on('broadcast', { event: 'm' }, ({ payload }) => H.onMsg(payload));
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
            if (!known.has(key)) { known.set(key, ser); H.onPeer(key, m); }
            else if (known.get(key) !== ser) { known.set(key, ser); H.onPeerUpdate(key, m); }
          }
          for (const key of [...known.keys()]) if (!now.has(key)) { known.delete(key); H.onLeave(key); }
        });

        let trackTimer = null, lastTrack = 0, pending = false;
        const doTrack = () => {
          pending = false; lastTrack = Date.now();
          ch.track(meta).catch(() => {});
        };
        await new Promise((resolve, reject) => {
          const to = setTimeout(() => reject(new Error('timeout')), 12000);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') { clearTimeout(to); resolve(); }
            else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              clearTimeout(to); reject(new Error(status));
            }
          });
        });
        doTrack();
        H.onStatus('online');
        api = {
          mode: 'online',
          send: (d) => { ch.send({ type: 'broadcast', event: 'm', payload: d }); },
          setMeta: (m) => {
            meta = m;
            if (pending) return;
            pending = true;
            const wait = Math.max(0, 1500 - (Date.now() - lastTrack));
            trackTimer = setTimeout(doTrack, wait);
          },
          close: () => { clearTimeout(trackTimer); client.removeChannel(ch); },
        };
      } catch (err) {
        console.warn('Supabase indisponível, usando modo local:', err);
        H.onStatus('error');
        startLocal();
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
      close() { if (api) api.close(); },
    };
  }

  FT.createNet = createNet;
})();
