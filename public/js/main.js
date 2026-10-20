// Entrada: guarda-roupa -> buteco. Cuida do renderer, das cenas e da sessão (Neon via API).
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

const KEY = `buteco:${NS}:profile`;
const loadProfile = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
const saveProfile = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ok */ } };

let renderer, post, wardrobe, bar = null, game = null, gameCam, ui, cfg = {};
let mode = 'wardrobe', t = 0, last = performance.now();
let dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1);

function size() {
  const w = window.innerWidth, h = window.innerHeight;
  post.setSize(w, h, dpr);
  const drawerW = $('drawer') && window.innerWidth > 820 && window.innerWidth / window.innerHeight > 1 ? $('drawer').offsetWidth : 0;
  const dr = $('drawer');
  const portrait = w / h < 0.9 || w <= 820;
  const drawerH = portrait && dr.classList.contains('open') ? dr.offsetHeight : 0;
  wardrobe.resize(w, h, drawerW, drawerH);
  gameCam.aspect = w / h; gameCam.updateProjectionMatrix();
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

  const profile = loadProfile();
  wardrobe = createWardrobe(quality, (profile && profile.look) || S.DEFAULT_LOOK);
  gameCam = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 60);
  post = createPost(renderer, wardrobe.scene, wardrobe.camera, quality);
  post.canvas = renderer.domElement;

  ui = initWardrobeUI({
    onLook: (l) => wardrobe.setLook(l),
    onPose: (p) => wardrobe.setPose(p),
    onTurn: () => wardrobe.turnAround(),
    onEnter: enter,
    onDrawer: () => setTimeout(size, 320),
  });
  ui.show(profile);
  $('screen-wardrobe').hidden = false;
  size();
  window.addEventListener('resize', size);

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

async function enter({ name, look }) {
  FT.audio.init();
  const btn = $('btn-enter'); btn.disabled = true; btn.textContent = 'ENTRANDO…'; $('enter-error').textContent = '';
  const prof = loadProfile();
  const r = await api.join({ pid: prof && prof.pid, token: prof && prof.token, name, look });
  let session;
  if (r && r.pid) {
    saveProfile({ pid: r.pid, token: r.token, name, look });
    session = { pid: r.pid, token: r.token, name, look, beers: r.beers, points: r.points, vape: r.vape, bottle: r.bottle, glass: r.glass, notice: r.notice, offline: false };
  } else {
    saveProfile({ pid: (prof && prof.pid) || 'local-' + Math.random().toString(36).slice(2, 8), token: '', name, look });
    session = { pid: loadProfile().pid, token: '', name, look, beers: 0, offline: true };
  }
  btn.disabled = false; btn.textContent = 'ENTRAR NO BUTECO 🍺';
  await new Promise((res) => setTimeout(res, 30));
  if (!bar) { bar = createBar(quality); bar.scene.add(gameCam); }
  if (!game) game = createGame({ bar, camera: gameCam, post, cfg, quality });
  post.setScene(bar.scene, gameCam);
  $('screen-wardrobe').hidden = true;
  mode = 'game';
  game.start(session);
  if (session.offline) setTimeout(() => { const d = document.createElement('div'); d.textContent = 'Servidor fora do ar: jogando sem ranking online'; $('toast').appendChild(d); setTimeout(() => d.remove(), 3700); }, 600);
  window.__game = game.debug;
}

function backToWardrobe() {
  if (mode !== 'game') return;
  game.stop();
  mode = 'wardrobe';
  post.setScene(wardrobe.scene, wardrobe.camera);
  $('screen-wardrobe').hidden = false;
  ui.show(loadProfile());
  size();
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
  if (mode === 'wardrobe') { wardrobe.update(dt, t); post.setEffects(t, 0, 0, 0); }
  else { game.update(dt, t); autoTune(dt); }
  post.render(dt);
  requestAnimationFrame(frame);
}

boot().catch((e) => {
  console.error(e);
  $('loading').innerHTML = '<div class="neon">FIOTÕES</div><p>Seu navegador não conseguiu abrir o 3D. Tente atualizar o Chrome/Safari.</p>';
});
