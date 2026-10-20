// Jukebox: toca músicas reais pelo player oficial do YouTube (link colado por quem pediu).
// Nada é hospedado aqui — o YouTube serve o áudio/vídeo. A faixa é sincronizada entre os jogadores
// (mensagem "mus" + metadado de presença) e o volume cai com a distância da jukebox / sobe no camarote.
const $ = (id) => document.getElementById(id);

export function parseYouTube(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (/youtu\.be$/.test(u.hostname)) return (u.pathname.slice(1).match(/^[\w-]{11}/) || [null])[0];
    if (/youtube\.com$/.test(u.hostname) || /music\.youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get('v');
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch (e) { /* link inválido */ }
  return null;
}

let apiPromise = null;
function loadApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { apiPromise = null; reject(new Error('yt')); };
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 15000);
    });
  }
  return apiPromise;
}

export function createMusic({ toast }) {
  let player = null, cur = null, vol = 100, muted = false, lastVol = -1;
  try { muted = localStorage.getItem('buteco:musicMuted') === '1'; } catch (e) { /* ok */ }

  function showBox(on) { $('ytbox').hidden = !on; }
  function setTitle(t) { $('yt-title').textContent = t; }

  async function play(track) {
    if (!track || !track.vid) return;
    cur = { vid: track.vid, t0: track.t0 || Date.now(), by: track.by || '' };
    const offset = Math.max(0, Math.min(60 * 60, (Date.now() - cur.t0) / 1000));
    showBox(true); setTitle('🎵 carregando…');
    try { await loadApi(); } catch (e) { toast('Não consegui carregar o player do YouTube 😕'); showBox(false); cur = null; return; }
    const startSeconds = Math.floor(offset);
    if (!player) {
      player = new window.YT.Player('yt-player', {
        width: '100%', height: '100%', videoId: cur.vid,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1, start: startSeconds },
        events: {
          onReady: (e) => { e.target.setVolume(muted ? 0 : vol); e.target.playVideo(); },
          onStateChange: (e) => {
            if (e.data === 1) { const d = e.target.getVideoData && e.target.getVideoData(); setTitle('🎵 ' + ((d && d.title) || 'tocando') + (cur && cur.by ? ' · pedida por ' + cur.by : '')); }
            if (e.data === 0) { cur = null; showBox(false); }
          },
          onError: () => { toast('Esse vídeo não pode ser tocado aqui. Tente outro link 🎶'); cur = null; showBox(false); },
        },
      });
    } else {
      player.loadVideoById({ videoId: cur.vid, startSeconds });
      if (player.setVolume) player.setVolume(muted ? 0 : vol);
    }
  }
  function stop() {
    cur = null; showBox(false);
    try { if (player && player.stopVideo) player.stopVideo(); } catch (e) { /* ok */ }
  }
  function volumeFor(pos, inVip) {
    if (inVip) return 100;
    const d = Math.hypot(pos.x - 9.2, pos.z + 3.2);
    return Math.round(Math.max(14, Math.min(100, 100 - d * 7)));
  }
  function tick(pos, inVip) {
    if (!cur || !player || !player.setVolume) return;
    vol = volumeFor(pos, inVip);
    const v = muted ? 0 : vol;
    if (v !== lastVol) { lastVol = v; try { player.setVolume(v); } catch (e) { /* ok */ } }
  }
  function setMuted(m) {
    muted = m; lastVol = -1;
    try { localStorage.setItem('buteco:musicMuted', m ? '1' : '0'); } catch (e) { /* ok */ }
    try { if (player && player.setVolume) player.setVolume(m ? 0 : vol); } catch (e) { /* ok */ }
  }
  return { play, stop, tick, setMuted, get muted() { return muted; }, get current() { return cur; }, parseYouTube };
}
