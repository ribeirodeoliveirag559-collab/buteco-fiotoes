// Jogo em primeira pessoa: movimento, câmera, cerveja, baseado, HOMEM, chat, multiplayer.
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { createAvatar, EYE_HEIGHT, lookColors, makeMug, makeJoint, makeBottle, makeVape } from './avatar.js';
import { createMusic, parseYouTube } from './music.js';
import { toTex } from './textures.js';
import { BAR } from './bar.js';
import { api } from './api.js';
import { ic, esc, setIcon, drawIcon } from './ui-icons.js';
import { createVoice } from './voice.js';

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
// limites do mundo (salão + banheiro a oeste + camarote a leste) pra posição dos outros jogadores
const WX0 = -14.3, WX1 = 18, WZ0 = -6.6, WZ1 = 6.6;
const PEE_SECONDS = 4.8, PEE_RELIEF = 4, PEE_COOLDOWN_MS = 25000; // urinar baixa 4 pontos de embriaguez (de 20)
const BOTTLE_SERVINGS = 5; // cada garrafa rende até 5 copos
const MAX_BAC = 20; // a partir daqui o personagem cai e levanta sem parar até o nível baixar

export function createGame({ bar, camera, post, cfg, quality, onWardrobe }) {
  const sid = uid();
  let me = null, running = false, session = null;
  const players = new Map();
  let net = null, locked = false;
  let voiceTimer = null;
  let rankRows = [], rankDay = '', rankMode = 'online', rankTimer = null, rankSoon = null, lastWinner = null;
  let vipAllowed = false, vipRank = 0;

  // entrada
  const keys = {};
  const joy = { x: 0, y: 0, id: null };
  let holdBtn = false, holdKey = false, holdMouse = false;
  let yaw = Math.PI, pitch = 0;

  // efeitos
  let drunkVis = 0, psyVis = 0, psyStart = 0, psyEnd = 0, bobPhase = 0, camRoll = 0;
  let fallT = 4, stumbleT = 4, camYs = EYE_HEIGHT, koPitch = 0, lidKo = 0, camKick = 0;

  // ---------------- modelo em primeira pessoa (braço + caneca) ----------------
  const vm = new THREE.Group();
  camera.add(vm);
  const armPivot = new THREE.Group(); vm.add(armPivot);
  const hand = new THREE.Group(); armPivot.add(hand);
  const mug = makeMug(); const joint = makeJoint(); const vapeDev = makeVape();
  hand.add(mug, joint, vapeDev);
  mug.scale.setScalar(1.0); joint.visible = false; vapeDev.visible = false;
  // garrafa que serve o copo + fio de cerveja
  const fpBottle = makeBottle(); fpBottle.visible = false; fpBottle.scale.setScalar(0.72); vm.add(fpBottle);
  const fpStream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: 0xf2a81d })); fpStream.visible = false; vm.add(fpStream);
  const armPivotL = new THREE.Group(); armPivotL.visible = false; vm.add(armPivotL);
  let armMesh = null, armMeshL = null;
  const vmPose = { lift: 0, smoke: 0, drinkP: 0 };
  function noDepth(o) {
    o.traverse((c) => { if (c.isMesh) { c.renderOrder = 50; (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.depthTest = false; }); } });
  }
  function buildViewModel(look) {
    if (armMesh) { armPivot.remove(armMesh); armMesh.geometry.dispose(); }
    const col = lookColors(look);
    const tex = toTex(col.armCanvas, { nearest: true });
    const geo = rbox(0.075, 0.42, 0.075); geo.translate(0, -0.21, 0);
    const side = new THREE.MeshLambertMaterial({ map: tex });
    armMesh = new THREE.Mesh(geo, [side, side, new THREE.MeshLambertMaterial({ color: col.shirt }), new THREE.MeshLambertMaterial({ color: col.skin }), side, side]);
    armPivot.add(armMesh);
    if (armMeshL) { armPivotL.remove(armMeshL); armMeshL.geometry.dispose(); }
    armMeshL = new THREE.Mesh(geo.clone(), armMesh.material);
    armPivotL.add(armMeshL); noDepth(armMeshL);
    hand.position.set(0, -0.42, 0);
    noDepth(armMesh); noDepth(mug); noDepth(joint); noDepth(vapeDev); noDepth(fpBottle); noDepth(fpStream);
  }
  // luz própria pro braço (fica sempre visível mesmo no escuro)
  const vmLight = new THREE.PointLight(0xffe0b0, 1.4, 2.5, 2);
  vmLight.position.set(0.1, 0.2, 0.3); camera.add(vmLight);

  // jato do xixi (primeira pessoa) + respingos
  const fpPee = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.012, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffe93a, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }));
  fpPee.visible = false; fpPee.renderOrder = 55; camera.add(fpPee);
  const peeSplash = [];
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffe93a, transparent: true, depthTest: false, depthWrite: false, opacity: 0, toneMapped: false }));
    sp.renderOrder = 56; sp.userData = { t: Math.random() }; camera.add(sp); peeSplash.push(sp);
  }

  // fumaça em primeira pessoa
  const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fpPuffs = [];
  for (let i = 0; i < 10; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    s.renderOrder = 60; s.userData = { t: -1 }; camera.add(s); fpPuffs.push(s);
  }
  let puffCd = 0;
  // nuvens GRANDES do cigarro eletrônico (em cima da tela) e fumaça no mundo (pros outros jogadores)
  const fpClouds = [];
  for (let i = 0; i < 30; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, color: 0xeaf6ff }));
    c.renderOrder = 61; c.userData = { t: -1 }; camera.add(c); fpClouds.push(c);
  }
  const worldPuffs = [];
  for (let i = 0; i < 240; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0, color: 0xf2f8ff }));
    c.userData = { t: -1 }; bar.scene.add(c); worldPuffs.push(c);
  }
  function emitWorldSmoke(x, y, z, n, big) {
    for (let i = 0; i < n; i++) {
      const c = worldPuffs.find((q) => !q.userData.life); if (!c) return;
      c.userData = { t: -(big ? i * 0.03 : i * 0.05), life: big ? rnd(14, 22) : rnd(8, 13), vx: rnd(-0.55, 0.55) + (big ? Math.sin(i) * 0.4 : 0), vy: rnd(0.08, 0.3), vz: rnd(-0.55, 0.55), s0: big ? 0.3 : 0.12, s1: big ? rnd(2.6, 4.6) : rnd(1.0, 1.8), seed: Math.random() * 100, op: big ? 0.36 : 0.3 };
      c.position.set(x + rnd(-0.1, 0.1), y, z + rnd(-0.1, 0.1));
    }
  }
  function emitBigCloud(amount = 1) {
    for (let i = 0; i < Math.round(fpClouds.length * amount); i++) {
      const c = fpClouds[i];
      c.userData = { t: -rnd(0, 0.7), life: rnd(4.5, 6.5), x: rnd(-0.55, 0.55), y: rnd(-0.3, 0.4), z: -rnd(0.45, 1.1), dx: rnd(-0.06, 0.06), dy: rnd(0.02, 0.1), s1: rnd(1.6, 3.2) };
    }
  }
  const music = createMusic({ toast });

  // ---------------- HUD / avisos ----------------
  function toast(text, icon = 'info') {
    const d = document.createElement('div'); d.innerHTML = ic(icon) + '<span>' + esc(text) + '</span>'; $('toast').appendChild(d); setTimeout(() => d.remove(), 3700);
  }
  function popPlus(text, icon) {
    const d = document.createElement('div'); d.className = 'plus'; d.innerHTML = ic(icon) + '<b>' + esc(text) + '</b>';
    document.body.appendChild(d); setTimeout(() => d.remove(), 1600);
  }
  function confetti() {
    const c = document.createElement('canvas'); c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    const g = c.getContext('2d'), cols = ['#ff3d8b', '#ffb43a', '#38e1ff', '#4be37a', '#c27aff', '#fff'];
    const P = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    (function step(now) {
      const k = (now - t0) / 2400; g.clearRect(0, 0, c.width, c.height);
      P.forEach((p) => { p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.2; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - k); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (k < 1) requestAnimationFrame(step); else c.remove();
    })(t0);
  }
  function addLog(name, text, sys, icon) {
    const log = $('chatlog'), d = document.createElement('div');
    if (sys) { d.className = 'sys'; d.innerHTML = (icon ? ic(icon) + ' ' : '') + esc(text); } else { const b = document.createElement('b'); b.textContent = name + ': '; d.append(b, document.createTextNode(text)); }
    log.appendChild(d);
    while (log.children.length > 7) log.removeChild(log.firstChild);
    setTimeout(() => d.remove(), 16000);
  }
  function updateOnline() { $('online').innerHTML = ic('users') + ' ' + (players.size + 1); }
  function levelLabel(b) { return b < 3 ? 'Sóbrio' : b < 6 ? 'Alegrinho' : b < 9 ? 'Animado' : b < 12 ? 'Tropeçando' : b < 16 ? 'Muito bêbado' : b < MAX_BAC ? 'Chapado' : 'Caindo de bêbado'; }
  function updateStatus() {
    $('beer-n').textContent = me.beers;
    $('pts-n').textContent = me.points;
    $('vape-n').textContent = me.vape;
    $('vape-chip').hidden = me.vape <= 0;
    $('bottle-n').textContent = me.bottle; $('bottle-chip').hidden = me.bottle <= 0;
    $('btn-vape').hidden = me.vape <= 0;
    $('level-label').textContent = levelLabel(me.bac);
    $('level-bar').style.width = clamp((me.bac / MAX_BAC) * 100, 0, 100) + '%';
  }
  let netWarned = false;
  function setNetLabel(s, why) {
    const el = $('netmode');
    if (s === 'error' && !netWarned) { netWarned = true; toast('Sem conexão com o tempo real (' + String(why || 'falha').slice(0, 70) + '). Tentando de novo sozinho…', 'wifi-off'); }
    if (s === 'online') netWarned = false;
    if (isTouch) { el.innerHTML = '<i class="dot ' + (s === 'online' ? 'on' : s === 'error' ? 'off' : s === 'local' ? 'warn' : 'wait') + '"></i>'; el.title = s === 'online' ? 'Conectado' : s === 'local' ? 'Modo teste' : s === 'error' ? 'Sem conexão: ' + (why || '') : 'Conectando…'; el.setAttribute('aria-label', el.title); return; }
    el.innerHTML = s === 'online' ? '<i class="dot on"></i>online' : s === 'local' ? ic('flask-conical') + ' teste' : s === 'error' ? ic('wifi-off') + ' offline' : '…';
    el.title = s === 'local' ? 'Modo teste: só enxerga outras abas deste navegador (configure o Supabase Realtime).' : s === 'error' ? 'Sem tempo real: ' + (why || 'falha de conexão') + '. Tentando de novo…' : '';
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
    lastWinner = r && r.lastWinner ? r.lastWinner : lastWinner;
    bar.drawPoster(rankRows, rankDay, me.pid, rankMode, lastWinner);
    updateVip();
    if (!$('ranking').hidden) fillRankingModal();
  }
  function updateVip() {
    const idx = rankRows.findIndex((r) => r.pid === me.pid);
    vipRank = idx >= 0 ? idx + 1 : 0;
    const allowed = idx >= 0 && idx < 5 && rankRows[idx].beers > 0;
    if (allowed && !vipAllowed) { toast('Você está no TOP 5! O camarote foi liberado pra você', 'party-popper'); confetti(); }
    vipAllowed = allowed;
    bar.setVipOpen(allowed);
    if (!allowed && bar.inVip(me)) { me.x = 8.6; me.z = 0; me.vx = me.vz = 0; toast('Você saiu do top 5 e perdeu a vaga no camarote', 'lock'); }
  }
  function rankSoonFn() { clearTimeout(rankSoon); rankSoon = setTimeout(refreshRanking, 1200); }
  function fillRankingModal() {
    const ol = $('rank-list'); ol.innerHTML = '';
    if (!rankRows.length) { const li = document.createElement('li'); li.textContent = 'Ninguém bebeu ainda… seja o primeiro!'; li.style.counterIncrement = 'none'; ol.appendChild(li); }
    rankRows.forEach((r) => {
      const li = document.createElement('li'); if (r.pid === me.pid) li.className = 'me';
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
      const dot = document.createElement('span'); dot.className = 'dot' + (r.online ? ' on' : '');
      const n = document.createElement('span'); n.className = 'n'; n.innerHTML = r.beers + ' ' + ic('beer');
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
      x: clamp(num(m.x, BAR.spawn.x), WX0, WX1), z: clamp(num(m.z, BAR.spawn.z), WZ0, WZ1), ry: num(m.ry, 0),
      vx: 0, vz: 0, rx: 0, rz: 0, rt: 0, beers: clamp(num(m.b, 0) | 0, 0, 999), drunk: clamp(num(m.d, 0), 0, 1),
      drinking: false, smoking: false, vaping: 0, redUntil: Date.now() + clamp(num(m.rd, 0), 0, 120000), koUntil: 0, lastChat: 0, lastMv: 0, vc: 0,
    };
    adoptMusic(m.mu);
    p.rx = p.x; p.rz = p.z;
    av.root.position.set(p.x, 0, p.z); av.root.rotation.y = p.ry;
    bar.scene.add(av.root);
    players.set(id, p);
    addLog(null, `${p.name} entrou no buteco`, true, 'users');
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
    adoptMusic(m.mu);
    if (m.rd > 0) p.redUntil = Math.max(p.redUntil, Date.now() + clamp(num(m.rd, 0), 0, 120000));
    if (Date.now() - p.lastMv > 2500) { p.x = p.rx = clamp(num(m.x, p.x), WX0, WX1); p.z = p.rz = clamp(num(m.z, p.z), WZ0, WZ1); p.ry = num(m.ry, p.ry); }
  }
  function removePeer(id) {
    const p = players.get(id);
    if (!p) return;
    bar.scene.remove(p.av.root); p.av.dispose();
    if (p.bottleMesh) bar.takeBottle(p.bottleMesh);
    players.delete(id);
    addLog(null, `${p.name} saiu do buteco`, true);
    updateOnline(); rankSoonFn();
  }
  function adoptMusic(mu) {
    if (!Array.isArray(mu) || typeof mu[0] !== 'string' || !/^[\w-]{11}$/.test(mu[0])) return;
    const t0 = num(mu[1], 0);
    if (t0 > Date.now() + 5000 || Date.now() - t0 > 3 * 3600 * 1000) return;
    const cur = music.current;
    if (!cur || t0 > cur.t0 + 1500) music.play({ vid: mu[0], t0, by: String(mu[2] || '').slice(0, 14) });
  }
  function milestone(name, b, mine) {
    if (b >= 5 && b % 5 === 0) { addLog(null, `${mine ? 'Você' : name} já tomou ${b} cervejas!`, true); if (mine) toast(`${b} cervejas!`, 'trophy'); }
  }
  function onMsg(m) {
    if (!m || typeof m !== 'object' || m.id === sid) return;
    const p = players.get(m.id);
    if (!p) return;
    switch (m.t) {
      case 'mv':
        p.lastMv = Date.now(); p.rt = performance.now();
        p.rx = clamp(num(m.x, p.x), WX0, WX1); p.rz = clamp(num(m.z, p.z), WZ0, WZ1); p.ry = num(m.ry, p.ry);
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
      case 'bh': p.holdBottle = !!m.v; break;
      case 'fg': bar.takeFree(Math.floor(num(m.i, -1))); break;
      case 'bp': if (p.bottleMesh) bar.takeBottle(p.bottleMesh); p.bottleMesh = bar.placeBottle({ x: clamp(num(m.x, 0), -10, 18), y: clamp(num(m.y, 1), 0, 2), z: clamp(num(m.z, 0), -7, 7) }); break;
      case 'bt': if (p.bottleMesh) { bar.takeBottle(p.bottleMesh); p.bottleMesh = null; } break;
      case 'vo': voice.signalIn(m); break;
      case 'vc': p.vc = m.v ? 1 : 0; break; // este jogador ligou/desligou a voz
      case 'pe': addLog(null, `${p.name} foi ao banheiro`, true, 'droplets'); break;
      case 'vp': p.vaping = 3; p.vapeEmit = false; FT.audio.vape(); break;
      case 'mus': if (typeof m.vid === 'string' && /^[\w-]{11}$/.test(m.vid)) { music.play({ vid: m.vid, t0: num(m.t0, Date.now()), by: String(m.by || '').slice(0, 14) }); addLog(null, `${p.name} colocou uma música na jukebox`, true); } break;
      case 'mst': music.stop(); addLog(null, `${p.name} parou a jukebox`, true); break;
      case 'sm': p.smoking = !!m.v; if (m.rd > 0) p.redUntil = Date.now() + clamp(num(m.rd, 0), 0, 120000); break;
      case 'th': spawnProjectile({ owner: m.id, x: num(m.x, 0), y: num(m.y, 1.5), z: num(m.z, 0), vx: clamp(num(m.vx, 0), -20, 20), vy: clamp(num(m.vy, 0), -20, 20), vz: clamp(num(m.vz, 0), -20, 20) }); break;
      case 'hit':
        for (const pr of projectiles) if (pr.owner === m.id && pr.alive) { pr.alive = false; shatter(pr.mesh.position.x, pr.mesh.position.y, pr.mesh.position.z); bar.scene.remove(pr.mesh); }
        if (m.to === sid) getHit(clamp(num(m.dx, 0), -1, 1), clamp(num(m.dz, 0), -1, 1));
        else { const v = players.get(m.to); if (v) addLog(null, p.name + ' acertou uma garrafa no ' + v.name, true, 'zap'); }
        break;
      case 'fly': p.flyUntil = Date.now() + clamp(num(m.ms, 0), 0, 3000); p.flyStart = Date.now(); p.flyMs = clamp(num(m.ms, 1000), 300, 3000); break;
      case 'crawl': p.crawlUntil = Date.now() + clamp(num(m.ms, 0), 0, 5000); p.flyUntil = 0; break;
      case 'ko': p.koUntil = Date.now() + clamp(num(m.ms, 0), 0, 15000); p.drinking = false; break;
      case 'ch': {
        const now = performance.now(); if (now - p.lastChat < 500) return; p.lastChat = now;
        const text = String(m.m == null ? '' : m.m).replace(/[<>]/g, '').slice(0, 90); if (!text) return;
        p.av.say(text, 5000); addLog(p.name, text, false); break;
      }
    }
  }
  const send = (o) => { if (net) { o.id = sid; net.send(o); } };
  const getMeta = () => ({ pid: me.pid, n: me.name, l: me.look, x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +yaw.toFixed(2), b: me.beers, d: +drunkLevel().toFixed(2), rd: Math.max(0, me.redUntil - Date.now()), mu: music.current ? [music.current.vid, music.current.t0, music.current.by] : null });
  let metaTimer = null;
  const pushMeta = () => { clearTimeout(metaTimer); metaTimer = setTimeout(() => net && net.setMeta(getMeta()), 500); };

  // ---------------- chat de voz (por proximidade) ----------------
  const turnServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }].concat(cfg && cfg.turn ? [cfg.turn] : []);
  const voice = createVoice({
    sid, iceServers: turnServers, toast,
    signal: (o) => send(Object.assign({ t: 'vo' }, o)),
    onState: (s) => {
      const b = $('btn-voice'); setIcon(b, s === 'on' ? 'mic' : 'mic-off');
      b.classList.toggle('on', s === 'on'); b.classList.toggle('mute', s === 'muted');
      send({ t: 'vc', v: s === 'off' ? 0 : 1 });
      b.title = s === 'off' ? 'Ligar chat de voz (V)' : s === 'on' ? 'Microfone ligado — toque pra silenciar' : 'Microfone mudo — toque pra desligar a voz';
    },
  });
  // ícone de microfone verde sobre a cabeça de quem está falando
  const micTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#25b25a'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#ffffffee'; g.stroke(); drawIcon(g, 'mic', 28, 28, 72, '#ffffff', 2.4); return new THREE.CanvasTexture(c); })();
  function setSpeakIcon(p, on) {
    if (on && !p.speakSprite) {
      p.speakSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: micTex, transparent: true, depthWrite: false }));
      p.speakSprite.scale.set(0.3, 0.3, 1); p.speakSprite.position.set(0, 2.32, 0); p.speakSprite.renderOrder = 12;
      p.av.root.add(p.speakSprite);
    }
    if (p.speakSprite) { p.speakSprite.visible = on; if (on) p.speakSprite.scale.setScalar(0.3 + Math.sin(performance.now() / 120) * 0.025); }
  }

  // ---------------- cerveja: pedir -> servir -> beber ----------------
  let drinkT = 0, drinkDur = DRINK_MS, drinkingNow = false, gulpT = 0, lastHint = 0;
  let pour = null; // { t } animação de servir
  const dialogOpen = () => !$('dialog').hidden;
  const jukeOpen = () => !$('jukebox').hidden;
  function newDur() { return DRINK_MS * rnd(0.92, 1.1) * (1 + drunkLevel() * 0.25); }
  function applyState(st) {
    if (!st) return;
    if (typeof st.beers === 'number') me.beers = st.beers;
    if (typeof st.points === 'number') me.points = st.points;
    if (typeof st.vape === 'number') me.vape = st.vape;
    if (typeof st.bottle === 'number') me.bottle = st.bottle;
    if (typeof st.glass === 'number') me.glass = st.glass;
    updateStatus();
  }
  // servidor (Neon) manda no estado; offline simula igual
  async function barAct(action) {
    if (session.offline) {
      const L = me;
      if (action === 'order' || action === 'grab') { if (L.bottle || L.glass) return { ok: false, reason: L.glass ? 'copo-cheio' : 'ja-tem-garrafa' }; L.bottle = BOTTLE_SERVINGS; return { ok: true, bottle: L.bottle, glass: L.glass }; }
      if (action === 'pour') { if (!L.bottle) return { ok: false, reason: 'sem-garrafa' }; if (L.glass) return { ok: false, reason: 'copo-cheio' }; L.bottle--; L.glass = 1; return { ok: true, bottle: L.bottle, glass: 1 }; }
      if (action === 'start') return L.glass ? { ok: true } : { ok: false, reason: 'sem-copo' };
      if (action === 'finish') { if (!L.glass) return { ok: false, reason: 'sem-copo' }; L.glass = 0; return { ok: true, glass: 0, beers: L.beers, points: L.points }; }
    }
    return api.drink({ pid: session.pid, token: session.token, action });
  }
  function giveBottle() { me.empty = false; me.bottleLoc = 'hand'; FT.audio.pop(); send({ t: 'bh', v: 1 }); toast('A Bella te entregou uma garrafa', 'bottle-wine'); }
  async function orderBeer() {
    if (me.empty) { me.empty = false; me.bottleLoc = null; }
    if (me.glass) return say('Termina esse copo primeiro, amor!', [{ label: 'Tá bom', fn: closeDialog }]);
    if (me.bottle) return say(me.bottleLoc === 'table' ? 'Sua garrafa tá numa mesa, gato. Vai lá pegar!' : 'Você já tá com uma garrafa na mão, amor! Clica pra encher o copo.', [{ label: 'Valeu, Bella', fn: closeDialog }]);
    const r = await barAct('order');
    if (!r || !r.ok) { applyState(r); return say('Opa, deu um tilt aqui… tenta de novo, lindinho!', [{ label: 'Tá', fn: closeDialog }]); }
    applyState(r);
    FT.audio.clink();
    say('Toma, gato! Uma gelada que rende 5 copos. Pode ficar com ela na mão ou deixar numa mesa (tecla G)… mas pra encher o copo tem que estar com ela na mão, hein!', [{ label: 'Valeu!', fn: closeDialog }]);
    setTimeout(() => { if (running && me.bottle && !me.bottleLoc) giveBottle(); }, 900);
  }
  const canPour = () => me.bottleLoc === 'hand' && !me.empty && me.bottle > 0 && !me.glass && !pour;
  // ---- garrafa vazia: dá pra jogar; quem for atingido voa e fica de quatro 3 s ----
  const projectiles = [], shards = [];
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x6a3a12, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.025 + Math.random() * 0.02), shardMat); m.visible = false; m.userData = { t: -1 }; bar.scene.add(m); shards.push(m); }
  function shatter(x, y, z) {
    FT.audio.glass();
    let n = 0;
    for (const m of shards) { if (m.userData.t >= 0) continue; m.visible = true; m.position.set(x, Math.max(0.05, y), z); m.userData = { t: 0, vx: rnd(-2.2, 2.2), vy: rnd(1, 3.2), vz: rnd(-2.2, 2.2), rs: rnd(-10, 10) }; if (++n > 12) break; }
    emitWorldSmoke(x, Math.max(0.1, y), z, 3, false);
  }
  function spawnProjectile(o) {
    const mesh = makeBottle(); mesh.scale.setScalar(0.95);
    mesh.position.set(o.x, o.y, o.z); bar.scene.add(mesh);
    projectiles.push({ mesh, vx: o.vx, vy: o.vy, vz: o.vz, owner: o.owner, t: 0, alive: true });
  }
  function throwBottle() {
    if (!me.empty || isKO() || flying() || crawling()) return;
    me.empty = false; me.bottleLoc = null; send({ t: 'bh', v: 0 });
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    const o = { x: camera.position.x + d.x * 0.5 + Math.cos(yaw) * 0.15, y: camera.position.y - 0.12 + d.y * 0.5, z: camera.position.z + d.z * 0.5 - Math.sin(yaw) * 0.15, vx: d.x * 13, vy: d.y * 13 + 2.6, vz: d.z * 13 };
    spawnProjectile(Object.assign({ owner: sid }, o));
    send({ t: 'th', x: +o.x.toFixed(2), y: +o.y.toFixed(2), z: +o.z.toFixed(2), vx: +o.vx.toFixed(2), vy: +o.vy.toFixed(2), vz: +o.vz.toFixed(2) });
    FT.audio.blip();
  }
  function updateProjectiles(dt) {
    for (const pr of projectiles) {
      if (!pr.alive) continue;
      pr.t += dt; pr.vy -= 12 * dt;
      const m = pr.mesh;
      m.position.x += pr.vx * dt; m.position.y += pr.vy * dt; m.position.z += pr.vz * dt;
      m.rotation.x += dt * 14; m.rotation.z += dt * 6;
      const P = m.position;
      // quem jogou decide se acertou alguém
      if (pr.owner === sid) {
        for (const p of players.values()) {
          if (Date.now() < p.crawlUntil || Date.now() < p.flyUntil) continue;
          if (Math.abs(p.x - P.x) < 0.42 && Math.abs(p.z - P.z) < 0.42 && P.y > 0.1 && P.y < 2.05) {
            const L = Math.hypot(pr.vx, pr.vz) || 1;
            send({ t: 'hit', to: p.id, dx: +(pr.vx / L).toFixed(2), dz: +(pr.vz / L).toFixed(2) });
            toast('Acertou o ' + p.name + '!', 'zap');
            pr.alive = false; break;
          }
        }
      }
      const out = P.y < 0.04 || P.x < -9.9 || P.x > 17.9 || P.z < -6.95 || P.z > 6.95 || pr.t > 3.5;
      if (!pr.alive || out) { pr.alive = false; shatter(P.x, P.y, P.z); bar.scene.remove(m); }
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (!projectiles[i].alive) projectiles.splice(i, 1);
    for (const m of shards) {
      const u = m.userData; if (u.t < 0) continue;
      u.t += dt; u.vy -= 9.8 * dt;
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
      if (m.position.y < 0.02) { m.position.y = 0.02; u.vy *= -0.3; u.vx *= 0.6; u.vz *= 0.6; }
      m.rotation.x += u.rs * dt; m.rotation.y += u.rs * dt;
      if (u.t > 2.2) { u.t = -1; m.visible = false; }
    }
  }
  // atingido: voa, cai e fica de quatro
  const flying = () => !!me.fly;
  const crawling = () => Date.now() < (me.crawlUntil || 0);
  function getHit(dx, dz) {
    if (flying() || crawling()) return;
    drinkingNow = false; me.drinking = false; drinkT = 0; send({ t: 'dr', v: 0 });
    me.fly = { vx: dx * 3.8, vz: dz * 3.8, vy: 6.2 }; me.air = 0;
    send({ t: 'fly', ms: 1100 });
    FT.audio.thud(); camKick = (Math.random() > 0.5 ? 1 : -1) * 1.2;
    toast('Te acertaram com uma garrafa!', 'zap');
  }
  function updateFly(dt) {
    if (!me.fly) return;
    const f = me.fly;
    f.vy -= 12 * dt;
    me.x += f.vx * dt; me.z += f.vz * dt; me.air = Math.max(0, me.air + f.vy * dt);
    bar.collide(me, 0.32);
    if (me.air <= 0 && f.vy < 0) {
      me.fly = null; me.air = 0; me.crawlUntil = Date.now() + 3000;
      send({ t: 'crawl', ms: 3000 }); FT.audio.thud();
      send({ t: 'mv', x: +me.x.toFixed(2), z: +me.z.toFixed(2), ry: +yaw.toFixed(2), vx: 0, vz: 0, d: 0 });
    }
  }
  async function pourBeer() {
    if (!canPour()) return;
    const r = await barAct('pour');
    if (!r || !r.ok) { applyState(r); if (r && r.reason === 'copo-cheio') toast('Seu copo já tá cheio! Bebe primeiro', 'beer'); return; }
    applyState(r);
    // a garrafa continua na mão enquanto ainda tiver cerveja (até 5 copos); vazia, ela some
    if (me.bottle <= 0) { me.empty = true; toast(isTouch ? 'Garrafa vazia! Toque em JOGAR pra arremessar' : 'Garrafa vazia! Clique direito ou Q pra arremessar em alguém', 'bottle-wine'); }
    else toast(`Ainda restam ${me.bottle} copo${me.bottle === 1 ? '' : 's'} nessa garrafa`, 'bottle-wine');
    pour = { t: 0 }; FT.audio.pour();
  }
  const rcPut = new THREE.Raycaster();
  function putDownBottle() {
    if (me.empty) { me.empty = false; me.bottleLoc = null; send({ t: 'bh', v: 0 }); FT.audio.clink(); toast('Garrafa vazia foi pro lixo', 'bottle-wine'); return; }
    if (me.bottleLoc !== 'hand' || pour) return;
    camera.updateMatrixWorld(true); bar.scene.updateMatrixWorld(true);
    rcPut.setFromCamera({ x: 0, y: 0 }, camera); rcPut.far = 3.2;
    const hit = rcPut.intersectObjects(bar.surfaces, false).find((h) => h.face && h.face.normal.y > 0.6);
    if (!hit) { toast('Olhe pra uma mesa ou pro balcão pra deixar a garrafa', 'bottle-wine'); return; }
    me.bottleMesh = bar.placeBottle({ x: hit.point.x, y: hit.point.y, z: hit.point.z });
    me.bottleLoc = 'table'; FT.audio.clink();
    send({ t: 'bp', x: +hit.point.x.toFixed(2), y: +hit.point.y.toFixed(2), z: +hit.point.z.toFixed(2) }); send({ t: 'bh', v: 0 });
  }
  async function grabFree(id) {
    if (me.empty) { me.empty = false; me.bottleLoc = null; }
    if (me.glass) { toast('Bebe o copo que tá na mão primeiro', 'beer'); return; }
    if (me.bottle) { toast('Você já tem uma garrafa', 'bottle-wine'); return; }
    const r = await barAct('grab');
    if (!r || !r.ok) { applyState(r); return; }
    applyState(r);
    if (bar.takeFree(id)) send({ t: 'fg', i: id });
    giveBottle();
  }
  function pickUpBottle() {
    if (me.bottleLoc !== 'table' || !me.bottleMesh) return;
    bar.takeBottle(me.bottleMesh); me.bottleMesh = null; me.bottleLoc = 'hand';
    send({ t: 'bt' }); send({ t: 'bh', v: 1 }); FT.audio.pop();
  }
  function updateDrink(dt) {
    const wantKey = holdBtn || holdKey || holdMouse;
    const want = wantKey && !isKO() && !flying() && !crawling() && !me.smoking && !(me.peeing > 0) && !dialogOpen() && !pour && vapingT <= 0 && $('ranking').hidden && !jukeOpen();
    if (want && !me.glass) {
      const n = performance.now();
      if (n - lastHint > 4500) { lastHint = n; toast(me.bottle ? (me.bottleLoc === 'table' ? 'Pegue a garrafa da mesa e clique pra encher o copo' : 'Clique (ou E) pra encher o copo com a garrafa') : 'Seu copo tá vazio! Peça uma cerveja pra Bella atrás do balcão', 'beer'); }
    }
    const go = want && me.glass;
    if (go) {
      if (!drinkingNow) {
        drinkingNow = true; drinkDur = newDur(); drinkT = 0; me.drinking = true;
        send({ t: 'dr', v: 1 }); FT.audio.clink();
        barAct('start').then((r) => { if (r && r.ok === false && r.reason === 'sem-copo') { applyState(r); drinkingNow = false; me.drinking = false; drinkT = 0; } });
      }
      drinkT += dt * 1000; gulpT -= dt;
      if (gulpT <= 0) { FT.audio.gulp(); gulpT = rnd(0.35, 0.6); }
      if (drinkT >= drinkDur) finishBeer();
    } else {
      if (drinkingNow) { drinkingNow = false; me.drinking = false; send({ t: 'dr', v: 0 }); }
      drinkT = Math.max(0, drinkT - dt * 2500);
    }
    const p = clamp((drinkT / drinkDur) * 100, 0, 100);
    $('btn-drink').style.setProperty('--p', p.toFixed(1));
    $('btn-drink').classList.toggle('on', drinkingNow);
    vmPose.drinkP = drinkingNow ? drinkT / drinkDur : 0;
  }
  async function finishBeer() {
    drinkingNow = false; me.drinking = false; drinkT = 0;
    send({ t: 'dr', v: 0 });
    // otimista: o servidor confirma logo em seguida
    me.glass = 0; me.beers++; me.points++; me.bac += 1;
    popPlus('+1 ponto', 'beer');
    updateStatus(); FT.audio.burp();
    send({ t: 'bw', b: me.beers, d: +drunkLevel().toFixed(2) });
    milestone(me.name, me.beers, true);
    if (me.bac >= MAX_BAC && !isKO()) startFall();
    pushMeta();
    if (session.offline) { try { localStorage.setItem('buteco:offline:' + new Date().toDateString(), String(me.beers)); } catch (e) { /* ok */ } }
    const r = await barAct('finish');
    if (r && r.ok) applyState(r);
    else if (r && r.ok === false) { applyState(r); me.bac = Math.max(0, me.bac - 1); toast(r.reason === 'rapido' ? 'Calma! O barman não deixou beber tão rápido' : 'Esse copo não valeu ponto'); }
    refreshRanking();
  }
  // queda de bêbado: fica no chão uns segundos e levanta; repete enquanto o nível estiver no máximo
  function startFall() {
    me.koUntil = Date.now() + 2800;
    camKick = (Math.random() > 0.5 ? 1 : -1) * 0.9;
    drinkingNow = false; me.drinking = false; drinkT = 0;
    send({ t: 'dr', v: 0 }); send({ t: 'ko', ms: 2800 }); FT.audio.thud();
    fallT = rnd(5, 8);
    if (!startFall.warned) { startFall.warned = true; toast('Você tá caindo de bêbado! Para de beber e espera baixar', 'skull'); }
    else if (Math.random() < 0.4) toast(['Ops, caiu de novo!', 'Levanta que você consegue', 'O chão é seu amigo'][Math.floor(Math.random() * 3)]);
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
      opts.forEach((o) => { const b = document.createElement('button'); b.innerHTML = (o.icon ? ic(o.icon) + ' ' : '') + esc(o.label); b.onclick = () => { FT.audio.blip(); o.fn(); }; optsEl.appendChild(b); });
    };
    dlgTimer = setInterval(() => { i += 2; $('dlg-text').textContent = text.slice(0, i); if (i >= text.length) { clearInterval(dlgTimer); showOpts(); } }, 22);
    $('dialog').onclick = (e) => { if (e.target.closest('button')) return; if (i < text.length) { i = text.length; $('dlg-text').textContent = text; clearInterval(dlgTimer); showOpts(); } };
  }
  function closeDialog() { clearInterval(dlgTimer); $('dialog').hidden = true; relock(); }
  function talkHomem() {
    if (me.hasJoint) return say('Já tá com um na mão, parceiro. Vai fumar, vai!', [{ label: 'Beleza', fn: closeDialog }]);
    if (Date.now() < me.jointReadyAt) return say('Calma, calma... acabou de fumar. Volta daqui uns minutinhos.', [{ label: 'Tá bom', fn: closeDialog }]);
    say('Psiu... vem cá. Tá procurando alguma coisa pra... relaxar?', [
      { label: 'Sei lá, tem o quê?', fn: () => say('Tenho um baseadinho aqui. Cortesia da casa. Mas fica entre nós, hein?', [
        { label: 'Pegar o baseado', icon: 'cigarette', fn: giveJoint }, { label: 'Melhor não', fn: closeDialog }]) },
      { label: 'Tô de boa', fn: closeDialog },
    ]);
  }
  function giveJoint() {
    me.hasJoint = true; $('btn-smoke').hidden = false; FT.audio.pop();
    say('Toma. Fuma por aí... depois me procura se quiser outro.', [{ label: 'Valeu!', fn: closeDialog }]);
    toast('Você ganhou um baseado', 'cigarette');
  }
  function startSmoking() {
    if (!me.hasJoint || me.smoking || isKO() || me.peeing > 0) return;
    if (dialogOpen()) closeDialog();
    me.hasJoint = false; me.smoking = true; me.smokeLeft = 6.5; me.puffT = 0;
    me.redUntil = Date.now() + 90000; $('btn-smoke').hidden = true;
    send({ t: 'sm', v: 1, rd: 90000 }); FT.audio.puff();
  }
  function endSmoking() {
    me.smoking = false; me.redUntil = Date.now() + 90000; me.jointReadyAt = Date.now() + 40000;
    psyStart = performance.now(); psyEnd = psyStart + 60000;
    send({ t: 'sm', v: 0, rd: 90000 }); pushMeta(); FT.audio.psy();
    toast('Eita... tá tudo colorido', 'sparkles');
  }
  // ---------------- banheiro: urinar no vaso baixa a embriaguez ----------------
  function usePee(T) {
    if (me.peeing > 0 || isKO() || dialogOpen() || me.smoking || vapingT > 0 || pour) return;
    if (me.bac < 0.8) { toast('Você ainda não tá com vontade… bebe mais um pouco', 'droplets'); return; }
    if (Date.now() < me.peeReadyAt) { toast('Acabou de ir ao banheiro! Espera um pouco', 'droplets'); return; }
    me.peeing = PEE_SECONDS; me.peeFace = Math.atan2(-(T.x - me.x), -(T.z - me.z));
    drinkingNow = false; me.drinking = false; drinkT = 0; holdBtn = holdKey = holdMouse = false;
    FT.audio.pee(); send({ t: 'pe' });
  }
  function endPee() {
    me.peeing = 0; me.peeReadyAt = Date.now() + PEE_COOLDOWN_MS;
    const relief = Math.min(me.bac, PEE_RELIEF); me.bac -= relief;
    FT.audio.flush(); pushMeta();
    toast(relief >= 1 ? 'Ahhh, que alívio! A embriaguez baixou um pouco' : 'Ahhh, que alívio!', 'droplets');
    updateStatus();
  }

  // ---------------- garçonete Bella: loja ----------------
  function talkMaid() {
    say(`Oi, lindinho! O que vai ser hoje? (Você tem ${me.points} ponto${me.points === 1 ? '' : 's'})`, [
      { label: 'Pedir uma cerveja', icon: 'beer', fn: orderBeer },
      { label: 'Comprar pod (20 pts)', icon: 'wind', fn: buyPod },
      { label: 'Só olhando', fn: closeDialog },
    ]);
  }
  async function buyPod() {
    if (session.offline) return say('Sem conexão com o servidor, a loja fechou…', [{ label: 'Tá', fn: closeDialog }]);
    const r = await api.shop({ pid: session.pid, token: session.token, item: 'pod' });
    applyState(r);
    if (r && r.ok) { FT.audio.pop(); confetti(); return say(`Pod novinho pra você! Você tem ${me.vape} tragadas. Aperta F (ou o botão) pra usar. Gastei 20 pontos do seu perfil, tá?`, [{ label: 'Valeu, Bella!', fn: closeDialog }]); }
    if (r && r.reason === 'pontos') return say(`Faltam pontos, bonitão. Cada pod custa 20 e você tem ${me.points}. Bebe mais uns copinhos!`, [{ label: 'Já volto', fn: closeDialog }]);
    say('Deu ruim na maquininha… tenta de novo!', [{ label: 'Tá', fn: closeDialog }]);
  }

  // ---------------- cigarro eletrônico ----------------
  let vapingT = 0, vapeCloudDone = true;
  function useVape() {
    if (vapingT > 0 || isKO() || dialogOpen() || me.smoking || pour || me.peeing > 0) return;
    if (me.vape <= 0) { toast('Sem pod! Compre um com a Bella por 20 pontos', 'wind'); return; }
    me.vape--; updateStatus();
    vapingT = 3; vapeCloudDone = false;
    send({ t: 'vp' }); FT.audio.vape();
    if (!session.offline) api.vape({ pid: session.pid, token: session.token }).then((r) => { if (r && typeof r.vape === 'number') { me.vape = r.vape; updateStatus(); } });
  }

  // ---------------- jukebox ----------------
  let lastTrackAt = 0;
  function openJukebox() { releaseLock(); $('jukebox').hidden = false; $('jb-url').focus(); syncPause(); }
  function closeJukebox() { if ($('jukebox').hidden) return; $('jukebox').hidden = true; $('jb-url').blur(); relock(); syncPause(); }
  function playFromJukebox() {
    const id = parseYouTube($('jb-url').value);
    if (!id) { toast('Link inválido. Cole um link do YouTube', 'music'); return; }
    if (Date.now() - lastTrackAt < 15000) { toast('Calma! Espera uns segundos pra trocar a música', 'music'); return; }
    lastTrackAt = Date.now();
    const track = { vid: id, t0: Date.now(), by: me.name };
    music.play(track); send({ t: 'mus', vid: track.vid, t0: track.t0, by: track.by });
    $('jb-url').value = ''; closeJukebox(); pushMeta();
    addLog(null, 'Você colocou uma música na jukebox', true, 'music');
  }

  // ---------------- alvos de interação ----------------
  const camDir = new THREE.Vector3();
  let target = null;
  function viewInfo(x, z, maxD, cone) {
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
    const fwd = [-Math.sin(yaw), -Math.cos(yaw)];
    const dot = d > 0 ? (fwd[0] * dx + fwd[1] * dz) / d : 1;
    return { d, ok: d < maxD && dot > cone, dot };
  }
  function npcInfo() { const i = viewInfo(BAR.npcPos.x, BAR.npcPos.z, 3.4, 0.75); return { d: i.d, near: i.ok }; }
  function computeTarget() {
    if (isKO() || dialogOpen() || jukeOpen()) return null;
    if (me.bottleLoc === 'table' && me.bottleMesh) {
      camera.getWorldDirection(camDir);
      const bp = me.bottleMesh.position;
      const vx = bp.x - camera.position.x, vy = bp.y + 0.15 - camera.position.y, vz = bp.z - camera.position.z;
      const d = Math.hypot(vx, vy, vz);
      if (d < 3.2 && (vx * camDir.x + vy * camDir.y + vz * camDir.z) / d > 0.93) return { type: 'tbottle', d };
    }
    // cervejas grátis em cima das mesas
    {
      camera.getWorldDirection(camDir);
      let fb = null;
      for (const b of bar.freeBottles) {
        if (!b.mesh.visible) continue;
        const p = b.mesh.position;
        const vx = p.x - camera.position.x, vy = p.y + 0.15 - camera.position.y, vz = p.z - camera.position.z;
        const d = Math.hypot(vx, vy, vz);
        if (d < 3.0 && (vx * camDir.x + vy * camDir.y + vz * camDir.z) / d > 0.95 && (!fb || d < fb.d)) fb = { type: 'freebeer', d, id: b.id };
      }
      if (fb) return fb;
    }
    let best = null;
    const test = (type, pos, maxD, cone) => { const i = viewInfo(pos.x, pos.z, maxD, cone); if (i.ok && (!best || i.d < best.d)) best = { type, d: i.d }; };
    test('maid', BAR.maidPos, 3.4, 0.7);
    test('man', BAR.npcPos, 3.4, 0.75);
    test('jukebox', BAR.jukebox, 2.8, 0.5);
    test('provador', BAR.provador, 3.0, 0.6);
    test('sponsors', BAR.sponsors, 4.2, 0.72);
    for (const T of BAR.toilets) { const i = viewInfo(T.x, T.z, 2.2, 0.62); if (i.ok && (!best || i.d < best.d)) best = { type: 'toilet', d: i.d, T }; }
    if (!best) { const i = viewInfo(BAR.vipDoor.x - 0.6, BAR.vipDoor.z, 3.4, 0.6); if (i.ok && !vipAllowed) best = { type: 'vip', d: i.d }; }
    return best;
  }
  function interact() {
    if (isKO()) return;
    const tg = target;
    if (tg && tg.type === 'tbottle') return pickUpBottle();
    if (tg && tg.type === 'freebeer') return grabFree(tg.id);
    if (tg && tg.type === 'maid' && !dialogOpen()) return talkMaid();
    if (tg && tg.type === 'man' && !dialogOpen()) return talkHomem();
    if (tg && tg.type === 'jukebox') return openJukebox();
    if (tg && tg.type === 'provador') { if (onWardrobe) onWardrobe(); return; }
    if (tg && tg.type === 'sponsors') return FT.openSponsors && FT.openSponsors();
    if (tg && tg.type === 'toilet') return usePee(tg.T);
    if (canPour()) return pourBeer();
    if (me.hasJoint) startSmoking();
  }
  const PROMPTS = {
    tbottle: () => [ 'bottle-wine', isTouch ? 'Toque em PEGAR a garrafa' : 'E / clique — pegar a garrafa' ],
    maid: () => [ 'heart', isTouch ? 'Toque em FALAR com a Bella' : 'E — falar com a Bella' ],
    man: () => [ 'hand', isTouch ? 'Toque em FALAR' : 'E — falar com o homem' ],
    jukebox: () => [ 'music', isTouch ? 'Toque em MÚSICA' : 'E — pedir música' ],
    provador: () => [ 'shirt', isTouch ? 'Toque em TROCAR de roupa' : 'E — entrar no provador e trocar de roupa' ],
    sponsors: () => [ 'hand-heart', isTouch ? 'Toque em VER os patrocinadores' : 'E — ver os patrocinadores' ],
    toilet: () => [ 'droplets', isTouch ? 'Toque em URINAR' : 'E — urinar no vaso (baixa a embriaguez)' ],
    freebeer: () => [ 'beer', isTouch ? 'Toque em PEGAR a cerveja' : 'E / clique — pegar a cerveja da mesa' ],
    vip: () => [ 'lock', 'Camarote: só o TOP 5 do dia entra' + (vipRank ? ' · você está em #' + vipRank : ' · você ainda não pontuou') ],
  };



  // ---------------- tela sempre ligada (celular) ----------------
  let wakeLock = null;
  async function keepAwake() {
    try {
      if (!isTouch || !running || wakeLock || document.hidden || !navigator.wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; /* sem permissão: segue sem */ }
  }
  function letSleep() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ok */ } wakeLock = null; }

  // ---------------- pointer lock / entrada ----------------
  function lockNow() { if (!isTouch && running && post.canvas.requestPointerLock) { try { const p = post.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ok */ } } }
  function releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  function relock() { if (!$('ranking').hidden || dialogOpen() || jukeOpen() || document.activeElement === $('chatinput')) return; lockNow(); }
  function syncPause() { $('pause').hidden = !running || isTouch || locked || !$('ranking').hidden || dialogOpen() || jukeOpen() || document.activeElement === $('chatinput'); }

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
    on(post.canvas, 'mousedown', (e) => { if (!running) return; FT.audio.init(); if (!locked && !isTouch) { lockNow(); return; } if (e.button === 2) { throwBottle(); return; } if (e.button === 0) { if ((target && target.type !== 'vip') || canPour()) interact(); else if (me.empty && !me.glass) throwBottle(); else holdMouse = true; } });
    on(post.canvas, 'contextmenu', (e) => e.preventDefault());
    on(window, 'mouseup', (e) => { if (e.button === 0) holdMouse = false; });
    on($('pause'), 'click', () => { FT.audio.init(); $('chatform').classList.remove('open'); $('chatinput').blur(); lockNow(); });

    on(window, 'keydown', (e) => {
      if (!running) return;
      const inChat = document.activeElement === $('chatinput');
      if (e.key === 'Escape') { $('chatinput').blur(); $('chatform').classList.remove('open'); if (dialogOpen()) closeDialog(); closeRanking(); closeJukebox(); syncPause(); return; }
      if (inChat) return;
      if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
      if (e.code === 'Tab') { e.preventDefault(); if ($('ranking').hidden) openRanking(); else closeRanking(); return; }
      if (e.code === 'Space') { e.preventDefault(); holdKey = true; return; }
      if (e.code === 'KeyE') { interact(); return; }
      if (e.code === 'KeyF') { useVape(); return; }
      if (e.code === 'KeyV') { FT.audio.init(); voice.toggleMute(); return; }
      if (e.code === 'KeyG') { putDownBottle(); return; }
      if (e.code === 'KeyQ') { throwBottle(); return; }
      keys[e.code] = true;
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    on(window, 'keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') holdKey = false; });
    on(document, 'visibilitychange', () => { if (!document.hidden) keepAwake(); });
    on(window, 'blur', () => { for (const k in keys) keys[k] = false; holdKey = holdBtn = holdMouse = false; });

    const db = $('btn-drink');
    const down = (e) => { e.preventDefault(); FT.audio.init(); holdBtn = true; try { db.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } };
    const up = () => { holdBtn = false; };
    on(db, 'pointerdown', down); on(db, 'pointerup', up); on(db, 'pointercancel', up); on(db, 'lostpointercapture', up);
    on(db, 'contextmenu', (e) => e.preventDefault());
    on($('btn-smoke'), 'click', startSmoking);
    on($('btn-use'), 'click', () => interact());
    on($('btn-vape'), 'click', useVape);
    on($('btn-drop'), 'click', putDownBottle);
    on($('btn-throw'), 'click', throwBottle);
    on($('jb-play'), 'click', playFromJukebox);
    on($('jb-url'), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); playFromJukebox(); } });
    on($('jb-stop'), 'click', () => { music.stop(); send({ t: 'mst' }); closeJukebox(); pushMeta(); });
    on($('jb-close'), 'click', closeJukebox);
    on($('yt-hide'), 'click', () => $('ytbox').classList.toggle('mini'));
    on($('btn-music'), 'click', () => { music.setMuted(!music.muted); $('btn-music').classList.toggle('off', music.muted); });
    const closeMenu = () => { $('hud-tr').classList.remove('open'); $('btn-menu').setAttribute('aria-expanded', 'false'); };
    on($('btn-menu'), 'click', () => { const o = $('hud-tr').classList.toggle('open'); $('btn-menu').setAttribute('aria-expanded', String(o)); });
    on($('hud-tr'), 'click', (e) => { if (e.target.closest('.round') && !e.target.closest('#btn-menu')) setTimeout(closeMenu, 0); });
    on($('btn-voice'), 'click', () => { FT.audio.init(); voice.cycle(); });
    on($('btn-board'), 'click', openRanking);
    const runDiag = async () => { $('netdiag-text').textContent = 'Testando…'; const t = await FT.netDiag({ SUPABASE_URL: cfg.supabaseUrl, SUPABASE_ANON_KEY: cfg.supabaseAnonKey }); $('netdiag-text').textContent = t; };
    on($('netmode'), 'click', () => { releaseLock(); $('netdiag').hidden = false; runDiag(); });
    on($('netdiag-retry'), 'click', runDiag);
    on($('netdiag-close'), 'click', () => { $('netdiag').hidden = true; });
    on($('rank-close'), 'click', () => { closeRanking(); relock(); syncPause(); });
    on($('ranking'), 'pointerdown', (e) => { if (e.target === $('ranking')) { closeRanking(); syncPause(); } });
    on($('btn-sound'), 'click', () => { FT.audio.init(); FT.audio.setMuted(!FT.audio.muted); setIcon($('btn-sound'), FT.audio.muted ? 'volume-x' : 'volume-2'); });
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
    on(lz, 'pointerdown', (e) => { if (lp != null) return; lp = { id: e.pointerId, x: e.clientX, y: e.clientY }; lz.setPointerCapture(e.pointerId); FT.audio.init(); closeMenu(); keepAwake(); });
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
    on(joyEl, 'pointerdown', (e) => { e.preventDefault(); FT.audio.init(); keepAwake(); joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); moveJoy(e); });
    on(joyEl, 'pointermove', (e) => { if (e.pointerId === joy.id) moveJoy(e); });
    const jend = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
    on(joyEl, 'pointerup', jend); on(joyEl, 'pointercancel', jend);
  }
  function unbindInput() { handlers.forEach(([el, ev, fn, o]) => el.removeEventListener(ev, fn, o)); handlers.length = 0; }

  // meu próprio balão: aparece como toast de chat (câmera em 1ª pessoa não vê a própria cabeça)
  let myBubbleT = null;
  function mySay(text) {
    const el = $('mybubble');
    const who = document.createElement('small'); who.textContent = 'Você'; const msg = document.createElement('span'); msg.textContent = text;
    el.replaceChildren(who, msg); el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(myBubbleT); myBubbleT = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // ---------------- atualização ----------------
  let lastSent = { x: 1e9, z: 1e9, ry: 1e9, sp: -1 }, lastSendT = 0, metaSig = '';
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), DOWN = new THREE.Vector3(0, -1, 0);
  function update(dt, t) {
    if (!running) return;
    const ko = isKO();
    if (me.koWas && !ko && me.bac < MAX_BAC) { toast('Você levantou'); }
    me.koWas = ko;
    const dl = drunkLevel();

    // embriaguez: tropeços (a partir de ~12 copos) e quedas (nível máximo)
    if (!ko && !me.smoking && !dialogOpen()) {
      if (me.bac >= 12) {
        stumbleT -= dt;
        if (stumbleT <= 0) {
          stumbleT = rnd(2.2, 4.5) / (0.4 + dl);
          const a = rnd(-1, 1);
          me.vx += Math.cos(yaw) * a * 2.4; me.vz += -Math.sin(yaw) * a * 2.4;
          camKick = a * 0.3; FT.audio.hic();
        }
      }
      if (me.bac >= MAX_BAC) { fallT -= dt; if (fallT <= 0) startFall(); } else fallT = rnd(2, 4);
    }
    camKick -= camKick * Math.min(1, dt * 2.5);

    // movimento
    let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joy.y;
    let s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
    if (ko || me.smoking || me.peeing > 0 || dialogOpen() || jukeOpen() || flying() || crawling()) { f = s = 0; }
    const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    if (dl > 0 && (f || s)) {
      const w = Math.sin(t * 2.1) * dl * 0.8 + Math.sin(t * 5.7) * dl * 0.3;
      const c = Math.cos(w), sn = Math.sin(w), nf = f * c - s * sn; s = f * sn + s * c; f = nf;
    }
    if (dl > 0.15 && !ko && !dialogOpen() && !me.smoking) s += Math.sin(t * 1.3) * dl * 0.6 + Math.sin(t * 3.1) * dl * 0.25; // deriva de bêbado (anda torto)
    const sprint = keys.ShiftLeft || keys.ShiftRight ? 1.45 : 1;
    const speed = SPEED * sprint * (drinkingNow ? 0.55 : 1) * (1 - dl * 0.22);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const tvx = (fx * f + rx * s) * speed, tvz = (fz * f + rz * s) * speed;
    me.vx += (tvx - me.vx) * Math.min(1, dt * 9); me.vz += (tvz - me.vz) * Math.min(1, dt * 9);
    me.x += me.vx * dt; me.z += me.vz * dt;
    bar.collide(me, 0.32);
    updateFly(dt); updateProjectiles(dt);
    if (!vipAllowed && bar.inVip(me)) { me.x = 8.6; me.z = 0; me.vx = me.vz = 0; toast('Camarote só pro TOP 5 do dia', 'lock'); }
    const sp = Math.hypot(me.vx, me.vz);
    bobPhase += dt * (4 + sp * 1.6) * (sp > 0.1 ? 1 : 0);

    me.bac = Math.max(0, me.bac - dt / 50);
    if (me.smoking) {
      me.smokeLeft -= dt; me.puffT -= dt;
      if (me.puffT <= 0) { me.puffT = 1.2; FT.audio.puff(); emitWorldSmoke(me.x - Math.sin(yaw) * 0.45, 1.55, me.z - Math.cos(yaw) * 0.45, 7, false); }
      if (me.smokeLeft <= 0) endSmoking();
    }
    if (me.peeing > 0) {
      me.peeing -= dt;
      yaw += angDiff(yaw, me.peeFace) * Math.min(1, dt * 5);
      pitch += (-0.8 - pitch) * Math.min(1, dt * 3);
      if (me.peeing <= 0) endPee();
    }
    updateDrink(dt);
    // servir
    if (pour) { pour.t += dt; if (pour.t >= 1.7) pour = null; }
    // vape
    if (vapingT > 0) {
      vapingT -= dt;
      if (!vapeCloudDone && vapingT < 1.6) { vapeCloudDone = true; emitWorldSmoke(me.x - Math.sin(yaw) * 0.6, 1.5, me.z - Math.cos(yaw) * 0.6, 40, true); }
    }

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
    const crawlNow = crawling();
    camYs += ((ko ? 0.3 : crawlNow ? 0.72 + Math.sin(now / 300) * 0.02 : EYE_HEIGHT + bob) - camYs) * Math.min(1, dt * (ko || crawlNow ? 9 : 3.2));
    if (me.fly) camYs = EYE_HEIGHT + me.air;
    if (me.fly) camRoll += dt * 5;
    const camY = camYs;
    koPitch += ((ko ? 1.1 : 0) - koPitch) * Math.min(1, dt * (ko ? 8 : 3));
    camera.position.set(me.x + Math.cos(yaw) * bobX, camY, me.z - Math.sin(yaw) * bobX);
    const sway = dl * (Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.3) * 0.02);
    const dPitch = dl * Math.sin(t * 0.7) * 0.05 + vmPose.lift * 0.28;
    camera.rotation.order = 'YXZ';
    camRoll += ((ko ? 0.9 : sway + camKick) - camRoll) * Math.min(1, dt * (ko ? 8 : 4));
    camera.rotation.set(clamp(pitch + dPitch + koPitch, -1.5, 1.5), yaw + dl * Math.sin(t * 0.5) * 0.06, camRoll);

    // modelo em 1ª pessoa
    vmPose.lift += ((me.drinking ? 1 : 0) - vmPose.lift) * Math.min(1, dt * 7);
    vmPose.smoke += (((me.smoking || vapingT > 0) ? 1 : 0) - vmPose.smoke) * Math.min(1, dt * 6);
    // tragando: pod/baseado vai até a boca (pod: primeiro 1,4 s; baseado: começo de cada tragada)
    const atMouth = (vapingT > 1.6) || (me.smoking && me.puffT > 0.6);
    vmPose.mouth = (vmPose.mouth || 0) + ((atMouth ? 1 : 0) - (vmPose.mouth || 0)) * Math.min(1, dt * 8);
    const lf = vmPose.lift, sm = vmPose.smoke, idleB = Math.sin(bobPhase) * 0.012 * Math.min(1, sp / 2) + Math.sin(t * 1.5) * 0.004;
    const dp = vmPose.drinkP;
    const wI = 1 - lf - sm;
    const mix = (i, d, s) => i * wI + d * lf + s * sm;
    const mk = vmPose.mouth || 0;
    const pv = [mix(0.3, 0.26, 0.24), mix(-0.42, -0.5, -0.5) + idleB, mix(-0.1, -0.08, -0.08)];
    // bebendo: o copo vem pro centro, perto da boca, e inclina conforme esvazia
    const aim = [mix(0.25, 0.05 - dp * 0.03, 0.15 - mk * 0.13), mix(-0.24, -0.15 + dp * 0.05, -0.27 + mk * 0.12), mix(-0.48, -0.34 + dp * 0.12, -0.42 + mk * 0.25)];
    const ax = clamp(camera.aspect / 1.3, 0.5, 1); pv[0] *= ax; aim[0] *= ax;
    armPivot.position.set(pv[0], pv[1], pv[2]);
    tmpV.set(aim[0] - pv[0], aim[1] - pv[1], aim[2] - pv[2]).normalize();
    armPivot.quaternion.setFromUnitVectors(DOWN, tmpV);
    const rot = 0;
    mug.visible = !(me.smoking || vapingT > 0);
    tmpQ.setFromEuler(tmpE.set(lf * (0.1 + dp * 1.3), 0, 0)); mug.quaternion.copy(armPivot.quaternion).invert().multiply(tmpQ);
    mug.position.set(0.0, 0.0, 0);
    const pk = pour ? Math.min(1, pour.t / 1.7) : 0;
    const pourFill = pour ? clamp((pk - 0.2) / 0.55, 0, 1) : 1;
    mug.userData.setLevel(pour ? pourFill : me.glass ? 1 - dp * 0.97 : 0);
    joint.visible = me.smoking;
    tmpQ.setFromEuler(tmpE.set(0.3, -0.5, 0.2)); joint.quaternion.copy(armPivot.quaternion).invert().multiply(tmpQ);
    joint.position.set(0, 0.02, -0.04);
    joint.userData.ember.scale.setScalar(1 + Math.sin(t * 14) * 0.25);
    vapeDev.visible = vapingT > 0;
    tmpQ.setFromEuler(tmpE.set(0.2, 0, 0)); vapeDev.quaternion.copy(armPivot.quaternion).invert().multiply(tmpQ);
    vapeDev.position.set(0, 0.03, -0.02);
    vapeDev.userData.led.scale.setScalar(1 + Math.max(0, Math.sin(t * 9)) * 0.9);
    // garrafa na mão esquerda / servindo no copo
    const holdB = me.bottleLoc === 'hand';
    fpBottle.visible = holdB || !!pour; fpStream.visible = false; armPivotL.visible = holdB || !!pour;
    {
      const ax2 = clamp(camera.aspect / 1.3, 0.5, 1);
      const held = [-0.3 * ax2, -0.2, -0.52];
      let pos = held, tilt = 0.06 + Math.sin(t * 1.4) * 0.015;
      if (pour) {
        const inK = clamp(pk / 0.2, 0, 1), outK = clamp((pk - 0.88) / 0.12, 0, 1), m = inK * (1 - outK);
        const top = [0.3 * ax2, 0.14, -0.5];
        pos = [held[0] + (top[0] - held[0]) * m, held[1] + (top[1] - held[1]) * m, held[2] + (top[2] - held[2]) * m];
        tilt = 0.06 + (Math.PI * 0.92 - 0.06) * clamp((pk - 0.12) / 0.2, 0, 1) * (1 - outK);
        if (pk > 0.2 && pk < 0.78) {
          fpStream.visible = true;
          const mugY = -0.12, topY = pos[1];
          fpStream.position.set(0.25 * ax2, (mugY + topY - 0.2) / 2, -0.5);
          fpStream.scale.set(1, Math.max(0.05, topY - 0.2 - mugY), 1);
        }
      }
      fpBottle.position.set(pos[0], pos[1], pos[2]); fpBottle.rotation.set(0, 0, tilt);
      const pvL = [-0.34 * ax2, -0.5, -0.1];
      armPivotL.position.set(pvL[0], pvL[1], pvL[2]);
      tmpV.set(pos[0] - pvL[0], pos[1] - 0.1 - pvL[1], pos[2] - pvL[2]).normalize();
      armPivotL.quaternion.setFromUnitVectors(DOWN, tmpV);
    }

    // jato do xixi
    {
      const pe = me.peeing > 0 && me.peeing < PEE_SECONDS - 0.5 && me.peeing > 0.25;
      vm.visible = !(me.peeing > 0);
      fpPee.visible = pe;
      if (pe) {
        const w = Math.sin(t * 40) * 0.004;
        const a = new THREE.Vector3(w, -0.27, -0.4), b = new THREE.Vector3(w * 2, -0.5, -0.95);
        fpPee.position.copy(a).add(b).multiplyScalar(0.5);
        fpPee.scale.set(1, a.distanceTo(b), 1);
        fpPee.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
      }
      peeSplash.forEach((sp) => {
        const u = sp.userData; u.t = (u.t + dt * 2.4) % 1;
        if (!pe) { sp.material.opacity = 0; return; }
        sp.position.set(Math.sin(u.t * 9 + 1) * 0.07 * u.t, -0.5 + u.t * 0.08, -0.95 - u.t * 0.05);
        sp.scale.setScalar(0.03 + u.t * 0.05); sp.material.opacity = (1 - u.t) * 0.8;
      });
    }

    // fumaça em 1ª pessoa
    puffCd -= dt;
    if (false) { puffCd = 0.35; const q = fpPuffs.find((x) => x.userData.t < 0); if (q) { q.userData.t = 0; q.position.set(0.05, -0.12, -0.35); } }
    fpPuffs.forEach((q) => {
      if (q.userData.t < 0) return;
      q.userData.t += dt; const k = q.userData.t / 2.4;
      if (k >= 1) { q.userData.t = -1; q.material.opacity = 0; return; }
      q.position.set(0.05 + Math.sin(q.userData.t * 2) * 0.05, -0.12 + k * 0.35, -0.35 - k * 0.15);
      q.scale.setScalar(0.08 + k * 0.35); q.material.opacity = Math.sin(k * Math.PI) * 0.35;
    });

    // nuvens grandes do vape (em cima da tela)
    fpClouds.forEach((c) => {
      const u = c.userData; if (u.t === -1 && c.material.opacity === 0) return;
      u.t += dt;
      if (u.t < 0) return;
      const k = u.t / u.life;
      if (k >= 1) { u.t = -1; c.material.opacity = 0; return; }
      c.position.set(u.x + u.dx * u.t, u.y + u.dy * u.t, u.z);
      c.scale.setScalar(0.35 + (u.s1 - 0.35) * Math.min(1, k * 2.2));
      c.material.opacity = Math.min(1, k * 8) * (1 - k) * 0.62;
    });
    worldPuffs.forEach((c) => {
      const u = c.userData; if (u.t === -1 && !u.life) return; if (u.t < 0 && !u.life) return;
      u.t += dt; if (u.t < 0) return; const k = u.t / u.life;
      if (k >= 1) { c.userData = { t: -1 }; c.material.opacity = 0; return; }
      // vento suave: a fumaça sobe, bate no teto, espalha e vaga pelo bar
      const wt = now / 1000;
      u.vx += (Math.sin(wt * 0.21 + u.seed) * 0.06 - u.vx * 0.12) * dt; u.vz += (Math.cos(wt * 0.17 + u.seed * 1.3) * 0.06 - u.vz * 0.12) * dt;
      u.vy += (0.02 - u.vy * 0.25) * dt;
      c.position.x += u.vx * dt; c.position.y += u.vy * dt; c.position.z += u.vz * dt;
      if (c.position.y > 3.1) { c.position.y = 3.1; u.vy = 0; }
      if (c.position.x < -9.7 || c.position.x > 17.8) u.vx = -u.vx * 0.6;
      if (c.position.z < -6.8 || c.position.z > 6.8) u.vz = -u.vz * 0.6;
      c.scale.setScalar(u.s0 + (u.s1 - u.s0) * Math.min(1, Math.sqrt(k) * 1.2));
      c.material.opacity = Math.min(1, k * 10) * Math.pow(1 - k, 1.4) * (u.op || 0.4);
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
      st.mouth = (p.vaping > 1.6) || (p.smoking && ((now / 1000) % 1.2) < 0.6) ? 1 : 0;
      const tn = Date.now();
      st.fly = tn < (p.flyUntil || 0) ? 1 : 0;
      st.air = st.fly ? 4 * 1.3 * ((tn - p.flyStart) / p.flyMs) * (1 - (tn - p.flyStart) / p.flyMs) : 0;
      st.crawl = tn < (p.crawlUntil || 0) ? 1 : 0;
      if (p.smoking && !pko) { p.puffT = (p.puffT || 0) - dt; if (p.puffT <= 0) { p.puffT = 1.2; emitWorldSmoke(p.x - Math.sin(p.ry) * 0.45, 1.55, p.z - Math.cos(p.ry) * 0.45, 7, false); } }
      st.bottle = p.holdBottle && !pko ? 1 : 0;
      if (p.vaping > 0) { p.vaping -= dt; st.vape = 1; if (!p.vapeEmit && p.vaping < 1.6) { p.vapeEmit = true; emitWorldSmoke(p.x - Math.sin(p.ry) * 0.5, 1.5, p.z - Math.cos(p.ry) * 0.5, 40, true); } } else st.vape = 0;
      a.setRed(Date.now() < p.redUntil);
      a.update(dt);
      if (st.smoke && Math.random() < dt * 1.2) { /* fumaça de terceiros é discreta */ }
    });

    // voz por proximidade + ícone de "falando" sobre a cabeça
    voice.tick(dt, me, yaw, Array.from(players.values()));
    players.forEach((p) => { setSpeakIcon(p, voice.speaking(p.id)); });
    $('btn-voice').classList.toggle('speak', voice.mySpeaking);

    // alvo de interação (garrafa, Bella, homem, jukebox, porta do camarote)
    target = computeTarget();
    const ni = npcInfo();
    const holdingB = me.bottleLoc === 'hand' && !dialogOpen() && !pour;
    const showPrompt = !!target || (me.hasJoint && !me.smoking && !dialogOpen()) || holdingB;
    $('prompt').hidden = !showPrompt;
    $('prompt').classList.toggle('tip', !!(target && target.type === 'vip'));
    if (showPrompt) {
      const pr = target ? PROMPTS[target.type]()
        : holdingB && me.empty ? ['zap', isTouch ? 'Garrafa vazia: toque em JOGAR (ou LARGAR)' : 'Garrafa vazia: clique direito / Q — jogar · G — jogar no lixo']
        : holdingB ? (canPour() ? ['beer', isTouch ? 'Toque em ENCHER o copo · ou LARGAR a garrafa' : 'Clique / E — encher o copo · G — largar a garrafa'] : ['bottle-wine', isTouch ? 'Toque em LARGAR a garrafa' : 'G — largar a garrafa numa mesa'])
        : ['cigarette', isTouch ? 'Toque em FUMAR' : 'Aperte E pra fumar'];
      $('prompt').innerHTML = ic(pr[0]) + '<span>' + esc(pr[1]) + '</span>';
    }
    $('btn-drop').hidden = me.bottleLoc !== 'hand';
    $('btn-throw').hidden = !me.empty;
    const canUse = (!!target && target.type !== 'vip') || canPour();
    $('btn-use').hidden = !isTouch || !canUse;
    if (canUse) $('btn-use').querySelector('span').textContent = target && target.type !== 'vip' ? (target.type === 'tbottle' || target.type === 'freebeer' ? 'PEGAR' : target.type === 'jukebox' ? 'MÚSICA' : target.type === 'provador' ? 'TROCAR' : target.type === 'toilet' ? 'URINAR' : target.type === 'sponsors' ? 'VER' : 'FALAR') : 'ENCHER';
    if (!isTouch) $('crosshair').style.opacity = canUse ? 1 : 0.7;
    // som: volume cai com a distância da jukebox e sobe no camarote
    music.tick(me, bar.inVip(me));
    bar.setMusicOn(!!music.current);
    $('stars').hidden = !ko;
    if (mug.visible) mug.userData.tickBubbles(dt);

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
    lidKo += ((ko ? 0.95 : 0) - lidKo) * Math.min(1, dt * (ko ? 10 : 2.5));
    lid = Math.max(lid, lidKo);
    post.setEffects(t, drunkVis, psyVis, lid);
    camera.fov = 72 + clamp(1.2 - camera.aspect, 0, 0.8) * 30 + psyVis * 8 * Math.sin(t * 0.8) + drunkVis * 3;
    camera.updateProjectionMatrix();

    if (Math.floor(t / 0.25) !== update._h) { update._h = Math.floor(t / 0.25); updateStatus(); }
    if (t - (update._start || (update._start = t)) > 18) $('hint').classList.add('gone');
    bar.update(dt, t, me);
  }

  // ---------------- início / fim ----------------
  function start(sess) {
    session = sess;
    const look = S.sanitizeLook(sess.look);
    let beers = sess.beers | 0;
    if (sess.offline) { const v = parseInt(localStorage.getItem('buteco:offline:' + new Date().toDateString()) || '0', 10); beers = isNaN(v) ? 0 : v; }
    me = { pid: sess.pid, name: sess.name, look, x: BAR.spawn.x + rnd(-0.8, 0.8), z: BAR.spawn.z + rnd(-0.3, 0.3), vx: 0, vz: 0, beers, points: sess.points | 0, vape: sess.vape | 0, bottle: sess.bottle | 0, glass: sess.glass | 0, bottleMesh: null, bac: 0, hasJoint: false, jointReadyAt: 0, smokeLeft: 0, puffT: 0, koUntil: 0, koWas: false, redUntil: 0, drinking: false, smoking: false, peeing: 0, peeReadyAt: 0, peeFace: 0 };
    // se voltou no mesmo dia, o álcool "volta" proporcional (aprox.)
    const bacKey = 'buteco:bac:' + sess.pid;
    try { const b = JSON.parse(localStorage.getItem(bacKey) || 'null'); if (b && new Date().toDateString() === b.d) me.bac = Math.max(0, b.v - (Date.now() - b.t) / 50000); } catch (e) { /* ok */ }
    yaw = Math.PI; pitch = 0; // olhando pro balcão (-z)
    yaw = 0;
    buildViewModel(look);
    drinkT = 0; drinkingNow = false; holdBtn = holdKey = holdMouse = false; pour = null; vapingT = 0; vapeCloudDone = true; vipAllowed = false; vipRank = 0; bar.setVipOpen(false);
    me.bottleLoc = me.bottle ? 'hand' : null;
    drunkVis = Math.min(1, drunkLevel()); psyVis = 0; psyEnd = 0;
    fallT = 4; stumbleT = 4; camYs = EYE_HEIGHT; koPitch = 0; lidKo = 0; camKick = 0;
    update._start = 0;
    players.clear();
    $('chatlog').innerHTML = ''; $('btn-smoke').hidden = true; $('dialog').hidden = true; $('ranking').hidden = true; $('hint').classList.remove('gone'); $('prompt').hidden = true;
    setIcon($('btn-sound'), FT.audio.muted ? 'volume-x' : 'volume-2'); $('btn-music').classList.toggle('off', music.muted);
    // retrato do HOMEM
    const fc = $('dlg-face').getContext('2d'); fc.imageSmoothingEnabled = false; fc.clearRect(0, 0, 72, 72);
    fc.drawImage(S.get(S.HOMEM_LOOK, {}), 4, 0, 32, 30, 0, 0, 72, 68);
    updateStatus(); updateOnline(); setNetLabel('connecting');
    $('screen-game').hidden = false;
    running = true;
    bindInput();
    syncPause();
    keepAwake();
    camera.position.set(me.x, EYE_HEIGHT, me.z);
    camera.rotation.set(0, yaw, 0);

    net = FT.createNet({
      room: cfg.room || 'buteco-fiotoes-v2', sid, cfg: { SUPABASE_URL: cfg.supabaseUrl, SUPABASE_ANON_KEY: cfg.supabaseAnonKey }, meta: getMeta(),
      onMsg, onPeer: addPeer, onPeerUpdate: updatePeer, onLeave: removePeer, onStatus: setNetLabel,
    });
    addLog(null, 'Você entrou no Buteco FIOTÕES. Peça sua primeira gelada pra Bella!', true, 'beer');
    if (sess.notice && sess.notice.type === 'winner') {
      setTimeout(() => confetti(), 900);
      setTimeout(() => say(`PARABÉNS! Você foi o campeão do dia ${sess.notice.day} com ${sess.notice.beers} copos! Ganhou um cigarro eletrônico com 20 tragadas. Aperte F (ou o botão) pra usar!`, [{ label: 'Eba!', fn: closeDialog }]), 800);
    }
    refreshRanking(); rankTimer = setInterval(refreshRanking, 10000);
    voiceTimer = setInterval(() => { if (voice.state !== 'off') send({ t: 'vc', v: 1 }); }, 4000);
    lockNow();
  }
  function stop() {
    projectiles.forEach((pr) => bar.scene.remove(pr.mesh)); projectiles.length = 0; me.fly = null; me.crawlUntil = 0; me.empty = false;
    running = false;
    try { localStorage.setItem('buteco:bac:' + me.pid, JSON.stringify({ d: new Date().toDateString(), v: me.bac, t: Date.now() })); } catch (e) { /* ok */ }
    clearInterval(rankTimer); clearTimeout(rankSoon); clearInterval(voiceTimer);
    if (me.bottleMesh) { bar.takeBottle(me.bottleMesh); me.bottleMesh = null; }
    me.bottleLoc = null; armPivotL.visible = false;
    music.stop(); $('jukebox').hidden = true; vapingT = 0; pour = null;
    fpClouds.forEach((c) => { c.userData.t = -1; c.material.opacity = 0; }); fpBottle.visible = false; fpStream.visible = false;
    fpPee.visible = false; vm.visible = true; if (me) me.peeing = 0;
    unbindInput(); releaseLock(); letSleep();
    voice.stop();
    players.forEach((p) => { bar.scene.remove(p.av.root); p.av.dispose(); if (p.bottleMesh) bar.takeBottle(p.bottleMesh); }); players.clear();
    if (net) { send({ t: 'sm', v: 0 }); net.close(); net = null; }
    post.setEffects(0, 0, 0, 0);
    camera.fov = 72; camera.updateProjectionMatrix();
    $('pause').hidden = true; $('screen-game').hidden = true; $('prompt').hidden = true; $('netdiag').hidden = true; $('mybubble').hidden = true;
  }
  window.addEventListener('beforeunload', () => { if (me && running) { try { localStorage.setItem('buteco:bac:' + me.pid, JSON.stringify({ d: new Date().toDateString(), v: me.bac, t: Date.now() })); } catch (e) { /* ok */ } } });

  const debug = {
    get bar() { return bar; }, get camera() { return camera; }, get voice() { return voice; },
    get me() { return me; }, players, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, set pitch(v) { pitch = v; },
    set bac(v) { me.bac = v; }, finishBeer, orderBeer, pourBeer, useVape, get target() { return target; }, get vipAllowed() { return vipAllowed; }, music, startSmoking, endSmoking, get drunk() { return drunkVis; }, get psy() { return psyVis; },
    teleport(x, z) { me.x = x; me.z = z; }, tick(n, dt) { for (let i = 0; i < n; i++) update(dt || 0.05, performance.now() / 1000); },
  };
  return { start, stop, update, debug, get running() { return running; } };
}
