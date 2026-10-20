// Avatar 3D em blocos. As texturas vêm do mesmo gerador de pixel art usado nas miniaturas
// (sprites.js), então o que você escolhe no guarda-roupa é exatamente o que aparece no bar.
import * as THREE from 'three';
import { toTex, straw, noise } from './textures.js';

const FT = window.FT;
const S = FT.sprites;

// medidas em metros
const HEAD = 0.4, NECK = 0.04, TORSO_H = 0.6, TORSO_W = 0.54, TORSO_D = 0.27, LEG_H = 0.74, LEG_W = 0.235, ARM_L = 0.6, ARM_W = 0.14;
const SHOULDER_Y = LEG_H + TORSO_H - 0.05;
export const EYE_HEIGHT = LEG_H + TORSO_H + NECK + HEAD * 0.55;

const FOOT = {
  americana: { w: 0.255, h: 0.11, l: 0.34, c: '#8b5a2b', sole: '#2a1a10', taper: 1 },
  'bico-fino': { w: 0.22, h: 0.1, l: 0.44, c: '#3a2216', sole: '#1a0f09', taper: 0.22 },
  'botina-amarela': { w: 0.27, h: 0.13, l: 0.35, c: '#e6b422', sole: '#efe3c3', taper: 0.9 },
  'chinelo-couro': { w: 0.2, h: 0.035, l: 0.34, c: '#9b6a3c', sole: '#7a5230', taper: 1, skin: true, strap: '#5a3a20' },
  'sandalia-quadrada': { w: 0.23, h: 0.05, l: 0.32, c: '#2b2b2b', sole: '#2b2b2b', taper: 1, skin: true, strap: '#d8b27a' },
};

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
const HAIR_ROWS = { careca: 0, curto: 5, degrade: 5, oldmoney: 5, topete: 5, ondulado: 16, mullet: 16 };

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
  g.add(glass, base, liquid, foam, handle);
  g.userData = { liquid, foam, setLevel(v) { liquid.scale.y = Math.max(0.001, v); liquid.visible = v > 0.01; foam.position.y = -0.058 + 0.115 * v + 0.012; foam.visible = v > 0.04; } };
  g.userData.setLevel(1);
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
  const g = new THREE.Group();
  const cowboy = (base, dark, band, bandH, tall, tex, gold) => {
    const map = tex ? toTex(tex, { repeat: [6, 2] }) : null;
    const m = lam({ color: base, map, side: THREE.DoubleSide });
    const crownPts = [[0.0, tall], [0.09, tall + 0.015], [0.14, tall - 0.02], [0.17, tall * 0.55], [0.19, 0]].map((p) => new THREE.Vector2(p[0], p[1]));
    const crown = new THREE.Mesh(new THREE.LatheGeometry(crownPts, 24), m);
    const brimPts = [[0.17, 0.0], [0.26, -0.012], [0.33, 0.012], [0.375, 0.065]].map((p) => new THREE.Vector2(p[0], p[1]));
    const brim = new THREE.Mesh(new THREE.LatheGeometry(brimPts, 28), m);
    const bandM = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.197, bandH, 24, 1, true), lam({ color: band, side: THREE.DoubleSide }));
    bandM.position.y = bandH / 2 + 0.01;
    const items = [crown, brim, bandM];
    if (gold) {
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), new THREE.MeshStandardMaterial({ color: 0xe8c040, metalness: 0.8, roughness: 0.3 }));
      buckle.position.set(0, bandH / 2 + 0.01, 0.2);
      items.push(buckle);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.372, 0.007, 6, 40), new THREE.MeshStandardMaterial({ color: 0xe8c040, metalness: 0.8, roughness: 0.3 }));
      rim.rotation.x = Math.PI / 2; rim.position.y = 0.065;
      items.push(rim);
    }
    items.forEach((m2) => { m2.castShadow = true; g.add(m2); });
  };
  if (id === 'palha-branco') cowboy('#f4eed8', 0, '#6b4a2b', 0.045, 0.2, straw('#efe6c8', '#c4b588'));
  else if (id === 'palha-amarelo') cowboy('#e8c24a', 0, '#6b4a2b', 0.045, 0.2, straw('#e8c24a', '#b8962a'));
  else if (id === 'cowboy-preto') cowboy('#1b1b20', 0, '#3b3b44', 0.045, 0.2, null);
  else if (id === 'magnata') cowboy('#fbfaf2', 0, '#d9a92a', 0.06, 0.24, null, true);
  else if (id.startsWith('bone-')) {
    const col = new THREE.Color(hat.c);
    const m = lam({ color: col });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.225, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m);
    dome.scale.set(1, 0.85, 1.03); dome.position.y = 0.0;
    const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.014, 20, 1, false, -Math.PI / 2, Math.PI), lam({ color: col.clone().multiplyScalar(0.8) }));
    bill.position.set(0, 0.035, 0.12); bill.rotation.x = 0.12;
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), m); btn.position.y = 0.19;
    [dome, bill, btn].forEach((m2) => { m2.castShadow = true; g.add(m2); });
  }
  return g;
}

function hairMeshes(id, color) {
  const out = [];
  if (id === 'careca') return out;
  const m = lam({ color, map: toTex(noise(color, 0.2), { nearest: true }) });
  const H = HEAD;
  const add = (w, h, d, x, y, z, rx = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; out.push(b);
  };
  switch (id) {
    case 'curto': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0); break;
    case 'degrade': add(H * 1.0, 0.1, H * 1.0, 0, H / 2 + 0.005, 0); break;
    case 'oldmoney': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0); add(H * 0.9, 0.12, 0.05, 0, H / 2 - 0.05, -H / 2 - 0.02); break;
    case 'topete': add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0); add(H * 0.92, 0.1, H * 0.6, 0, H / 2 + 0.07, H * 0.18, -0.28); break;
    case 'ondulado':
      add(H * 1.14, 0.14, H * 1.14, 0, H / 2 - 0.005, 0);
      add(0.05, H * 0.72, H * 1.0, H / 2 + 0.03, -0.02, 0); add(0.05, H * 0.72, H * 1.0, -H / 2 - 0.03, -0.02, 0);
      add(H * 1.1, H * 0.78, 0.06, 0, -0.03, -H / 2 - 0.03);
      break;
    case 'mullet':
      add(H * 1.05, 0.09, H * 1.05, 0, H / 2 - 0.005, 0);
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
  let look = null, red = false, disposables = [];
  const st = { speed: 0, drink: 0, smoke: 0, ko: 0, drunk: 0, phase: 0, t: Math.random() * 10 };
  let nameSprite = null, bubble = null, bubbleUntil = 0, nameText = opts.name || '';

  const track = (o) => { disposables.push(o); return o; };
  function clear() {
    while (model.children.length) model.remove(model.children[0]);
    disposables.forEach((d) => d.dispose && d.dispose());
    disposables = [];
  }

  function mkMat(canvasOrColor) {
    if (typeof canvasOrColor === 'string') return track(lam({ color: canvasOrColor }));
    return track(lam({ map: track(nt(canvasOrColor)) }));
  }

  function build(lk) {
    clear();
    look = opts.npc ? lk : S.sanitizeLook(lk);
    const bare = Object.assign({}, look, { hat: 'nenhum' });
    const down = S.get(bare, { dir: 'down' });
    const up = S.get(bare, { dir: 'up' });
    const skinC = (S.SKINS.find((s) => s.id === look.skin) || S.SKINS[1]).c;
    const hairC = (S.HAIRCOLORS.find((s) => s.id === look.hairColor) || S.HAIRCOLORS[0]).c;
    const hairId = look.hair;

    const faceFront = crop(down, 12, 10, 16, 16);
    const faceBack = crop(up, 12, 10, 16, 16);
    const redLook = S.get(bare, { dir: 'down', red: true });
    const faceFrontRed = crop(redLook, 12, 10, 16, 16);
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
    const headMats = [mkMat(sideC), mkMat(sideC), mkMat(topC), mkMat(skinC), mkMat(faceFront), mkMat(faceBack)];
    const head = new THREE.Mesh(track(new THREE.BoxGeometry(HEAD, HEAD, HEAD)), headMats);
    head.castShadow = true;
    const headG = new THREE.Group();
    headG.position.y = LEG_H + TORSO_H + NECK + HEAD / 2;
    headG.add(head);
    hairMeshes(hairId, hairC).forEach((h) => { headG.add(h); track(h.geometry); track(h.material); });
    const hm = hatMesh(look.hat);
    if (hm) { hm.position.y = HEAD / 2 - 0.01; headG.add(hm); }
    P.faceMat = headMats[4]; P.faceNormal = headMats[4]; P.faceRed = mkMat(faceFrontRed);
    model.add(headG);
    P.head = headG;

    // pescoço
    const neck = new THREE.Mesh(track(new THREE.BoxGeometry(0.16, NECK + 0.02, 0.14)), mkMat(skinC));
    neck.position.y = LEG_H + TORSO_H + NECK / 2;
    model.add(neck);

    // tronco (camisa + cós da calça)
    const torsoMats = [mkMat(shirtC), mkMat(shirtC), mkMat(shirtC), mkMat(shirtC), mkMat(torsoF), mkMat(torsoB)];
    const torso = new THREE.Mesh(track(new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D)), torsoMats);
    torso.position.y = LEG_H + TORSO_H / 2; torso.castShadow = true;
    model.add(torso);
    P.torso = torso;

    // casaco comprido (HOMEM)
    if (look.shirt === 'sobretudo') {
      const coat = new THREE.Mesh(track(new THREE.BoxGeometry(TORSO_W + 0.04, 0.55, TORSO_D + 0.05)), mkMat('#2c2824'));
      coat.position.y = LEG_H - 0.2; coat.castShadow = true;
      model.add(coat);
    }

    // braços
    const mkArm = (x0, sx) => {
      const ac = crop(down, x0, 28, 5, 21);
      const am = mkMat(ac);
      const geo = track(new THREE.BoxGeometry(ARM_W, ARM_L, ARM_W));
      geo.translate(0, -ARM_L / 2, 0);
      const arm = new THREE.Mesh(geo, [am, am, mkMat(shirtC), mkMat(skinC), am, am]);
      arm.castShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(sx * (TORSO_W / 2 + ARM_W / 2 + 0.005), SHOULDER_Y, 0);
      pivot.add(arm);
      model.add(pivot);
      return pivot;
    };
    P.armL = mkArm(30, 1);   // lado +x da tela = braço esquerdo do avatar
    P.armR = mkArm(5, -1);   // braço direito do avatar (segura caneca/baseado)
    // item na mão direita
    P.hand = new THREE.Group();
    P.hand.position.set(0, -ARM_L + 0.02, 0.0);
    P.armR.add(P.hand);
    P.mug = makeMug(); P.mug.position.set(0, 0.0, 0.0); P.mug.visible = false; P.hand.add(P.mug);
    P.joint = makeJoint(); P.joint.position.set(0, 0, 0.03); P.joint.visible = false; P.hand.add(P.joint);

    // pernas
    const mkLeg = (x0, sx) => {
      const lc = crop(down, x0, 51, 8, 13);
      const lb = crop(up, x0, 51, 8, 13);
      const lm = mkMat(lc), bm = mkMat(lb);
      const sideCol = sample(lc, 0, 3);
      const geo = track(new THREE.BoxGeometry(LEG_W, LEG_H, 0.22));
      geo.translate(0, -LEG_H / 2, 0);
      const sm = mkMat(sideCol);
      const leg = new THREE.Mesh(geo, [sm, sm, sm, sm, lm, bm]);
      leg.castShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.14, LEG_H, 0);
      pivot.add(leg);
      // pé
      const f = FOOT[look.shoes] || FOOT.americana;
      const fg = track(new THREE.BoxGeometry(f.w, f.h, f.l));
      if (f.taper < 1) {
        const pos = fg.attributes.position;
        for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > 0) pos.setX(i, pos.getX(i) * f.taper);
        pos.needsUpdate = true;
      }
      const foot = new THREE.Mesh(fg, mkMat(f.skin ? f.sole : f.c));
      foot.position.set(0, -LEG_H + f.h / 2, f.l / 2 - 0.1);
      foot.castShadow = true;
      pivot.add(foot);
      if (f.skin) {
        const sk = new THREE.Mesh(track(new THREE.BoxGeometry(f.w * 0.85, 0.05, f.l * 0.85)), mkMat(skinC));
        sk.position.set(0, -LEG_H + f.h + 0.02, f.l / 2 - 0.1); pivot.add(sk);
        const strap = new THREE.Mesh(track(new THREE.BoxGeometry(f.w * 0.95, 0.025, 0.07)), mkMat(f.strap));
        strap.position.set(0, -LEG_H + f.h + 0.05, 0.05); pivot.add(strap);
      }
      model.add(pivot);
      return pivot;
    };
    P.legL = mkLeg(21, 1);
    P.legR = mkLeg(11, -1);
    applyRed();
  }

  function applyRed() {
    if (!P.head) return;
    const head = P.head.children[0];
    head.material[4] = red ? P.faceRed : P.faceNormal;
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

  function say(text, ms = 6000) {
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
    bubble.scale.set(1.6, 0.5, 1);
    bubble.position.y = 2.5; bubble.renderOrder = 11;
    root.add(bubble);
    bubbleUntil = performance.now() + ms;
  }

  const api = {
    root, P, st,
    get look() { return look; },
    setLook(lk) { build(lk); },
    setRed(v) { if (v !== red) { red = v; applyRed(); } },
    setName(n) { nameText = n; if (!opts.noName) makeNameSprite(); },
    say,
    showName(v) { if (nameSprite) nameSprite.visible = v; },
    update(dt) {
      st.t += dt;
      const sp = st.speed;
      st.phase += dt * (3 + sp * 7);
      const sw = Math.sin(st.phase) * 0.75 * Math.min(1, sp * 1.4);
      const idle = Math.sin(st.t * 1.6) * 0.03;
      const armPose = Math.max(st.drink, st.smoke);
      if (P.legL) {
        P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
        P.armL.rotation.x = -sw * 0.8 + idle;
        const target = st.drink ? -1.95 : st.smoke ? -2.05 : sw * 0.8 + idle;
        P.armR.rotation.x += (target - P.armR.rotation.x) * Math.min(1, dt * 10);
        P.armR.rotation.z = armPose ? 0.15 : 0;
        P.armL.rotation.z = -0.04; if (!armPose) P.armR.rotation.z = 0.04;
        P.head.rotation.x += ((st.drink ? -0.4 : 0.0) + Math.sin(st.t * 0.8) * 0.02 - P.head.rotation.x) * Math.min(1, dt * 8);
        P.head.rotation.z = Math.sin(st.t * 1.3) * 0.1 * st.drunk;
        P.mug.visible = !!st.drink; P.joint.visible = !!st.smoke;
        if (st.drink) P.mug.rotation.set(-P.armR.rotation.x - 0.35, 0, 0);
        if (st.smoke) { P.joint.rotation.set(-P.armR.rotation.x, 0, 0); P.joint.userData.ember.scale.setScalar(1 + Math.sin(st.t * 12) * 0.2); }
        const bob = Math.abs(Math.sin(st.phase)) * 0.04 * Math.min(1, sp * 1.4);
        torsoBob(bob);
      }
      // bêbado: balanço do corpo todo / nocaute: deitado
      const koT = st.ko;
      model.rotation.z = Math.sin(st.t * 1.7) * 0.09 * st.drunk * (1 - koT);
      model.rotation.x += ((koT ? -Math.PI / 2 : Math.sin(st.t * 1.1) * 0.05 * st.drunk) - model.rotation.x) * Math.min(1, dt * 6);
      model.position.y += ((koT ? 0.18 : 0) - model.position.y) * Math.min(1, dt * 6);
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
