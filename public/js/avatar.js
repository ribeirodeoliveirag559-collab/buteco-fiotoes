// Avatar 3D em blocos. As texturas vêm do mesmo gerador de pixel art usado nas miniaturas
// (sprites.js), então o que você escolhe no guarda-roupa é exatamente o que aparece no bar.
import * as THREE from 'three';
import { rbox } from './shapes.js';
import { toTex, straw, noise } from './textures.js';
import { makeHat } from './gear-hats.js';
import { paintFace, paintSide, paintTop, hairTexture } from './face.js';
import { makeShoe } from './gear-shoes.js';
import { NEW_SHIRTS, buildTorso, buildArm, buildPelvis, buildLeg, hasPants } from './gear-cloth.js';

const FT = window.FT;
const S = FT.sprites;

// medidas em metros
const HEAD = 0.4, NECK = 0.04, TORSO_H = 0.6, TORSO_W = 0.54, TORSO_D = 0.27, LEG_H = 0.74, LEG_W = 0.235, ARM_L = 0.6, ARM_W = 0.14;
const SHOULDER_Y = LEG_H + TORSO_H - 0.05;
// alvos do braço direito (espaço do corpo): boca e altura do peito
const _DOWN = new THREE.Vector3(0, -1, 0);
const _SH = new THREE.Vector3(-(TORSO_W / 2 + ARM_W / 2), SHOULDER_Y, 0);
const _MOUTH = new THREE.Vector3(-0.03, LEG_H + TORSO_H + NECK + HEAD * 0.28, HEAD / 2 + 0.2).sub(_SH).normalize();
const _CHEST = new THREE.Vector3(-0.16, LEG_H + TORSO_H * 0.62, 0.36).sub(_SH).normalize();
const _AQ = new THREE.Quaternion(), _IQ = new THREE.Quaternion(), _DQ = new THREE.Quaternion(), _E = new THREE.Euler();
export const EYE_HEIGHT = LEG_H + TORSO_H + NECK + HEAD * 0.55;


function crop(src, x, y, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}
function sample(c, x, y) {
  const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
  return `rgb(${d[0]},${d[1]},${d[2]})`;
}
const nt = (c) => toTex(c, { nearest: true });

// ---------- texturas de roupa em alta resolução ----------
// Amplia o pixel art 8x e desenha a trama do tecido por cima (camisa = trama, jeans = sarja diagonal,
// couro = brilho), mantendo a pele lisa. Fica bem mais rico de perto, sem perder o estilo.
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function enhance(src, skinHex, kind) {
  const K = 8, w = src.width, h = src.height;
  const out = document.createElement('canvas'); out.width = w * K; out.height = h * K;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, w * K, h * K);
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const sk = rgbOf(skinHex);
  const isSkin = (i) => Math.abs(d[i] - sk[0]) + Math.abs(d[i + 1] - sk[1]) + Math.abs(d[i + 2] - sk[2]) < 70;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 10) continue;
    const X = x * K, Y = y * K;
    if (isSkin(i)) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(X, Y, K, 2); continue; }
    const blue = d[i + 2] > d[i] + 25 && d[i + 2] > d[i + 1];
    if (kind === 'pants' && blue) { // sarja do jeans
      for (let k = -K; k < K; k += 3) { g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(X + ((k + Y) % K + K) % K, Y + (k + K) % K, 1, 1); }
      for (let yy = 0; yy < K; yy++) { g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(X + ((yy * 2) % K), Y + yy, 2, 1); g.fillStyle = 'rgba(0,0,10,.08)'; g.fillRect(X + ((yy * 2 + 4) % K), Y + yy, 2, 1); }
    } else if (kind === 'shoes') {
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(X + 1, Y + 1, 3, 1);
    } else { // trama de tecido
      for (let yy = 0; yy < K; yy += 2) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(X, Y + yy, K, 1); }
      for (let xx = 1; xx < K; xx += 2) { g.fillStyle = 'rgba(0,0,0,.06)'; g.fillRect(X + xx, Y, 1, K); }
    }
  }
  // sombreado suave (luz de cima) e ruído fino
  const gr = g.createLinearGradient(0, 0, 0, h * K);
  gr.addColorStop(0, 'rgba(255,255,255,.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.16)');
  g.fillStyle = gr; g.fillRect(0, 0, w * K, h * K);
  for (let n = 0; n < w * h * 3; n++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(Math.random() * w * K, Math.random() * h * K, 1, 1); }
  return out;
}
function hiTex(c) {
  const t = toTex(c, { aniso: 8 });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
const lam = (opts) => new THREE.MeshLambertMaterial(opts);

function sideHead(skin, hair, hairId, rows) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 16, 16);
  if (rows > 0) { g.fillStyle = hair; g.fillRect(0, 0, 16, rows); }
  if (hairId === 'degrade') { g.fillStyle = hair; g.globalAlpha = 0.5; g.fillRect(0, rows, 16, 2); g.globalAlpha = 0.25; g.fillRect(0, rows + 2, 16, 2); g.globalAlpha = 1; }
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(6, 8, 4, 4); // orelha
  return c;
}
const HAIR_ROWS = { careca: 0, curto: 5, degrade: 5, oldmoney: 5, topete: 5, ondulado: 16, mullet: 16, longo: 16 };

export function makeMug() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.045, 0.13, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe6f4ff, transparent: true, opacity: 0.22, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })
  );
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5, roughness: 0.1 }));
  base.position.y = -0.065;
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.042, 0.115, 16), new THREE.MeshStandardMaterial({ color: 0xf2a81d, emissive: 0x6a3a00, emissiveIntensity: 0.3, roughness: 0.4 }));
  liquid.geometry.translate(0, 0.0575, 0); liquid.position.y = -0.058;
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xfff6dc, roughness: 0.9, emissive: 0x222018, emissiveIntensity: 0.12 }));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.4, roughness: 0.1 }));
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.05, 0, 0);
  const bubbles = [];
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.0035 + Math.random() * 0.003, 6, 4), bubMat);
    b.userData = { a: Math.random() * 6.28, r: Math.random() * 0.03, sp: 0.03 + Math.random() * 0.05, y: Math.random() };
    bubbles.push(b); g.add(b);
  }
  g.add(glass, base, liquid, foam, handle);
  g.userData = { liquid, foam, bubbles, level: 1, tickBubbles(dt) { const lv = this.level; bubbles.forEach((b) => { const u = b.userData; u.y += dt * u.sp / Math.max(0.05, lv * 0.115); if (u.y > 1) u.y = 0; b.visible = lv > 0.06; b.position.set(Math.cos(u.a) * u.r, -0.055 + u.y * lv * 0.112, Math.sin(u.a) * u.r); }); }, setLevel(v) { this.level = v; liquid.scale.y = Math.max(0.001, v); liquid.visible = v > 0.01; foam.position.y = -0.058 + 0.115 * v + 0.012; foam.visible = v > 0.04; } };
  g.userData.setLevel(1);
  return g;
}
export function makeBottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x5a3410, roughness: 0.2, metalness: 0.1, emissive: 0x2a1404, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.2, 14), glass); body.position.y = 0.1;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.036, 0.06, 14), glass); shoulder.position.y = 0.23;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.07, 10), glass); neck.position.y = 0.295;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 10), new THREE.MeshStandardMaterial({ color: 0xe8c040, metalness: 0.8, roughness: 0.3 })); cap.position.y = 0.335;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0415, 0.0415, 0.08, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf1e3b0, roughness: 0.8, side: THREE.DoubleSide })); label.position.y = 0.1;
  [body, shoulder, neck, cap, label].forEach((m) => { m.castShadow = true; g.add(m); });
  return g;
}
export function makeVape() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(rbox(0.03, 0.115, 0.018), new THREE.MeshStandardMaterial({ color: 0x1b1d26, roughness: 0.3, metalness: 0.6 }));
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.028, 8), new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.7, roughness: 0.3 })); tip.position.y = 0.07;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x35e0ff).multiplyScalar(2.2) })); led.position.set(0, -0.045, 0.01);
  g.add(body, tip, led);
  g.userData = { led };
  return g;
}
export function makeJoint() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xf1ede0, roughness: 0.9 }));
  paper.rotation.x = Math.PI / 2;
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  ember.position.z = -0.052;
  g.add(paper, ember);
  g.userData = { ember };
  return g;
}

export function hatMesh(id) {
  const hat = S.HATS.find((h) => h.id === id);
  if (!hat || id === 'nenhum') return null;
  return makeHat(id, hat.c);
}

function hairMeshes(id, color, underHat = false) {
  const out = [];
  if (id === 'careca') return out;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: toTex(hairTexture(color), { aniso: 8 }), roughness: 0.62 });
  const H = HEAD;
  const add = (w, h, d, x, y, z, rx = 0, top = false) => {
    if (top && underHat) return; // o chapéu tampa o cabelo do topo da cabeça
    const b = new THREE.Mesh(rbox(w, h, d, Math.min(w, h, d) * 0.45), m);
    b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; out.push(b);
  };
  switch (id) {
    case 'curto': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0, 0, true); break;
    case 'degrade': add(H * 1.0, 0.1, H * 1.0, 0, H / 2 + 0.005, 0, 0, true); break;
    case 'oldmoney': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0, 0, true); add(H * 0.9, 0.12, 0.05, 0, H / 2 - 0.05, -H / 2 - 0.02); break;
    case 'topete': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0, 0, true); add(H * 0.92, 0.1, H * 0.6, 0, H / 2 + 0.07, H * 0.18, -0.28, true); break;
    case 'ondulado':
      add(H * 1.14, 0.14, H * 1.14, 0, H / 2 - 0.005, 0, 0, true);
      add(0.05, H * 0.72, H * 1.0, H / 2 + 0.03, -0.02, 0); add(0.05, H * 0.72, H * 1.0, -H / 2 - 0.03, -0.02, 0);
      add(H * 1.1, H * 0.78, 0.06, 0, -0.03, -H / 2 - 0.03);
      break;
    case 'longo':
      add(H * 1.14, 0.14, H * 1.14, 0, H / 2 - 0.005, 0, 0, true);
      add(0.05, H * 1.5, H * 0.95, H / 2 + 0.03, -H * 0.5, -0.02); add(0.05, H * 1.5, H * 0.95, -H / 2 - 0.03, -H * 0.5, -0.02);
      add(H * 1.12, H * 2.1, 0.07, 0, -H * 0.95, -H / 2 - 0.04);
      break;
    case 'mullet':
      add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0, 0, true);
      add(H * 0.95, H * 1.25, 0.06, 0, -H * 0.42, -H / 2 - 0.03);
      add(0.04, H * 0.75, 0.14, H / 2 + 0.02, -0.04, -0.06); add(0.04, H * 0.75, 0.14, -H / 2 - 0.02, -0.04, -0.06);
      break;
  }
  return out;
}

export function createAvatar(lookIn, opts = {}) {
  const root = new THREE.Group();
  const model = new THREE.Group(); // inclinações (bêbado, nocaute)
  root.add(model);
  const P = {}; // peças
  let look = null, red = false, wink = false, disposables = [];
  const st = { speed: 0, drink: 0, smoke: 0, ko: 0, drunk: 0, phase: 0, t: Math.random() * 10 };
  let nameSprite = null, bubble = null, bubbleUntil = 0, nameText = opts.name || '';

  const track = (o) => { disposables.push(o); return o; };
  function clear() {
    while (model.children.length) model.remove(model.children[0]);
    disposables.forEach((d) => d.dispose && d.dispose());
    disposables = [];
  }

  function mkMat(canvasOrColor, kind) {
    if (typeof canvasOrColor === 'string') return track(lam({ color: canvasOrColor }));
    if (kind) return track(new THREE.MeshStandardMaterial({ map: track(hiTex(enhance(canvasOrColor, skinHexNow, kind))), roughness: kind === 'shoes' ? 0.45 : 0.85 }));
    return track(lam({ map: track(nt(canvasOrColor)) }));
  }
  let skinHexNow = '#e5b184';

  function build(lk) {
    clear();
    look = opts.npc ? lk : S.sanitizeLook(lk);
    const bare = Object.assign({}, look, { hat: 'nenhum', shoes: '_none' });
    const down = S.get(bare, { dir: 'down' });
    const up = S.get(bare, { dir: 'up' });
    const skinC = (S.SKINS.find((s) => s.id === look.skin) || S.SKINS[1]).c;
    skinHexNow = skinC;
    const hairC = (S.HAIRCOLORS.find((s) => s.id === look.hairColor) || S.HAIRCOLORS[0]).c;
    const hairId = look.hair;

    const faceFront = crop(down, 12, 10, 16, 16);
    const faceBack = crop(up, 12, 10, 16, 16);
    const redLook = S.get(bare, { dir: 'down', red: true });
    const faceFrontRed = crop(redLook, 12, 10, 16, 16);
    const winkLook = S.get(Object.assign({}, bare, { eyes: 'piscadinha' }), { dir: 'down' });
    const faceFrontWink = crop(winkLook, 12, 10, 16, 16);
    const torsoF = crop(down, 10, 28, 20, 23), torsoB = crop(up, 10, 28, 20, 23);
    const shirtC = sample(torsoF, 1, 6);
    const rows = HAIR_ROWS[hairId] ?? 5;
    const topC = document.createElement('canvas'); topC.width = 16; topC.height = 16;
    {
      const g = topC.getContext('2d');
      g.fillStyle = hairId === 'careca' ? skinC : hairC; g.fillRect(0, 0, 16, 16);
    }
    const sideC = sideHead(skinC, hairC, hairId, rows);

    // cabeça
    const underHat = !!(look.hat && look.hat !== 'nenhum');
    const hm2 = (cv) => track(new THREE.MeshStandardMaterial({ map: track(toTex(cv, { aniso: 8 })), roughness: 0.72 }));
    const sideHi = paintSide(look, skinC, hairC), backHi = paintSide(look, skinC, hairC, true), topHi = paintTop(look, skinC, hairC);
    const headMats = [hm2(sideHi), hm2(sideHi), hm2(topHi), mkMat(skinC), hm2(paintFace(look, skinC, hairC, { underHat })), hm2(backHi)];
    const head = new THREE.Mesh(track(rbox(HEAD, HEAD, HEAD, HEAD * 0.3)), headMats);
    head.castShadow = true;
    const headG = new THREE.Group();
    headG.position.y = LEG_H + TORSO_H + NECK + HEAD / 2;
    headG.add(head);
    const hm = hatMesh(look.hat);
    hairMeshes(hairId, hairC, !!hm).forEach((h) => { headG.add(h); track(h.geometry); track(h.material); });
    if (hm) { hm.position.y = HEAD / 2 - 0.045; headG.add(hm); hm.traverse((o) => { if (o.isMesh) { track(o.geometry); if (!(o.material.userData && o.material.userData.shared)) track(o.material); } }); }
    P.faceMat = headMats[4]; P.faceNormal = headMats[4]; P.faceRed = hm2(paintFace(look, skinC, hairC, { underHat, red: true })); P.faceWink = hm2(paintFace(look, skinC, hairC, { underHat, wink: true }));
    model.add(headG);
    P.head = headG;

    // pescoço
    const neck = new THREE.Mesh(track(rbox(0.16, NECK + 0.02, 0.14)), mkMat(skinC));
    neck.position.y = LEG_H + TORSO_H + NECK / 2;
    model.add(neck);

    // tronco: camisas novas = modelo 3D com ombros/gola/estampa em alta; as escondidas (NPC: top, vestido, sobretudo) seguem no modelo antigo
    const newShirt = NEW_SHIRTS.has(look.shirt);
    const trackTree = (o) => o.traverse((m) => { if (m.isMesh) { track(m.geometry); if (!(m.material.userData && m.material.userData.shared)) track(m.material); } });
    let torso;
    if (newShirt) { torso = buildTorso(look.shirt, skinC); trackTree(torso); }
    else {
      const torsoMats = [mkMat(shirtC), mkMat(shirtC), mkMat(shirtC), mkMat(shirtC), mkMat(torsoF, 'shirt'), mkMat(torsoB, 'shirt')];
      torso = new THREE.Mesh(track(rbox(TORSO_W, TORSO_H, TORSO_D)), torsoMats);
      torso.position.y = LEG_H + TORSO_H / 2; torso.castShadow = true;
    }
    model.add(torso);
    P.torso = torso;
    const pantsId = hasPants(look.pants) ? look.pants : 'jeans-azul';
    const pelvis = buildPelvis(pantsId); trackTree(pelvis); model.add(pelvis); P.pelvis = pelvis;

    // saia do vestido
    if (look.shirt && look.shirt.startsWith('vestido')) {
      const sc = sample(torsoF, 3, 20);
      const skirt = new THREE.Mesh(track(new THREE.CylinderGeometry(TORSO_W * 0.62, TORSO_W * 0.86, 0.34, 14)), mkMat(sc));
      skirt.position.y = LEG_H - 0.04; skirt.castShadow = true;
      model.add(skirt);
    }
    // casaco comprido (HOMEM)
    if (look.shirt === 'sobretudo') {
      const coat = new THREE.Mesh(track(rbox(TORSO_W + 0.04, 0.55, TORSO_D + 0.05)), mkMat('#2c2824'));
      coat.position.y = LEG_H - 0.2; coat.castShadow = true;
      model.add(coat);
    }

    // braços
    const mkArm = (x0, sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (TORSO_W / 2 + ARM_W / 2 + (newShirt ? 0.0 : 0.005)), SHOULDER_Y, 0);
      if (newShirt) { const ag = buildArm(look.shirt, skinC, sx); trackTree(ag); pivot.add(ag); }
      else {
        const ac = crop(down, x0, 28, 5, 21);
        const am = mkMat(ac, 'shirt');
        const geo = track(rbox(ARM_W, ARM_L, ARM_W));
        geo.translate(0, -ARM_L / 2, 0);
        const arm = new THREE.Mesh(geo, [am, am, mkMat(shirtC), mkMat(skinC), am, am]);
        arm.castShadow = true;
        pivot.add(arm);
      }
      model.add(pivot);
      return pivot;
    };
    P.armL = mkArm(30, 1);   // lado +x da tela = braço esquerdo do avatar
    P.armR = mkArm(5, -1);   // braço direito do avatar (segura caneca/baseado)
    P.handL = new THREE.Group(); P.handL.position.set(0, -ARM_L + 0.02, 0.02); P.armL.add(P.handL);
    P.bottle = makeBottle(); P.bottle.scale.setScalar(0.75); P.bottle.position.set(0, 0.05, 0.05); P.bottle.visible = false; P.handL.add(P.bottle);
    // item na mão direita
    P.hand = new THREE.Group();
    P.hand.position.set(0, -ARM_L + 0.02, 0.0);
    P.armR.add(P.hand);
    P.mug = makeMug(); P.mug.position.set(0, 0.0, 0.0); P.mug.visible = false; P.hand.add(P.mug);
    P.joint = makeJoint(); P.joint.position.set(0, 0, 0.03); P.joint.visible = false; P.hand.add(P.joint);
    P.vape = makeVape(); P.vape.position.set(0, 0.02, 0.03); P.vape.visible = false; P.hand.add(P.vape);

    // pernas: pele + calça (com barra) + calçado, cada um com modelo 3D próprio
    const mkLeg = (sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.14, LEG_H, 0);
      const lg = buildLeg(pantsId, skinC); trackTree(lg); pivot.add(lg);
      const shoe = makeShoe(look.shoes, skinC); shoe.position.y = -LEG_H;
      trackTree(shoe);
      pivot.add(shoe);
      model.add(pivot);
      return pivot;
    };
    P.legL = mkLeg(1);
    P.legR = mkLeg(-1);
    if (opts.curvy) {
      P.legL.scale.x = P.legR.scale.x = 1.2; P.legL.position.x = 0.16; P.legR.position.x = -0.16;
      pelvis.scale.set(1.16, 1, 1.12);
      headG.scale.setScalar(0.94);
    }
    applyRed();
  }

  function applyRed() {
    if (!P.head) return;
    const head = P.head.children[0];
    head.material[4] = wink ? P.faceWink : red ? P.faceRed : P.faceNormal;
  }

  function makeNameSprite() {
    if (nameSprite) { root.remove(nameSprite); nameSprite.material.map.dispose(); nameSprite.material.dispose(); }
    const c = document.createElement('canvas'); c.width = 384; c.height = 80;
    const g = c.getContext('2d');
    g.font = '900 40px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineJoin = 'round';
    g.strokeText(nameText, 192, 42); g.fillStyle = '#fff'; g.fillText(nameText, 192, 42);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    nameSprite.scale.set(0.95, 0.2, 1);
    nameSprite.position.y = 2.05;
    nameSprite.renderOrder = 10;
    root.add(nameSprite);
  }

  function say(text, ms = 5000) {
    if (bubble) { root.remove(bubble); bubble.material.map.dispose(); bubble.material.dispose(); bubble = null; }
    if (!text) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.font = '800 34px Nunito, sans-serif';
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > 440 && cur) { lines.push(cur); cur = w; } else cur = t; }
    lines.push(cur);
    const ls = lines.slice(0, 3);
    const bw = Math.min(480, Math.max(...ls.map((l) => g.measureText(l).width)) + 36), bh = ls.length * 40 + 24;
    const x0 = (512 - bw) / 2, y0 = 156 - bh - 14;
    g.fillStyle = 'rgba(255,255,255,.96)'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x0, y0, bw, bh, 16); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(236, y0 + bh - 1); g.lineTo(256, y0 + bh + 14); g.lineTo(276, y0 + bh - 1); g.fill();
    g.fillStyle = '#1b1020'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ls.forEach((l, i) => g.fillText(l, 256, y0 + 12 + 20 + i * 40));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    bubble.scale.set(2.0, 0.625, 1);
    bubble.position.y = 2.55; bubble.renderOrder = 11;
    root.add(bubble);
    bubbleUntil = performance.now() + ms;
  }

  const api = {
    root, P, st,
    get look() { return look; },
    setLook(lk) { build(lk); },
    setRed(v) { if (v !== red) { red = v; applyRed(); } },
    setWink(v) { if (v !== wink) { wink = v; applyRed(); } },
    setName(n) { nameText = n; if (!opts.noName) makeNameSprite(); },
    say,
    showName(v) { if (nameSprite) nameSprite.visible = v; },
    update(dt) {
      st.t += dt;
      const sp = st.speed;
      st.phase += dt * (3 + sp * 7);
      const sw = Math.sin(st.phase) * 0.75 * Math.min(1, sp * 1.4);
      const idle = Math.sin(st.t * 1.6) * 0.03;
      const armPose = Math.max(st.drink, st.smoke, st.vape || 0);
      if (P.legL) {
        P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
        P.armL.rotation.x = st.bottle ? -1.15 + idle : -sw * 0.8 + idle;
        P.bottle.visible = !!st.bottle;
        if (st.bottle) P.bottle.rotation.x = -P.armL.rotation.x;
        // mão até a boca (beber / tragar) ou na altura do peito (segurando o baseado/pod)
        const toMouth = !!(st.drink || st.mouth);
        if (armPose) {
          _AQ.setFromUnitVectors(_DOWN, toMouth ? _MOUTH : _CHEST);
          P.armR.quaternion.slerp(_AQ, Math.min(1, dt * (toMouth ? 9 : 6)));
        } else {
          P.armR.rotation.x += (sw * 0.8 + idle - P.armR.rotation.x) * Math.min(1, dt * 10);
          P.armR.rotation.y *= 0.8; P.armR.rotation.z += (0.04 - P.armR.rotation.z) * Math.min(1, dt * 10);
        }
        P.armL.rotation.z = -0.04;
        P.head.rotation.x += ((st.drink ? -0.45 : st.mouth ? -0.15 : 0.0) + Math.sin(st.t * 0.8) * 0.02 - P.head.rotation.x) * Math.min(1, dt * 8);
        P.head.rotation.z = Math.sin(st.t * 1.3) * 0.1 * st.drunk;
        P.mug.visible = !!st.drink; P.joint.visible = !!st.smoke; P.vape.visible = !!st.vape;
        // objetos na mão ficam na orientação certa (copo inclinado pra boca, pod com a ponta na boca)
        const orient = (obj, ex, ey, ez) => { _DQ.setFromEuler(_E.set(ex, ey, ez)); obj.quaternion.copy(_IQ.copy(P.armR.quaternion).invert()).multiply(_DQ); };
        if (st.vape) orient(P.vape, toMouth ? -0.5 : 0.1, 0, 0);
        if (st.drink) orient(P.mug, -0.55, 0, 0);
        if (st.smoke) { orient(P.joint, 0, Math.PI + (toMouth ? 0 : 0.6), 0); P.joint.userData.ember.scale.setScalar(1 + Math.sin(st.t * 12) * 0.2 + (toMouth ? 0.5 : 0)); }
        const bob = Math.abs(Math.sin(st.phase)) * 0.04 * Math.min(1, sp * 1.4);
        torsoBob(bob);
      }
      // danca (camarote)
      if (st.dance && P.legL) {
        const d = st.t * 5.2 + (st.seed || 0);
        P.legL.rotation.x = Math.sin(d) * 0.32; P.legR.rotation.x = -Math.sin(d) * 0.32;
        P.armL.rotation.x = -2.6 + Math.sin(d * 0.9) * 0.4; P.armL.rotation.z = -0.5 - Math.sin(d) * 0.3;
        P.armR.rotation.x = -2.6 + Math.cos(d * 0.9) * 0.4; P.armR.rotation.z = 0.5 + Math.cos(d) * 0.3;
        model.rotation.y = Math.sin(d * 0.5) * 0.45;
        model.position.y = Math.abs(Math.sin(d)) * 0.05;
        P.head.rotation.z = Math.sin(d * 0.5) * 0.14;
      } else if (model.rotation.y) model.rotation.y *= 0.9;
      // bêbado: balanço do corpo todo / nocaute: deitado
      const koT = st.ko;
      if (st.crawl && P.legL) { // de quatro: joelhos e mãos no chão
        const cw = Math.sin(st.t * 6) * 0.12; // engatinhando: tronco na horizontal, braços retos no chão, pernas para trás
        P.legL.rotation.set(-1.0 + cw, 0, 0.05); P.legR.rotation.set(-1.0 - cw, 0, -0.05);
        P.armL.rotation.set(-1.57 - cw, 0, -0.06); P.armR.rotation.set(-1.57 + cw, 0, 0.06);
        P.head.rotation.x = -1.05; P.head.rotation.z = 0; P.mug.visible = P.joint.visible = P.vape.visible = P.bottle.visible = false;
      }
      model.rotation.z = Math.sin(st.t * 1.7) * 0.09 * st.drunk * (1 - koT) * (st.crawl ? 0 : 1);
      if (st.fly) { model.rotation.x += dt * 11; model.rotation.z += dt * 4; }
      else {
        const rx = koT ? -Math.PI / 2 : st.crawl ? 1.57 : Math.sin(st.t * 1.1) * 0.05 * st.drunk;
        model.rotation.x += (rx - model.rotation.x) * Math.min(1, dt * (st.crawl ? 9 : 6));
      }
      model.position.z += ((st.crawl ? -1.04 : 0) - model.position.z) * Math.min(1, dt * 9);
      if (!st.dance) model.position.y += (((koT ? 0.18 : st.crawl ? 0.6 : 0) + (st.air || 0)) - model.position.y) * Math.min(1, dt * (st.fly ? 30 : 6));
      if (bubble && performance.now() > bubbleUntil) { root.remove(bubble); bubble.material.map.dispose(); bubble.material.dispose(); bubble = null; }
    },
    dispose() { clear(); if (nameSprite) nameSprite.material.map.dispose(); },
  };
  function torsoBob(b) { if (P.torso) { P.head.position.y = LEG_H + TORSO_H + NECK + HEAD / 2 + b; P.torso.position.y = LEG_H + TORSO_H / 2 + b * 0.6; } }
  if (!opts.noName) makeNameSprite();
  build(lookIn);
  return api;
}

// cor da camisa / pele (usado nas mãos em primeira pessoa)
export function lookColors(look) {
  const lk = S.sanitizeLook(look);
  const bare = Object.assign({}, lk, { hat: 'nenhum' });
  const down = S.get(bare, { dir: 'down' });
  const torsoF = crop(down, 10, 28, 20, 23);
  const armC = crop(down, 30, 28, 5, 21);
  const skin = (S.SKINS.find((s) => s.id === lk.skin) || S.SKINS[1]).c;
  const longSleeve = ['cowboy'].includes(lk.shirt);
  return { shirt: sample(torsoF, 1, 6), skin, sleeve: longSleeve ? sample(torsoF, 1, 6) : null, armCanvas: armC };
}
