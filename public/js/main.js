// Entrada: página inicial (criar conta / entrar) -> guarda-roupa -> buteco.
import * as THREE from 'three';
import { createPost } from './post.js';
import { createWardrobe } from './wardrobe.js';
import { createBar } from './bar.js';
import { createGame } from './game.js';
import { initWardrobeUI } from './wardrobe-ui.js';
import { api } from './api.js';

const FT = window.FT;
const S = FT.sprites;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const NS = params.get('p') || '';
const coarse = matchMedia('(pointer: coarse)').matches;
let quality = params.get('q') || (coarse || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high');

// conta salva neste aparelho: { pid, token, name, look }
const KEY = `buteco:${NS}:account`;
const loadAcct = () => { try { const a = JSON.parse(localStorage.getItem(KEY) || 'null'); return a && a.pid && a.token ? a : null; } catch (e) { return null; } };
const saveAcct = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* ok */ } };
const clearAcct = () => { try { localStorage.removeItem(KEY); } catch (e) { /* ok */ } };

let renderer, post, wardrobe, bar = null, game = null, gameCam, ui, cfg = {};
let mode = 'home', t = 0, last = performance.now(), acct = null;
let dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.5);
let authMode = 'login';

function size() {
  const w = window.innerWidth, h = window.innerHeight;
  post.setSize(w, h, dpr);
  const dr = $('drawer');
  const portrait = w / h < 0.9 || w <= 820;
  const drawerW = !portrait && mode === 'wardrobe' ? dr.offsetWidth : 0;
  const drawerH = portrait && mode === 'wardrobe' && dr.classList.contains('open') ? dr.offsetHeight : 0;
  wardrobe.resize(w, h, drawerW, drawerH);
  gameCam.aspect = w / h; gameCam.updateProjectionMatrix();
}

// ---------------- página inicial ----------------
function showHome(msg) {
  mode = 'home';
  $('screen-wardrobe').hidden = true;
  $('screen-home').hidden = false;
  acct = loadAcct();
  $('home-continue').hidden = !acct;
  $('home-form').hidden = !!acct;
  if (acct) $('home-name').textContent = acct.name;
  $('auth-error').textContent = msg || '';
  $('auth-pass').value = '';
  size();
}
function setAuthMode(m) {
  authMode = m;
  document.querySelectorAll('#auth-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('btn-auth').textContent = m === 'login' ? 'ENTRAR' : 'CRIAR CONTA';
  $('auth-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('auth-hint').textContent = m === 'login' ? 'Conta antiga sem senha? Digite uma agora: ela vira a sua senha.' : 'A senha pode ser curtinha, até 3 números. Não precisa repetir.';
  $('auth-error').textContent = '';
}
const AUTH_ERR = {
  'nome-em-uso': 'Esse nome já tem dono. Escolha outro ou use "Entrar".',
  'sem-conta': 'Não achei essa conta. Confira o nome ou toque em "Criar conta".',
  'senha-errada': 'Senha errada 😅',
  'senha-curta': 'A senha precisa de pelo menos 3 caracteres.',
  nome: 'O nome precisa ter de 2 a 14 letras.',
};
async function submitAuth() {
  const name = $('auth-name').value.trim(), pass = $('auth-pass').value;
  if (name.length < 2) { $('auth-error').textContent = AUTH_ERR.nome; return; }
  if (pass.length < 3) { $('auth-error').textContent = AUTH_ERR['senha-curta']; return; }
  FT.audio.init();
  const btn = $('btn-auth'); btn.disabled = true; $('auth-error').textContent = '';
  const r = await api.auth({ action: authMode, name, pass });
  btn.disabled = false;
  if (!r) { $('auth-error').textContent = 'Sem conexão com o servidor. Tente de novo em instantes.'; return; }
  if (r.error) { $('auth-error').textContent = AUTH_ERR[r.error] || 'Não deu certo. Tente de novo.'; return; }
  acct = { pid: r.pid, token: r.token, name: r.name, look: r.look || {} };
  saveAcct(acct);
  toWardrobe();
}
function toWardrobe() {
  mode = 'wardrobe';
  $('screen-home').hidden = true;
  $('screen-wardrobe').hidden = false;
  const hasLook = acct.look && Object.keys(acct.look).length >= 8;
  ui.show({ name: acct.name, look: hasLook ? acct.look : null });
  size();
}

async function boot() {
  cfg = (await api.config()) || {};
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  acct = loadAcct();
  wardrobe = createWardrobe(quality, (acct && acct.look && Object.keys(acct.look).length >= 8 ? acct.look : S.DEFAULT_LOOK));
  gameCam = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 60);
  post = createPost(renderer, wardrobe.scene, wardrobe.camera, quality);
  post.canvas = renderer.domElement;

  ui = initWardrobeUI({
    onLook: (l) => wardrobe.setLook(l),
    onPose: (p) => wardrobe.setPose(p),
    onTurn: () => wardrobe.turnAround(),
    onEnter: enter,
    onDrawer: () => setTimeout(size, 320),
    onLogout: () => { clearAcct(); acct = null; showHome(); },
  });

  // página inicial
  document.querySelectorAll('#auth-tabs button').forEach((b) => { b.onclick = () => setAuthMode(b.dataset.m); });
  $('btn-auth').onclick = submitAuth;
  $('auth-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
  $('auth-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('auth-pass').focus(); });
  $('auth-eye').onclick = () => { const p = $('auth-pass'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('btn-continue').onclick = () => { FT.audio.init(); toWardrobe(); };
  $('btn-switch').onclick = () => { clearAcct(); acct = null; showHome(); setAuthMode('login'); };
  setAuthMode('login');

  showHome();
  window.addEventListener('resize', size);
  window.addEventListener('orientationchange', () => setTimeout(size, 250));

  // arrastar pra girar o personagem
  const gl = renderer.domElement;
  let dragId = null, lx = 0;
  gl.addEventListener('pointerdown', (e) => { if (mode !== 'wardrobe') return; dragId = e.pointerId; lx = e.clientX; gl.setPointerCapture(e.pointerId); });
  gl.addEventListener('pointermove', (e) => { if (mode !== 'wardrobe' || e.pointerId !== dragId) return; wardrobe.drag(e.clientX - lx); lx = e.clientX; });
  const dEnd = (e) => { if (e.pointerId === dragId) { dragId = null; wardrobe.dragEnd(); } };
  gl.addEventListener('pointerup', dEnd); gl.addEventListener('pointercancel', dEnd);
  $('btn-edit').addEventListener('click', backToWardrobe);

  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}

async function enter({ look }) {
  FT.audio.init();
  const btn = $('btn-enter'); btn.disabled = true; btn.textContent = 'ENTRANDO…'; $('enter-error').textContent = '';
  const r = await api.join({ pid: acct.pid, token: acct.token, look });
  btn.disabled = false; btn.textContent = 'ENTRAR NO BUTECO 🍺';
  if (!r) { $('enter-error').textContent = 'Sem conexão com o servidor. Tente de novo.'; return; }
  if (r.error === 401) { clearAcct(); acct = null; showHome('Sua sessão expirou. Entre de novo.'); return; }
  if (r.error || !r.pid) { $('enter-error').textContent = 'Não consegui entrar agora. Tente de novo.'; return; }
  acct.look = look; saveAcct(acct);
  const session = { pid: acct.pid, token: acct.token, name: acct.name, look, beers: r.beers, points: r.points, vape: r.vape, bottle: r.bottle, glass: r.glass, notice: r.notice, offline: false };
  await new Promise((res) => setTimeout(res, 30));
  if (!bar) { bar = createBar(quality); bar.scene.add(gameCam); }
  if (!game) game = createGame({ bar, camera: gameCam, post, cfg, quality });
  post.setScene(bar.scene, gameCam);
  $('screen-wardrobe').hidden = true;
  mode = 'game';
  game.start(session);
  window.__game = game.debug;
}

function backToWardrobe() {
  if (mode !== 'game') return;
  game.stop();
  post.setScene(wardrobe.scene, wardrobe.camera);
  toWardrobe();
}

// se ficar lento, desliga bloom/sombras e reduz a resolução
let fpsAcc = 0, fpsN = 0, fpsT = 0, tuned = quality !== 'high';
function autoTune(dt) {
  if (tuned || mode !== 'game') return;
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 4) {
    const fps = fpsN / fpsAcc;
    if (fps < 28) {
      tuned = true; quality = 'low'; dpr = 1;
      if (post.bloom) post.bloom.enabled = false;
      if (bar) bar.setShadows(false);
      size();
    }
    fpsAcc = fpsN = fpsT = 0;
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;
  if (mode === 'game') { game.update(dt, t); autoTune(dt); }
  else { wardrobe.update(dt, t); post.setEffects(t, 0, 0, 0); if (mode === 'home') wardrobe.orbit(t); }
  post.render(dt);
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  $('loading').innerHTML = '<div class="neon">FIOTÕES</div><p>Seu navegador não conseguiu abrir o 3D. Tente atualizar o Chrome/Safari.</p>';
});
