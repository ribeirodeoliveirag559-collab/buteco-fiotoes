// Chat de voz por proximidade.
// - Áudio direto entre os aparelhos (WebRTC em malha): a voz NÃO passa por servidor nosso e NÃO é gravada.
// - A "combinação" da conexão (offer/answer/ICE) vai pelo mesmo canal do jogo (Supabase Realtime).
// - Só conecta com quem está perto e também ligou a voz; o volume cai com a distância e o som vem do lado certo.
// Estados do botão: off (sem microfone, sem ouvir) -> on (falando e ouvindo) -> muted (só ouvindo) -> off.

const RANGE = 9;      // metros: depois disso ninguém se ouve
const NEAR = 1.5;     // até aqui o volume é total
const HYST = 2;       // folga pra não ficar ligando/desligando na borda
const falloff = (d) => (d <= NEAR ? 1 : d >= RANGE ? 0 : Math.pow(1 - (d - NEAR) / (RANGE - NEAR), 1.6));

export function createVoice({ sid, signal, iceServers, toast, onState }) {
  let state = 'off';
  let stream = null, ctx = null, master = null, localAn = null, localBuf = null;
  const conns = new Map(); // peerId -> { pc, el, gain, pan, an, buf, speaking, until, pending, dropTimer, born }
  let acc = 0, mySpeaking = false;

  const ice = () => ({ iceServers: iceServers && iceServers.length ? iceServers : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
  const setState = (s) => { state = s; onState && onState(s); };
  const rms = (an, buf) => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; } return Math.sqrt(s / buf.length); };

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) { toast('Este navegador não suporta chat de voz', 'mic-off'); return false; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      toast(denied ? 'Microfone bloqueado. Libere nas configurações do navegador' : 'Não achei um microfone', 'mic-off');
      return false;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC(); if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    localAn = ctx.createAnalyser(); localAn.fftSize = 512; localBuf = new Uint8Array(localAn.fftSize);
    ctx.createMediaStreamSource(stream).connect(localAn);
    return true;
  }

  function stop() {
    for (const id of [...conns.keys()]) drop(id);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; localAn = null; mySpeaking = false;
    if (ctx) { try { ctx.close(); } catch (e) { /* ok */ } }
    ctx = null; master = null;
  }

  async function cycle() {
    if (state === 'off') {
      if (!(await start())) return state;
      setState('on'); toast('Voz ligada: quem está perto te ouve', 'mic');
    } else if (state === 'on') {
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      setState('muted'); toast('Microfone mudo: você só ouve', 'mic-off');
    } else {
      stop(); setState('off'); toast('Voz desligada', 'mic-off');
    }
    return state;
  }
  function toggleMute() {
    if (state === 'off' || !stream) return cycle();
    const on = state === 'muted';
    stream.getAudioTracks().forEach((t) => { t.enabled = on; });
    setState(on ? 'on' : 'muted'); toast(on ? 'Microfone ligado' : 'Microfone mudo', on ? 'mic' : 'mic-off');
  }

  function drop(id) {
    const c = conns.get(id); if (!c) return;
    clearTimeout(c.dropTimer);
    try { c.pc.close(); } catch (e) { /* ok */ }
    try { c.el.pause(); c.el.srcObject = null; } catch (e) { /* ok */ }
    try { c.gain.disconnect(); c.pan && c.pan.disconnect(); } catch (e) { /* ok */ }
    conns.delete(id);
  }

  function newConn(id) {
    const pc = new RTCPeerConnection(ice());
    const c = { pc, el: null, gain: null, pan: null, an: null, buf: null, speaking: false, until: 0, pending: [], dropTimer: null, born: performance.now() };
    conns.set(id, c);
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => { if (e.candidate) signal({ to: id, k: 'ice', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => attach(id, c, e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      clearTimeout(c.dropTimer);
      if (s === 'failed' || s === 'closed') drop(id);
      else if (s === 'disconnected') c.dropTimer = setTimeout(() => drop(id), 6000); // dá 6 s pra se recuperar
    };
    return c;
  }

  function attach(id, c, remote) {
    if (!ctx || c.gain) return;
    // o elemento <audio> (mudo) é necessário pro navegador entregar o áudio remoto ao WebAudio; quem toca é o WebAudio (volume por distância)
    c.el = new Audio(); c.el.srcObject = remote; c.el.muted = true; c.el.playsInline = true; c.el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(remote);
    c.an = ctx.createAnalyser(); c.an.fftSize = 512; c.buf = new Uint8Array(c.an.fftSize); src.connect(c.an);
    c.gain = ctx.createGain(); c.gain.gain.value = 0;
    src.connect(c.gain);
    if (ctx.createStereoPanner) { c.pan = ctx.createStereoPanner(); c.gain.connect(c.pan); c.pan.connect(master); } else c.gain.connect(master);
  }

  async function signalIn(m) {
    if (state === 'off' || !stream || !m || m.to !== sid) return;
    const id = m.id;
    try {
      if (m.k === 'offer') {
        if (conns.has(id)) drop(id);
        const c = newConn(id);
        await c.pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
        for (const x of c.pending.splice(0)) await c.pc.addIceCandidate(x).catch(() => {});
        const ans = await c.pc.createAnswer(); await c.pc.setLocalDescription(ans);
        signal({ to: id, k: 'answer', sdp: c.pc.localDescription.sdp });
      } else if (m.k === 'answer') {
        const c = conns.get(id); if (!c || c.pc.signalingState !== 'have-local-offer') return;
        await c.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
        for (const x of c.pending.splice(0)) await c.pc.addIceCandidate(x).catch(() => {});
      } else if (m.k === 'ice') {
        const c = conns.get(id); if (!c || !m.c) return;
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(m.c).catch(() => {}); else c.pending.push(m.c);
      }
    } catch (e) { console.warn('[voz] sinalização falhou', e); drop(id); }
  }

  async function offerTo(id) {
    const c = newConn(id);
    try { const off = await c.pc.createOffer(); await c.pc.setLocalDescription(off); signal({ to: id, k: 'offer', sdp: c.pc.localDescription.sdp }); }
    catch (e) { console.warn('[voz] offer falhou', e); drop(id); }
  }

  // chamado todo quadro: me = {x,z}, yaw, peers = Map/values de {id,x,z,vc}
  function tick(dt, me, yaw, peers) {
    if (state === 'off' || !ctx) return;
    const now = performance.now();
    // 1) volume e lado do som, por quadro
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const p of peers) {
      const c = conns.get(p.id); if (!c || !c.gain) continue;
      const dx = p.x - me.x, dz = p.z - me.z, d = Math.hypot(dx, dz) || 1e-6;
      const g = falloff(d);
      c.gain.gain.value += (g - c.gain.gain.value) * Math.min(1, dt * 12);
      if (c.pan) c.pan.pan.value = Math.max(-0.8, Math.min(0.8, (rx * dx + rz * dz) / d)) * Math.min(1, d / 2);
    }
    // 2) quem está falando (medidor de cada voz + o meu)
    for (const c of conns.values()) if (c.an) { if (rms(c.an, c.buf) > 0.02) c.until = now + 350; c.speaking = now < c.until; }
    mySpeaking = state === 'on' && localAn ? rms(localAn, localBuf) > 0.03 : false;
    // 3) a cada 0,5 s: liga/desliga conexões conforme a distância
    acc += dt; if (acc < 0.5) return; acc = 0;
    const alive = new Set();
    for (const p of peers) {
      alive.add(p.id);
      const d = Math.hypot(p.x - me.x, p.z - me.z), has = conns.has(p.id);
      if (!p.vc) { if (has) drop(p.id); continue; }
      if (!has && d < RANGE + HYST && sid < p.id) offerTo(p.id); // quem tem o menor id é quem liga (evita as duas pontas ligarem juntas)
      else if (has && d > RANGE + HYST + 2) drop(p.id);
      else if (has && now - conns.get(p.id).born > 15000 && conns.get(p.id).pc.connectionState !== 'connected') drop(p.id); // não fechou: tenta de novo depois
    }
    for (const id of [...conns.keys()]) if (!alive.has(id)) drop(id);
  }

  return {
    get state() { return state; },
    get mySpeaking() { return mySpeaking; },
    speaking: (id) => { const c = conns.get(id); return !!(c && c.speaking); },
    connected: () => [...conns.entries()].filter(([, c]) => c.pc.connectionState === 'connected').map(([id]) => id),
    cycle, toggleMute, signalIn, tick, stop: () => { if (state !== 'off') { stop(); setState('off'); } },
  };
}
