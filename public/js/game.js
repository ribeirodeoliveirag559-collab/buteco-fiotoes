// Jogo em primeira pessoa: movimento, câmera, cerveja, baseado, HOMEM, chat, multiplayer.
import * as THREE from 'three';
import { createAvatar, EYE_HEIGHT, lookColors, makeMug, makeJoint } from './avatar.js';
import { toTex } from './textures.js';
import { BAR } from './bar.js';
import { api } from './api.js';

const FT = window.FT;
const S = FT.sprites;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const cleanName = (n) => String(n == null ? '' : n).replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
const uid = () => Math.random().toString(36).slice(2, 10);
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const isTouch = window.matchMedia('(pointer: coarse)').matches;

const SPEED = 3.1;
const DRINK_MS = 5000;
const KO_BAC = 24;

export function createGame({ bar, camera, post, cfg, quality }) {
  const sid = uid();
  let me = null, running = false, session = null;
  const players = new Map();
  let net = null, locked = false;
  let rankRows = [], rankDay = '', rankMode = 'online', rankTimer = null, rankSoon = null;

  // entrada
  const keys = {};
  const joy = { x: 0, y: 0, id: null };
  let holdBtn = false, holdKey = false, holdMouse = false;
  let yaw = Math.PI, pitch = 0;

  // efeitos
  let drunkVis = 0, psyVis = 0, psyStart = 0, psyEnd = 0, bobPhase = 0, camRoll = 0;

  // ---------------- modelo em primeira pessoa (braço + caneca) ----------------
  const vm = new THREE.Group();
  camera.add(vm);
  const armPivot = new THREE.Group(); vm.add(armPivot);
  const hand = new THREE.Group(); armPivot.add(hand);
  const mug = makeMug(); const joint = makeJoint();
  hand.add(mug, joint);
  mug.scale.setScalar(1.0); joint.visible = false;
  let armMesh = null;
  const vmPose = { lift: 0, smoke: 0, drinkP: 0 };
  function noDepth(o) {
    o.traverse((c) => { if (c.isMesh) { c.renderOrder = 50; (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.depthTest = false; }); } });
  }
  function buildViewModel(look) {
    if (armMesh) { armPivot.remove(armMesh); armMesh.geometry.dispose(); }
    const col = lookColors(look);
    const tex = toTex(col.armCanvas, { nearest: true });
    const geo = new THREE.BoxGeometry(0.075, 0.42, 0.075); geo.translate(0, -0.21, 0);
    const side = new THREE.MeshLambertMaterial({ map: tex });
    armMesh = new THREE.Mesh(geo, [side, side, new THREE.MeshLambertMaterial({ color: col.shirt }), new THREE.MeshLambertMaterial({ color: col.skin }), side, side]);
    armPivot.add(armMesh);
    hand.position.set(0, -0.42, 0);
    noDepth(armMesh); noDepth(mug); noDepth(joint);
  }
  // luz própria pro braço (fica sempre visível mesmo no escuro)
  const vmLight = new THREE.PointLight(0xffe0b0, 1.4, 2.5, 2);
  vmLight.position.set(0.1, 0.2, 0.3); camera.add(vmLight);

  // fumaça em primeira pessoa
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fpPuffs = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    s.renderOrder = 60; s.userData = { t: -1 }; camera.add(s); fpPuffs.push(s);
  }
  let puffCd = 0;

  // ---------------- HUD / avisos ----------------
  function toast(text) {
    const d = document.createElement('div'); d.textContent = text; $('toast').appendChild(d); setTimeout(() => d.remove(), 3700);
  }
  function addLog(name, text, sys) {
    const log = $('chatlog'), d = document.createElement('div');
    if (sys) { d.className = 'sys'; d.textContent = text; } else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, document.createTextNode(text)); }
    log.appendChild(d);
    while (log.children.length > 7) log.removeChild(log.firstChild);
    setTimeout(() => d.remove(), 16000);
  }
  function updateOnline() { $('online').textContent = '👥 ' + (players.size + 1); }
  function levelLabel(b) { return b < 3 ? 'Sóbrio' : b < 6 ? 'Alegrinho' : b < 9 ? 'Animado' : b < 12 ? 'Bêbado 🥴' : b < 16 ? 'Muito bêbado' : b < 21 ? 'Chapado' : 'Quase apagando 😵'; }
  function updateStatus() {
    $('beer-n').textContent = me.beers;
    $('level-label').textContent = levelLabel(me.bac);
    $('level-bar').style.width = clamp((me.bac / KO_BAC) * 100, 0, 100) + '%';
  }
  function setNetLabel(s) {
    const el = $('netmode');
    el.textContent = s === 'online' ? '🟢 online' : s === 'local' ? '🧪 teste' : s === 'error' ? '🔴 offline' : '…';
    el.title = s === 'local' ? 'Modo teste: só enxerga outras abas deste navegador (configure o Supabase Realtime).' : '';
  }
  const drunkLevel = () => Math.sqrt(clamp((me.bac - 9) / 10, 0, 1));
  const isKO = () => Date.now() < me.koUntil;

  // ---------------- placar ----------------
  async function refreshRanking() {
    if (!running) return;
    const r = session.offline ? null : await api.ranking();
    const online = new Set([me.pid]); players.forEach((p) => online.add(p.pid));
    if (r && r.rows) {
      rankMode = 'online'; rankDay = r.day;
      rankRows = r.rows.map((x) => ({ pid: x.pid, name: x.name, beers: x.beers, online: online.has(x.pid) }));
      // o servidor atualiza só quando termina cada cerveja; garante que o meu valor local não fique pra trás
    } else {
      rankMode = 'offline';
      rankRows = [{ pid: me.pid, name: me.name, beers: me.beers, online: true }]
        .concat([...players.values()].map((p) => ({ pid: p.pid, name: p.name, beers: p.beers, online: true })))
        .filter((x) => x.beers > 0).sort((a, b) => b.beers - a.beers);
      rankDay = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    bar.drawPoster(rankRows, rankDay, me.pid, rankMode);
    if (!$('ranking').hidden) fillRankingModal();
  }
  function rankSoonFn() { clearTimeout(rankSoon); rankSoon = setTimeout(refreshRanking, 1200); }
  function fillRankingModal() {
    const ol = $('rank-list'); ol.innerHTML = '';
    if (!rankRows.length) { const li = document.createElement('li'); li.textContent = 'Ninguém bebeu ainda… seja o primeiro! 🍺'; li.style.counterIncrement = 'none'; ol.appendChild(li); }
    rankRows.forEach((r) => {
      const li = document.createElement('li'); if (r.pid === me.pid) li.className = 'me';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
      const dot = document.createElement('span'); dot.className = 'dot' + (r.online ? ' on' : '');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.beers + ' 🍺';
      li.append(nm, dot, n); ol.appendChild(li);
    });
  }
  function openRanking() { releaseLock(); fillRankingModal(); $('ranking').hidden = false; refreshRanking(); }
  function closeRanking() { $('ranking').hidden = true; }

  // ---------------- jogadores remotos ----------------
  function addPeer(id, m) {
    if (!m || typeof m !== 'object') return;
    let p = players.get(id);
    if (p) return updatePeer(id, m);
    const look = S.sanitizeLook(m.l);
    const av = createAvatar(look, { name: cleanName(m.n) || 'Alguém' });
    av.setName(cleanName(m.n) || 'Alguém');
    p = {
      id, pid: String(m.pid || id).slice(0, 40), name: cleanName(m.n) || 'Alguém', look, av,
      x: clamp(num(m.x, BAR.spawn.x), -9.5, 9.5), z: clamp(num(m.z, BAR.spawn.z), -6.5, 6.5), ry: num(m.ry, 0),
      vx: 0, vz: 0, rx: 0, rz: 0, rt: 0, beers: clamp(num(m.b, 0) | 0, 0, 999), drunk: clamp(num(m.d, 0), 0, 1),
      drinking: false, smoking: false, redUntil: Date.now() + clamp(num(m.rd, 0), 0, 120000), koUntil: 0, lastChat: 0, lastMv: 0,
    };
    p.rx = p.x; p.rz = p.z;
    av.root.position.set(p.x, 0, p.z); av.root.rotation.y = p.ry;
    bar.scene.add(av.root);
    players.set(id, p);
    addLog(null, `${p.name} entrou no buteco 🍻`, true);
    FT.audio.clink();
    updateOnline(); rankSoonFn();
  }
  function updatePeer(id, m) {
    const p = players.get(id);
    if (!p || !m) return;
    const name = cleanName(m.n) || p.name;
    if (name !== p.name) { p.name = name; p.av.setName(name); }
    const lk = S.sanitizeLook(m.l);
    if (JSON.stringify(lk) !== JSON.stringify(p.look)) { p.look = lk; p.av.setLook(lk); }
    p.beers = Math.max(p.beers, clamp(num(m.b, 0) | 0, 0, 999));
    p.drunk = clamp(num(m.d, 0), 0, 1);
    if (m.rd > 0) p.redUntil = Math.max(p.redUntil, Date.now() + clamp(num(m.rd, 0), 0, 120000));
    if (Date.now() - p.lastMv > 2500) { p.x = p.rx = clamp(num(m.x, p.x), -9.5, 9.5); p.z = p.rz = clamp(num(m.z, p.z), -6.5, 6.5); p.ry = num(m.ry, p.ry); }
  }
  function removePeer(id) {
    const p = players.get(id);
    if (!p) return;
    bar.scene.remove(p.av.root); p.av.dispose();
    players.delete(id);
    addLog(null, `${p.name} saiu do buteco`, true);
    updateOnline(); rankSoonFn();
  }
  function milestone(name, b, mine) {
    if (b >= 5 && b % 5 === 0) { addLog(null, `${mine ? 'Você' : name} já tomou ${b} cervejas! 🍻`, true); if (mine) toast(`${b} cervejas! 🍻`); }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.id === sid) return;
    const p = players.get(m.id);
    if (!p) return;
    switch (m.t) {
      case 'mv':
        p.lastMv = Date.now(); p.rt = performance.now();
        p.rx = clamp(num(m.x, p.x), -9.5, 9.5); p.rz = clamp(num(m.z, p.z), -6.5, 6.5); p.ry = num(m.ry, p.ry);
        p.vx = clamp(num(m.vx, 0), -6, 6); p.vz = clamp(num(m.vz, 0), -6, 6); p.drunk = clamp(num(m.d, p.drunk), 0, 1);
        break;
      case 'dr': p.drinking = !!m.v; if (m.v) FT.audio.gulp(); break;
      case 'bw': {
        const b = clamp(num(m.b, 0) | 0, 0, 999); p.drinking = false;
        if (b > p.beers) { p.beers = b; milestone(p.name, b, false); }
        p.drunk = clamp(num(m.d, p.drunk), 0, 1);
        if (Math.random() < 0.5) FT.audio.burp();
        rankSoonFn();
        break;
      }
      case 'sm': p.smoking = !!m.v; if (m.rd > 0) p.redUntil = Date.now() + clamp(num(m.rd, 0), 0, 120000); break;
      case 'ko': p.koUntil = Date.now() + clamp(num(m.ms, 0), 0, 15000); p.drinking = false; break;
      case 'ch': {
        const now = performance.now(); if (now - p.lastChat < 500) return; p.lastChat = now;
        const text = String(m.m == null ? '' : m.m).replace(/[<>]/g, '').slice(0, 90); if (!text) return;
        p.av.say(text); addLog(p.name, text, false); break;
      }
    }
  }
  const send = (o) => { if (net) { o.id = sid; net.send(o); } };
  const getMeta = () => ({ pid: me.pid, n: me.name, l: me.look, x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +yaw.toFixed(2), b: me.beers, d: +drunkLevel().toFixed(2), rd: Math.max(0, me.redUntil - Date.now()) });
  let metaTimer = null;
  const pushMeta = () => { clearTimeout(metaTimer); metaTimer = setTimeout(() => net && net.setMeta(getMeta()), 500); };

  // ---------------- cerveja ----------------
  let drinkT = 0, drinkDur = DRINK_MS, drinkingNow = false, gulpT = 0, pendingStart = false;
  const dialogOpen = () => !$('dialog').hidden;
  function newDur() { return DRINK_MS * rnd(0.92, 1.1) * (1 + drunkLevel() * 0.25); }
  function updateDrink(dt) {
    const want = (holdBtn || holdKey || holdMouse) && !isKO() && !me.smoking && !dialogOpen() && $('ranking').hidden;
    if (want) {
      if (!drinkingNow) {
        drinkingNow = true; drinkDur = newDur(); me.drinking = true;
        send({ t: 'dr', v: 1 }); FT.audio.clink();
        if (!session.offline) api.drink({ pid: session.pid, token: session.token, action: 'start' });
      }
      drinkT += dt * 1000; gulpT -= dt;
      if (gulpT <= 0) { FT.audio.gulp(); gulpT = rnd(0.35, 0.6); }
      if (drinkT >= drinkDur) { finishBeer(true); drinkT = 0; drinkDur = newDur(); }
    } else {
      if (drinkingNow) { drinkingNow = false; me.drinking = false; send({ t: 'dr', v: 0 }); }
      drinkT = Math.max(0, drinkT - dt * 2500);
    }
    const p = clamp((drinkT / drinkDur) * 100, 0, 100);
    $('btn-drink').style.setProperty('--p', p.toFixed(1));
    $('btn-drink').classList.toggle('on', drinkingNow);
    vmPose.drinkP = drinkingNow ? drinkT / drinkDur : 0;
  }
  async function finishBeer(stillHolding) {
    me.beers++; me.bac += 1;
    updateStatus();
    FT.audio.burp();
    send({ t: 'bw', b: me.beers, d: +drunkLevel().toFixed(2) });
    milestone(me.name, me.beers, true);
    if (me.bac >= KO_BAC) knockOut();
    pushMeta();
    if (session.offline) { localStorage.setItem('buteco:offline:' + new Date().toDateString(), String(me.beers)); refreshRanking(); return; }
    const r = await api.drink({ pid: session.pid, token: session.token, action: 'finish', next: !!stillHolding });
    if (r && r.ok && typeof r.beers === 'number') { me.beers = r.beers; updateStatus(); }
    else if (r && r.ok === false && typeof r.beers === 'number') { me.beers = r.beers; me.bac = Math.max(0, me.bac - 1); updateStatus(); toast('Calma! O barman não deixou beber tão rápido 🍺'); }
    refreshRanking();
  }
  function knockOut() {
    me.koUntil = Date.now() + 10000; me.bac = Math.max(0, me.bac - 6);
    drinkingNow = false; me.drinking = false; drinkT = 0;
    send({ t: 'dr', v: 0 }); send({ t: 'ko', ms: 10000 }); FT.audio.thud();
    toast('Você apagou! 😵💤');
  }

  // ---------------- HOMEM / baseado ----------------
  let dlgTimer = null;
  function say(text, opts) {
    $('dialog').hidden = false; releaseLock();
    $('dlg-text').textContent = ''; const optsEl = $('dlg-opts'); optsEl.innerHTML = '';
    clearInterval(dlgTimer);
    let i = 0;
    const showOpts = () => {
      optsEl.innerHTML = '';
      opts.forEach((o) => { const b = document.createElement('button'); b.textContent = o.label; b.onclick = () => { FT.audio.blip(); o.fn(); }; optsEl.appendChild(b); });
    };
    dlgTimer = setInterval(() => { i += 2; $('dlg-text').textContent = text.slice(0, i); if (i >= text.length) { clearInterval(dlgTimer); showOpts(); } }, 22);
    $('dialog').onclick = (e) => { if (e.target.closest('button')) return; if (i < text.length) { i = text.length; $('dlg-text').textContent = text; clearInterval(dlgTimer); showOpts(); } };
  }
  function closeDialog() { clearInterval(dlgTimer); $('dialog').hidden = true; relock(); }
  function talkHomem() {
    if (me.hasJoint) return say('Já tá com um na mão, parceiro. Vai fumar, vai! 😏', [{ label: 'Beleza', fn: closeDialog }]);
    if (Date.now() < me.jointReadyAt) return say('Calma, calma... acabou de fumar. Volta daqui uns minutinhos. 🤫', [{ label: 'Tá bom', fn: closeDialog }]);
    say('Psiu... vem cá. Tá procurando alguma coisa pra... relaxar?', [
      { label: 'Sei lá, tem o quê?', fn: () => say('Tenho um baseadinho aqui. Cortesia da casa. Mas fica entre nós, hein? 🤫', [
        { label: 'Pegar o baseado 🚬', fn: giveJoint }, { label: 'Melhor não', fn: closeDialog }]) },
      { label: 'Tô de boa', fn: closeDialog },
    ]);
  }
  function giveJoint() {
    me.hasJoint = true; $('btn-smoke').hidden = false; FT.audio.pop();
    say('Toma. Fuma por aí... depois me procura se quiser outro.', [{ label: 'Valeu! 🙏', fn: closeDialog }]);
    toast('Você ganhou um baseado 🚬');
  }
  function startSmoking() {
    if (!me.hasJoint || me.smoking || isKO()) return;
    if (dialogOpen()) closeDialog();
    me.hasJoint = false; me.smoking = true; me.smokeLeft = 6.5; me.puffT = 0;
    me.redUntil = Date.now() + 90000; $('btn-smoke').hidden = true;
    send({ t: 'sm', v: 1, rd: 90000 }); FT.audio.puff();
  }
  function endSmoking() {
    me.smoking = false; me.redUntil = Date.now() + 90000; me.jointReadyAt = Date.now() + 40000;
    psyStart = performance.now(); psyEnd = psyStart + 60000;
    send({ t: 'sm', v: 0, rd: 90000 }); pushMeta(); FT.audio.psy();
    toast('Eita... tá tudo colorido 🌈👁️');
  }
  const npcP = new THREE.Vector3();
  function npcInfo() {
    const dx = BAR.npcPos.x - me.x, dz = BAR.npcPos.z - me.z, d = Math.hypot(dx, dz);
    const fwd = [-Math.sin(yaw), -Math.cos(yaw)];
    const dot = d > 0 ? (fwd[0] * dx + fwd[1] * dz) / d : 1;
    return { d, near: d < 3.4 && dot > 0.75 };
  }

  // ---------------- pointer lock / entrada ----------------
  function lockNow() { if (!isTouch && running && post.canvas.requestPointerLock) { try { const p = post.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ok */ } } }
  function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  function relock() { if (!$('ranking').hidden || dialogOpen() || document.activeElement === $('chatinput')) return; lockNow(); }
  function syncPause() { $('pause').hidden = !running || isTouch || locked || !$('ranking').hidden || dialogOpen() || document.activeElement === $('chatinput'); }

  function openChat() {
    releaseLock(); $('chatform').classList.add('open'); $('chatinput').focus(); syncPause();
  }
  function slur(text, d) {
    if (d < 0.25) return text;
    let out = '';
    for (const ch of text) { out += ch; if (/[a-zà-úA-Z]/.test(ch) && Math.random() < d * 0.2) out += ch; if (Math.random() < d * 0.04) out += '…'; }
    if (d > 0.45 && Math.random() < 0.5) out += ' *hic*';
    return out;
  }

  const handlers = [];
  function on(el, ev, fn, o) { el.addEventListener(ev, fn, o); handlers.push([el, ev, fn, o]); }
  function bindInput() {
    on(document, 'pointerlockchange', () => {
      locked = document.pointerLockElement === post.canvas;
      if (!locked) { for (const k in keys) keys[k] = false; holdMouse = false; holdKey = false; }
      syncPause();
    });
    on(document, 'mousemove', (e) => { if (!locked) return; yaw -= e.movementX * 0.0022; pitch = clamp(pitch - e.movementY * 0.0022, -1.45, 1.45); });
    on(post.canvas, 'mousedown', (e) => { if (!running) return; FT.audio.init(); if (!locked && !isTouch) { lockNow(); return; } if (e.button === 0) holdMouse = true; });
    on(window, 'mouseup', (e) => { if (e.button === 0) holdMouse = false; });
    on($('pause'), 'click', () => { FT.audio.init(); $('chatform').classList.remove('open'); $('chatinput').blur(); lockNow(); });

    on(window, 'keydown', (e) => {
      if (!running) return;
      const inChat = document.activeElement === $('chatinput');
      if (e.key === 'Escape') { $('chatinput').blur(); $('chatform').classList.remove('open'); if (dialogOpen()) closeDialog(); closeRanking(); syncPause(); return; }
      if (inChat) return;
      if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
      if (e.code === 'Tab') { e.preventDefault(); if ($('ranking').hidden) openRanking(); else closeRanking(); return; }
      if (e.code === 'Space') { e.preventDefault(); holdKey = true; return; }
      if (e.code === 'KeyE') { if (me.hasJoint) startSmoking(); else if (npcInfo().near && !dialogOpen()) talkHomem(); return; }
      keys[e.code] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    on(window, 'keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') holdKey = false; });
    on(window, 'blur', () => { for (const k in keys) keys[k] = false; holdKey = holdBtn = holdMouse = false; });

    const db = $('btn-drink');
    const down = (e) => { e.preventDefault(); FT.audio.init(); holdBtn = true; try { db.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } };
    const up = () => { holdBtn = false; };
    on(db, 'pointerdown', down); on(db, 'pointerup', up); on(db, 'pointercancel', up); on(db, 'lostpointercapture', up);
    on(db, 'contextmenu', (e) => e.preventDefault());
    on($('btn-smoke'), 'click', startSmoking);
    on($('btn-use'), 'click', () => { if (npcInfo().near && !dialogOpen()) talkHomem(); });
    on($('btn-board'), 'click', openRanking);
    on($('rank-close'), 'click', () => { closeRanking(); relock(); syncPause(); });
    on($('ranking'), 'pointerdown', (e) => { if (e.target === $('ranking')) { closeRanking(); syncPause(); } });
    on($('btn-sound'), 'click', () => { FT.audio.init(); FT.audio.setMuted(!FT.audio.muted); $('btn-sound').textContent = FT.audio.muted ? '🔇' : '🔊'; });
    on($('btn-chat'), 'click', () => { $('chatform').classList.toggle('open'); if ($('chatform').classList.contains('open')) $('chatinput').focus(); });
    on($('chatinput'), 'blur', () => setTimeout(syncPause, 50));
    on($('chatform'), 'submit', (e) => {
      e.preventDefault();
      const inp = $('chatinput');
      let text = inp.value.replace(/[<>]/g, '').trim().slice(0, 80);
      inp.value = ''; inp.blur(); $('chatform').classList.remove('open');
      if (text && running) { text = slur(text, drunkVis); addLog(me.name, text, false); send({ t: 'ch', m: text }); mySay(text); }
      relock();
    });

    // olhar com o dedo (celular)
    const lz = $('lookzone');
    let lp = null;
    on(lz, 'pointerdown', (e) => { if (lp != null) return; lp = { id: e.pointerId, x: e.clientX, y: e.clientY }; lz.setPointerCapture(e.pointerId); FT.audio.init(); });
    on(lz, 'pointermove', (e) => { if (!lp || e.pointerId !== lp.id) return; yaw -= (e.clientX - lp.x) * 0.0055; pitch = clamp(pitch - (e.clientY - lp.y) * 0.0055, -1.4, 1.4); lp.x = e.clientX; lp.y = e.clientY; });
    const lend = (e) => { if (lp && e.pointerId === lp.id) lp = null; };
    on(lz, 'pointerup', lend); on(lz, 'pointercancel', lend);

    // joystick
    const joyEl = $('joy'), knob = $('joy-knob'), R = 50;
    const moveJoy = (e) => {
      const r = joyEl.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy); if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      const m = Math.hypot(dx, dy) / R; joy.x = m < 0.15 ? 0 : dx / R; joy.y = m < 0.15 ? 0 : dy / R;
    };
    on(joyEl, 'pointerdown', (e) => { e.preventDefault(); FT.audio.init(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
    on(joyEl, 'pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
    const jend = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
    on(joyEl, 'pointerup', jend); on(joyEl, 'pointercancel', jend);
  }
  function unbindInput() { handlers.forEach(([el, ev, fn, o]) => el.removeEventListener(ev, fn, o)); handlers.length = 0; }

  // meu próprio balão: aparece como toast de chat (câmera em 1ª pessoa não vê a própria cabeça)
  function mySay() { /* o texto já aparece no log do chat */ }

  // ---------------- atualização ----------------
  let lastSent = { x: 1e9, z: 1e9, ry: 1e9, sp: -1 }, lastSendT = 0, metaSig = '';
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), DOWN = new THREE.Vector3(0, -1, 0);
  function update(dt, t) {
    if (!running) return;
    const ko = isKO();
    if (me.koWas && !ko) { toast('Você acordou 🥴'); }
    me.koWas = ko;
    const dl = drunkLevel();

    // movimento
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
    if (ko || me.smoking || dialogOpen()) { f = s = 0; }
    const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    if (dl > 0 && (f || s)) {
      const w = Math.sin(t * 2.1) * dl * 0.8 + Math.sin(t * 5.7) * dl * 0.3;
      const c = Math.cos(w), sn = Math.sin(w), nf = f * c - s * sn; s = f * sn + s * c; f = nf;
    }
    const sprint = keys.ShiftLeft || keys.ShiftRight ? 1.45 : 1;
    const speed = SPEED * sprint * (drinkingNow ? 0.55 : 1) * (1 - dl * 0.22);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const tvx = (fx * f + rx * s) * speed, tvz = (fz * f + rz * s) * speed;
    me.vx += (tvx - me.vx) * Math.min(1, dt * 9); me.vz += (tvz - me.vz) * Math.min(1, dt * 9);
    me.x += me.vx * dt; me.z += me.vz * dt;
    bar.collide(me, 0.32);
    const sp = Math.hypot(me.vx, me.vz);
    bobPhase += dt * (4 + sp * 1.6) * (sp > 0.1 ? 1 : 0);

    me.bac = Math.max(0, me.bac - dt / 50);
    if (me.smoking) {
      me.smokeLeft -= dt; me.puffT -= dt;
      if (me.puffT <= 0) { me.puffT = 1.2; FT.audio.puff(); puffCd = 0.1; }
      if (me.smokeLeft <= 0) endSmoking();
    }
    updateDrink(dt);

    // rede
    const now = performance.now();
    const sig = Math.round(sp * 4);
    const moved = Math.hypot(me.x - lastSent.x, me.z - lastSent.z) > 0.04, turned = Math.abs(angDiff(lastSent.ry, yaw)) > 0.12;
    if ((moved || turned || sig !== lastSent.sp) && now - lastSendT > 250) {
      lastSendT = now; lastSent = { x: me.x, z: me.z, ry: yaw, sp: sig };
      send({ t: 'mv', x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +yaw.toFixed(2), vx: +me.vx.toFixed(2), vz: +me.vz.toFixed(2), d: +dl.toFixed(2) });
      if (sig === 0) pushMeta();
    }

    // câmera
    const bob = Math.sin(bobPhase) * 0.035 * Math.min(1, sp / 2);
    const bobX = Math.cos(bobPhase * 0.5) * 0.02 * Math.min(1, sp / 2);
    let camY = EYE_HEIGHT + bob;
    if (ko) camY = 0.4;
    camera.position.set(me.x + Math.cos(yaw) * bobX, camY, me.z - Math.sin(yaw) * bobX);
    const sway = dl * (Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.02);
    const dPitch = dl * Math.sin(t * 0.7) * 0.05 + vmPose.lift * 0.28;
    camera.rotation.order = 'YXZ';
    camRoll += ((ko ? 0.9 : sway) - camRoll) * Math.min(1, dt * 4);
    camera.rotation.set(clamp(pitch + dPitch + (ko ? 1.1 : 0), -1.5, 1.5), yaw + dl * Math.sin(t * 0.5) * 0.06, camRoll);

    // modelo em 1ª pessoa
    vmPose.lift += ((me.drinking ? 1 : 0) - vmPose.lift) * Math.min(1, dt * 7);
    vmPose.smoke += ((me.smoking ? 1 : 0) - vmPose.smoke) * Math.min(1, dt * 6);
    const lf = vmPose.lift, sm = vmPose.smoke, idleB = Math.sin(bobPhase) * 0.012 * Math.min(1, sp / 2) + Math.sin(t * 1.5) * 0.004;
    const dp = vmPose.drinkP;
    const wI = 1 - lf - sm;
    const mix = (i, d, s) => i * wI + d * lf + s * sm;
    const pv = [mix(0.3, 0.3, 0.3), mix(-0.42, -0.46, -0.46) + idleB, mix(-0.1, -0.1, -0.1)];
    const aim = [mix(0.25, 0.11 - dp * 0.05, 0.07), mix(-0.24, -0.1 + dp * 0.05, -0.08), mix(-0.48, -0.45 + dp * 0.13, -0.32)];
    const ax = clamp(camera.aspect / 1.3, 0.5, 1); pv[0] *= ax; aim[0] *= ax;
    armPivot.position.set(pv[0], pv[1], pv[2]);
    tmpV.set(aim[0] - pv[0], aim[1] - pv[1], aim[2] - pv[2]).normalize();
    armPivot.quaternion.setFromUnitVectors(DOWN, tmpV);
    const rot = 0;
    mug.visible = lf > 0.05 || !me.smoking; mug.visible = !me.smoking;
    tmpQ.setFromEuler(tmpE.set(lf * (0.1 + dp * 1.3), 0, 0)); mug.quaternion.copy(armPivot.quaternion).invert().multiply(tmpQ);
    mug.position.set(0.0, 0.0, 0);
    mug.userData.setLevel(drinkingNow || lf > 0.1 ? 1 - dp * 0.97 : 1);
    joint.visible = me.smoking || sm > 0.1;
    tmpQ.setFromEuler(tmpE.set(0.3, -0.5, 0.2)); joint.quaternion.copy(armPivot.quaternion).invert().multiply(tmpQ);
    joint.position.set(0, 0.02, -0.04);
    joint.userData.ember.scale.setScalar(1 + Math.sin(t * 14) * 0.25);
    vm.visible = !ko;

    // fumaça em 1ª pessoa
    puffCd -= dt;
    if (puffCd <= 0 && me.smoking) { puffCd = 0.35; const q = fpPuffs.find((x) => x.userData.t < 0); if (q) { q.userData.t = 0; q.position.set(0.05, -0.12, -0.35); } }
    fpPuffs.forEach((q) => {
      if (q.userData.t < 0) return;
      q.userData.t += dt; const k = q.userData.t / 2.4;
      if (k >= 1) { q.userData.t = -1; q.material.opacity = 0; return; }
      q.position.set(0.05 + Math.sin(q.userData.t * 2) * 0.05, -0.12 + k * 0.35, -0.35 - k * 0.15);
      q.scale.setScalar(0.08 + k * 0.35); q.material.opacity = Math.sin(k * Math.PI) * 0.35;
    });

    // outros jogadores
    players.forEach((p) => {
      const age = Math.min(0.7, (now - p.rt) / 1000);
      const tx = p.rx + p.vx * age, tz = p.rz + p.vz * age;
      const k = Math.min(1, dt * 7);
      p.x += (tx - p.x) * k; p.z += (tz - p.z) * k;
      const a = p.av, st = a.st;
      a.root.position.set(p.x, 0, p.z);
      a.root.rotation.y += angDiff(a.root.rotation.y, p.ry + Math.PI) * Math.min(1, dt * 8);
      const spd = Math.hypot(p.vx, p.vz) * (age < 0.7 ? 1 : 0);
      st.speed += (clamp(spd / 3, 0, 1.2) - st.speed) * Math.min(1, dt * 8);
      const pko = Date.now() < p.koUntil;
      st.drink = p.drinking && !pko ? 1 : 0; st.smoke = p.smoking && !pko ? 1 : 0; st.ko = pko ? 1 : 0; st.drunk = p.drunk;
      a.setRed(Date.now() < p.redUntil);
      a.update(dt);
      if (st.smoke && Math.random() < dt * 1.2) { /* fumaça de terceiros é discreta */ }
    });

    // interação com o HOMEM
    const ni = npcInfo();
    const showUse = ni.near && !dialogOpen() && !me.hasJoint;
    $('prompt').hidden = !showUse && !me.hasJoint ? true : !(showUse || (me.hasJoint && !me.smoking));
    if (!$('prompt').hidden) $('prompt').textContent = me.hasJoint ? (isTouch ? '🚬 toque em FUMAR' : '🚬 aperte E pra fumar') : (isTouch ? '✋ toque em FALAR' : '✋ E — falar com o homem');
    $('btn-use').hidden = !isTouch || !showUse;
    if (!isTouch) $('crosshair').style.opacity = showUse ? 1 : 0.7;

    // olhos do NPC acompanham o jogador (cabeça gira de leve)
    const npcHead = bar.npc.P.head;
    if (npcHead) { const a = Math.atan2(me.x - BAR.npcPos.x, me.z - BAR.npcPos.z) - bar.npc.root.rotation.y; npcHead.rotation.y += (clamp(a, -0.8, 0.8) * (ni.d < 6 ? 1 : 0) - npcHead.rotation.y) * Math.min(1, dt * 3); }

    // efeitos de tela
    drunkVis += (dl - drunkVis) * Math.min(1, dt * 1.2);
    if (psyEnd > now) { const el = (now - psyStart) / 1000, left = (psyEnd - now) / 1000; psyVis = Math.min(1, el / 3, left / 10); }
    else psyVis += (0 - psyVis) * Math.min(1, dt * 2);
    if (psyVis < 0.004) psyVis = 0;
    let lid = 0;
    if (drunkVis > 0.5) lid = (drunkVis - 0.5) * 2 * 0.5 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + Math.sin(t * 0.3) * 2), 3);
    if (ko) lid = 0.95;
    post.setEffects(t, drunkVis, psyVis, lid);
    camera.fov = 72 + clamp(1.2 - camera.aspect, 0, 0.8) * 30 + psyVis * 8 * Math.sin(t * 0.8) + drunkVis * 3;
    camera.updateProjectionMatrix();

    if (Math.floor(t / 0.25) !== update._h) { update._h = Math.floor(t / 0.25); updateStatus(); }
    if (t - (update._start || (update._start = t)) > 18) $('hint').classList.add('gone');
    bar.update(dt, t);
  }

  // ---------------- início / fim ----------------
  function start(sess) {
    session = sess;
    const look = S.sanitizeLook(sess.look);
    let beers = sess.beers | 0;
    if (sess.offline) { const v = parseInt(localStorage.getItem('buteco:offline:' + new Date().toDateString()) || '0', 10); beers = isNaN(v) ? 0 : v; }
    me = { pid: sess.pid, name: sess.name, look, x: BAR.spawn.x + rnd(-0.8, 0.8), z: BAR.spawn.z + rnd(-0.3, 0.3), vx: 0, vz: 0, beers, bac: 0, hasJoint: false, jointReadyAt: 0, smokeLeft: 0, puffT: 0, koUntil: 0, koWas: false, redUntil: 0, drinking: false, smoking: false };
    // se voltou no mesmo dia, o álcool "volta" proporcional (aprox.)
    const bacKey = 'buteco:bac:' + sess.pid;
    try { const b = JSON.parse(localStorage.getItem(bacKey) || 'null'); if (b && new Date().toDateString() === b.d) me.bac = Math.max(0, b.v - (Date.now() - b.t) / 50000); } catch (e) { /* ok */ }
    yaw = Math.PI; pitch = 0; // olhando pro balcão (-z)
    yaw = 0;
    buildViewModel(look);
    drinkT = 0; drinkingNow = false; holdBtn = holdKey = holdMouse = false;
    drunkVis = Math.min(1, drunkLevel()); psyVis = 0; psyEnd = 0;
    update._start = 0;
    players.clear();
    $('chatlog').innerHTML = ''; $('btn-smoke').hidden = true; $('dialog').hidden = true; $('ranking').hidden = true; $('hint').classList.remove('gone'); $('prompt').hidden = true;
    $('btn-sound').textContent = FT.audio.muted ? '🔇' : '🔊';
    // retrato do HOMEM
    const fc = $('dlg-face').getContext('2d'); fc.imageSmoothingEnabled = false; fc.clearRect(0, 0, 72, 72);
    fc.drawImage(S.get(S.HOMEM_LOOK, {}), 4, 0, 32, 30, 0, 0, 72, 68);
    updateStatus(); updateOnline(); setNetLabel('connecting');
    $('screen-game').hidden = false;
    running = true;
    bindInput();
    syncPause();
    camera.position.set(me.x, EYE_HEIGHT, me.z);
    camera.rotation.set(0, yaw, 0);

    net = FT.createNet({
      room: cfg.room || 'buteco-fiotoes-v2', sid, cfg: { SUPABASE_URL: cfg.supabaseUrl, SUPABASE_ANON_KEY: cfg.supabaseAnonKey }, meta: getMeta(),
      onMsg, onPeer: addPeer, onPeerUpdate: updatePeer, onLeave: removePeer, onStatus: setNetLabel,
    });
    addLog(null, 'Você entrou no Buteco FIOTÕES. Bora beber! 🍺', true);
    if (isTouch && matchMedia('(orientation: portrait)').matches) toast('Dica: vire o celular na horizontal 📱↔️');
    refreshRanking(); rankTimer = setInterval(refreshRanking, 10000);
    lockNow();
  }
  function stop() {
    running = false;
    try { localStorage.setItem('buteco:bac:' + me.pid, JSON.stringify({ d: new Date().toDateString(), v: me.bac, t: Date.now() })); } catch (e) { /* ok */ }
    clearInterval(rankTimer); clearTimeout(rankSoon);
    unbindInput(); releaseLock();
    players.forEach((p) => { bar.scene.remove(p.av.root); p.av.dispose(); }); players.clear();
    if (net) { send({ t: 'sm', v: 0 }); net.close(); net = null; }
    post.setEffects(0, 0, 0, 0);
    camera.fov = 72; camera.updateProjectionMatrix();
    $('pause').hidden = true; $('screen-game').hidden = true; $('prompt').hidden = true;
  }
  window.addEventListener('beforeunload', () => { if (me && running) { try { localStorage.setItem('buteco:bac:' + me.pid, JSON.stringify({ d: new Date().toDateString(), v: me.bac, t: Date.now() })); } catch (e) { /* ok */ } } });

  const debug = {
    get me() { return me; }, players, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, set pitch(v) { pitch = v; },
    set bac(v) { me.bac = v; }, finishBeer, startSmoking, endSmoking, get drunk() { return drunkVis; }, get psy() { return psyVis; },
    teleport(x, z) { me.x = x; me.z = z; }, tick(n, dt) { for (let i = 0; i < n; i++) update(dt || 0.05, performance.now() / 1000); },
  };
  return { start, stop, update, debug, get running() { return running; } };
}
