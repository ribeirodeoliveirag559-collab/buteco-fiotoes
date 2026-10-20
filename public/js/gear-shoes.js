// Calçados em 3D de verdade (cada um com construção própria): sola, salto, cabedal em loft (cortes superelípticos
// ao longo do pé), cano de bota com bordado/costura, cadarço, tiras e fivelas. Couro com grão, vincos e brilho.
import * as THREE from 'three';
import { leather, rubber, fabric, tex, cv, rng, stitch, shade, mix, sharedMat, memoize } from './gear-tex.js';
import { bake } from './gear-merge.js';

const TAU = Math.PI * 2;
const TC = new WeakMap();
const T = (c, srgb = true) => { if (!TC.has(c)) TC.set(c, tex(c, { repeat: [1, 1], srgb })); return TC.get(c); };
const sg = (v) => (v < 0 ? -1 : 1);
const lerpTable = (tbl, z) => { // interpola uma tabela [[z, valor], ...] com suavização
  if (z <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) if (z <= tbl[i][0]) { const [z0, v0] = tbl[i - 1], [z1, v1] = tbl[i]; const t = (z - z0) / (z1 - z0), e = t * t * (3 - 2 * t); return v0 + (v1 - v0) * e; }
  return tbl[tbl.length - 1][1];
};

// ---- loft: seções ao longo de z, cada uma um corte (superelipse; fundo mais reto que o topo) ----
function loft(secs, { n = 32, uRep = 2, vRep = 1.5, capStart = true, capEnd = true } = {}) {
  const pos = [], uv = [], idx = [], m = secs.length;
  for (let j = 0; j < m; j++) {
    const S = secs[j];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU, c = Math.cos(t), s = Math.sin(t), p = s >= 0 ? (S.pt || 2.3) : (S.pb || 6);
      const x = (S.dx || 0) + S.a * sg(c) * Math.pow(Math.abs(c), 2 / p);
      const y = (S.y0 || 0) + (S.h / 2) * (1 + sg(s) * Math.pow(Math.abs(s), 2 / p));
      pos.push(x, y, S.z); uv.push((i / n) * uRep, (j / (m - 1)) * vRep);
    }
  }
  const w = n + 1;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, b, c, b, d, c); }
  const cap = (j, flip) => {
    const S = secs[j], ci = pos.length / 3;
    pos.push(S.dx || 0, (S.y0 || 0) + S.h / 2, S.z); uv.push(0.5, j ? 1 : 0);
    for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1; if (flip) idx.push(ci, a, b); else idx.push(ci, b, a); }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(m - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // normais da costura (i = 0 e i = n) iguais
  const nn = g.attributes.normal;
  for (let j = 0; j < m; j++) { const a = j * w, b = j * w + n; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = Math.hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
const Z = (a, b, k) => { const o = []; for (let i = 0; i < k; i++) o.push(a + (b - a) * (i / (k - 1))); return o; };
// monta as seções a partir de tabelas de largura e altura
function sections({ z0, z1, k = 14, wid, hei, y0 = () => 0, pt = 2.3, pb = 6, dx = () => 0 }) {
  return Z(z0, z1, k).map((z) => ({ z, a: Math.max(0.004, lerpTable(wid, z)), h: Math.max(0.006, lerpTable(hei, z)), y0: y0(z), pt: typeof pt === 'function' ? pt(z) : pt, pb, dx: dx(z) }));
}

// ---- materiais ----
function leatherMat(color, o = {}, rough = 0.55, env = 0.5) {
  return sharedMat('S-leather|' + color + JSON.stringify(o) + rough + env, () => {
    const t = leather(color, o);
    return new THREE.MeshStandardMaterial({ map: T(t.map), bumpMap: T(t.bump, false), bumpScale: o.bump ?? 1.0, roughness: rough, metalness: 0, envMapIntensity: env, side: THREE.DoubleSide });
  });
}
function rubberMat(color, tread) {
  return sharedMat('S-rubber|' + color + tread, () => {
    const t = rubber(color, { tread });
    return new THREE.MeshStandardMaterial({ map: T(t.map), bumpMap: T(t.bump, false), bumpScale: 1.0, roughness: 0.85, envMapIntensity: 0.3 });
  });
}
const plain = (c, r = 0.6, m = 0) => sharedMat('S-plain|' + c + '|' + r + '|' + m, () => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: m > 0.5 ? 1 : 0.4 }));
const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; return o; };

// ---- cano de bota: tubo elíptico com borda recortada (V na frente e atrás) ----
function shaftGeo({ y0, h, a0, a1, b0, b1, dip = 0.035, n = 40, m = 8, uRep = 3, vRep = 2 }) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= m; j++) for (let i = 0; i <= n; i++) {
    const th = (i / n) * TAU, k = j / m, a = a0 + (a1 - a0) * k, b = b0 + (b1 - b0) * k;
    const front = Math.exp(-Math.pow(((th + Math.PI) % TAU - Math.PI) / 0.75, 2)), back = Math.exp(-Math.pow((((th + Math.PI * 2) % TAU) - Math.PI) / 0.75, 2));
    const top = (front + back * 0.8) * dip * k * k;
    pos.push(a * Math.sin(th), y0 + h * k - top, b * Math.cos(th)); uv.push((i / n) * uRep, k * vRep);
  }
  const w = n + 1;
  // i cresce de +z (frente) para +x; j sobe: (b-a) = +x, (c-a) = +y -> normal = x × y = +z (para fora na frente) = ordem (a,b,c)
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

// textura do cano com bordado / costuras (unica por bota)
function shaftTexture(kind, base, accent) { return memoize('shaftTex|' + kind + base + accent, () => shaftTextureDraw(kind, base, accent)); }
function shaftTextureDraw(kind, base, accent) {
  const W = 512, H = 256, c = cv(W, H), g = c.getContext('2d');
  const L = leather(base, { grain: 5, crease: 0.12, mottle: 22 });
  g.drawImage(L.map, 0, 0, W, H);
  if (kind === 'stitch') { // bota americana: faixas de couro costuradas em arcos
    for (let k = 0; k < 4; k++) {
      const y = 40 + k * 52;
      stitch(g, Array.from({ length: 40 }, (_, i) => [i * (W / 39), y + Math.sin(i * 0.5) * 2.2]), accent, 6, 4, 2);
      stitch(g, Array.from({ length: 40 }, (_, i) => [i * (W / 39), y + 7 + Math.sin(i * 0.5) * 2.2]), accent, 6, 4, 2);
    }
    g.fillStyle = shade(base, -30); g.fillRect(0, H - 30, W, 30); stitch(g, [[0, H - 34], [W, H - 34]], accent, 6, 4, 2);
  } else if (kind === 'embroidery') { // bico fino: bordado dourado em chamas/folhas
    for (let k = 0; k < 6; k++) {
      const x0 = (k + 0.5) * (W / 6);
      g.strokeStyle = accent; g.lineWidth = 2.6; g.lineCap = 'round';
      for (let s = 0; s < 3; s++) {
        g.beginPath(); g.moveTo(x0, H - 20);
        g.bezierCurveTo(x0 - 28 + s * 8, H * 0.65, x0 + 26 - s * 10, H * 0.5 - s * 18, x0 - 6 + s * 6, 26 + s * 20); g.stroke();
      }
      g.fillStyle = accent; g.beginPath(); g.arc(x0, H * 0.45, 5, 0, 6.28); g.fill();
      for (let l = -1; l <= 1; l += 2) { g.beginPath(); g.ellipse(x0 + l * 18, H * 0.62, 9, 4, l * 0.6, 0, 6.28); g.stroke(); }
    }
    stitch(g, [[0, 12], [W, 12]], accent, 7, 4, 2); stitch(g, [[0, H - 10], [W, H - 10]], accent, 7, 4, 2);
  }
  return c;
}

// =====================================================================================
//  Calçados
// =====================================================================================
const SKIN_FOOT = (skin) => sharedMat('S-skin|' + skin, () => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7, envMapIntensity: 0.3 }));

function footSkin(skin, { z0 = -0.09, z1 = 0.2, w = 0.085 } = {}) {
  const g = new THREE.Group();
  const geo = loft(sections({ z0, z1, k: 12, wid: [[z0, w * 0.7], [z0 + 0.05, w * 0.95], [0.08, w], [z1 - 0.02, w * 0.93], [z1, w * 0.7]], hei: [[z0, 0.06], [0.0, 0.07], [0.1, 0.042], [z1, 0.026]], y0: () => 0.012, pt: 2.4 }), { n: 24 });
  g.add(mesh(geo, SKIN_FOOT(skin)));
  const toeMat = SKIN_FOOT(skin);
  for (let i = 0; i < 5; i++) { // dedinhos
    const t = i / 4, sz = 0.03 - t * 0.012;
    const toe = mesh(new THREE.SphereGeometry(sz, 12, 8), toeMat); toe.scale.set(0.9, 0.55, 1.15);
    toe.position.set((0.5 - t) * 0.12, 0.034, z1 - 0.005 - Math.sin(t * Math.PI) * 0.012 + t * 0.012); g.add(toe);
  }
  return g;
}
function strapTube(pts, r, mat, flat = 0.5) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, 24, r, 8, false);
  // achata a tira em torno do próprio centro (escalar o mesh puxaria a tira pra dentro do pé)
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length; geo.translate(0, -cy, 0); geo.scale(1, flat, 1); geo.translate(0, cy, 0);
  return mesh(geo, mat);
}

const BUILD = {
  // ---- BOTA AMERICANA: bico quadrado, cano alto costurado, salto de couro empilhado ----
  americana(skin) {
    const g = new THREE.Group();
    const col = '#8b5a2b', dark = '#3b2414';
    const upperM = leatherMat(col, { grain: 5, crease: 0.22, mottle: 30 }, 0.5);
    const wid = [[-0.105, 0.068], [-0.09, 0.085], [0, 0.097], [0.12, 0.098], [0.21, 0.094], [0.255, 0.086]];
    const hei = [[-0.105, 0.15], [0.0, 0.17], [0.07, 0.105], [0.14, 0.078], [0.255, 0.06]];
    g.add(mesh(loft(sections({ z0: -0.105, z1: 0.255, k: 16, wid, hei, y0: () => 0.014, pt: 2.2, pb: 9 }), { n: 32, uRep: 3, vRep: 2.5 }), upperM));
    // bico: reforço (toe cap) mais escuro e costurado
    const cap = mesh(loft(sections({ z0: 0.15, z1: 0.262, k: 7, wid: [[0.15, 0.1], [0.262, 0.088]], hei: [[0.15, 0.081], [0.262, 0.064]], y0: () => 0.014, pt: 2.2, pb: 9 }), { n: 32, uRep: 3, vRep: 1 }), leatherMat('#6a4220', { grain: 5, crease: 0.2 }, 0.45));
    g.add(cap);
    // sola de couro + salto empilhado
    g.add(mesh(loft(sections({ z0: -0.11, z1: 0.265, k: 14, wid: [[-0.11, 0.07], [-0.09, 0.088], [0, 0.099], [0.12, 0.1], [0.21, 0.096], [0.265, 0.089]], hei: [[-0.11, 0.02], [0.265, 0.02]], pt: 6, pb: 8 }), { n: 28, uRep: 2, vRep: 1 }), rubberMat('#2a1a10')));
    const heel = mesh(new THREE.BoxGeometry(0.082, 0.04, 0.07), leatherMat('#2f1c10', { grain: 5, crease: 0.1 }, 0.6)); heel.position.set(0, 0.024 - 0.02, -0.07); heel.scale.set(1, 1, 1); g.add(heel);
    const lift = mesh(new THREE.BoxGeometry(0.084, 0.01, 0.072), rubberMat('#14100c')); lift.position.set(0, 0.005, -0.07); g.add(lift);
    // cano
    const st = shaftTexture('stitch', col, 'rgba(240,205,120,.9)');
    const shaftM = sharedMat('S-shaft-am', () => new THREE.MeshStandardMaterial({ map: T(st), roughness: 0.5, envMapIntensity: 0.5, side: THREE.DoubleSide }));
    const shaft = mesh(shaftGeo({ y0: 0.12, h: 0.2, a0: 0.093, a1: 0.108, b0: 0.098, b1: 0.112, dip: 0.04 }), shaftM); shaft.position.z = -0.012; g.add(shaft);
    // alças de puxar nas laterais
    for (const sx of [-1, 1]) g.add(strapTube([[sx * 0.108, 0.3, -0.012], [sx * 0.125, 0.29, -0.012], [sx * 0.127, 0.255, -0.012], [sx * 0.11, 0.245, -0.012]], 0.0065, leatherMat('#5a3a1c', { grain: 5 }, 0.5), 1));
    return g;
  },

  // ---- BOTA BICO FINO: couro marrom escuro brilhoso, bico comprido levantado, bordado dourado ----
  'bico-fino'(skin) {
    const g = new THREE.Group();
    const col = '#3a2216';
    const upperM = leatherMat(col, { grain: 5, crease: 0.25, mottle: 20, bump: 0.8 }, 0.28, 0.9);
    const wid = [[-0.105, 0.066], [-0.09, 0.082], [0, 0.094], [0.1, 0.092], [0.18, 0.074], [0.26, 0.044], [0.32, 0.018], [0.345, 0.006]];
    const hei = [[-0.105, 0.155], [0.0, 0.17], [0.07, 0.1], [0.16, 0.062], [0.27, 0.04], [0.345, 0.03]];
    g.add(mesh(loft(sections({ z0: -0.105, z1: 0.345, k: 20, wid, hei, y0: (z) => 0.012 + Math.max(0, z - 0.2) * 0.12, pt: 2.1, pb: 9 }), { n: 32, uRep: 3, vRep: 3 }), upperM));
    g.add(mesh(loft(sections({ z0: -0.11, z1: 0.352, k: 18, wid: wid.map(([z, a]) => [z, a + 0.002]), hei: [[-0.11, 0.02], [0.352, 0.02]], y0: (z) => Math.max(0, z - 0.2) * 0.12, pt: 6, pb: 8 }), { n: 28, uRep: 2, vRep: 1 }), rubberMat('#150d08')));
    // ponteira de metal no bico
    const tip = mesh(new THREE.ConeGeometry(0.012, 0.03, 10), plain(0xc9b072, 0.3, 0.9)); tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.053, 0.352); g.add(tip);
    const heel = mesh(new THREE.BoxGeometry(0.07, 0.05, 0.056), leatherMat('#241209', { grain: 5, crease: 0.1 }, 0.4)); heel.position.set(0, -0.003, -0.075); heel.rotation.x = -0.06; g.add(heel);
    const st = shaftTexture('embroidery', col, 'rgba(231,190,100,.95)');
    const shaft = mesh(shaftGeo({ y0: 0.12, h: 0.21, a0: 0.09, a1: 0.1, b0: 0.095, b1: 0.104, dip: 0.05 }), sharedMat('S-shaft-bf', () => new THREE.MeshStandardMaterial({ map: T(st), roughness: 0.3, envMapIntensity: 0.9, side: THREE.DoubleSide }))); shaft.position.z = -0.012; g.add(shaft);
    for (const sx of [-1, 1]) g.add(strapTube([[sx * 0.1, 0.325, -0.012], [sx * 0.116, 0.315, -0.012], [sx * 0.117, 0.282, -0.012], [sx * 0.102, 0.275, -0.012]], 0.006, leatherMat('#241209', { grain: 5 }, 0.4), 1));
    return g;
  },

  // ---- BOTINA AMARELA: camurça mostarda, cadarço branco, gáspea acolchoada, sola trator ----
  'botina-amarela'(skin) {
    const g = new THREE.Group();
    const col = '#e6b422';
    const upperM = leatherMat(col, { suede: true, mottle: 24 }, 0.95, 0.25);
    const wid = [[-0.11, 0.075], [-0.095, 0.1], [0, 0.108], [0.12, 0.109], [0.21, 0.103], [0.262, 0.088]];
    const hei = [[-0.11, 0.19], [-0.02, 0.215], [0.05, 0.13], [0.14, 0.095], [0.262, 0.07]];
    g.add(mesh(loft(sections({ z0: -0.11, z1: 0.262, k: 16, wid, hei, y0: () => 0.045, pt: 2.1 }), { n: 32, uRep: 3, vRep: 2 }), upperM));
    // solado trator creme, grosso, com frisos
    g.add(mesh(loft(sections({ z0: -0.116, z1: 0.27, k: 14, wid: [[-0.116, 0.078], [-0.1, 0.104], [0, 0.113], [0.12, 0.114], [0.21, 0.108], [0.27, 0.094]], hei: [[-0.116, 0.045], [0.27, 0.045]], pt: 3.2, pb: 6 }), { n: 28, uRep: 3, vRep: 1 }), rubberMat('#efe3c3', true)));
    const mid = mesh(loft(sections({ z0: -0.1, z1: 0.25, k: 12, wid: [[-0.1, 0.1], [0, 0.11], [0.25, 0.092]], hei: [[-0.1, 0.012], [0.25, 0.012]], y0: () => 0.036, pt: 3 }), { n: 28 }), plain('#7a5a08', 0.8)); g.add(mid);
    // bico de borracha
    g.add(mesh(loft(sections({ z0: 0.17, z1: 0.268, k: 6, wid: [[0.17, 0.108], [0.268, 0.09]], hei: [[0.17, 0.05], [0.268, 0.04]], y0: () => 0.045, pt: 2.2 }), { n: 28 }), rubberMat('#d9c690')));
    // gáspea: língua + cadarço
    const tongue = mesh(new THREE.BoxGeometry(0.07, 0.01, 0.17), leatherMat('#c99a18', { suede: true }, 0.95)); tongue.position.set(0, 0.135, 0.075); tongue.rotation.x = -0.38; g.add(tongue);
    const lace = plain(0xf6f1e4, 0.9), eye = plain(0x8a8a8a, 0.3, 0.9);
    for (let i = 0; i < 5; i++) {
      const z = 0.0 + i * 0.034, y = 0.158 - i * 0.017;
      for (const sx of [-1, 1]) { const e = mesh(new THREE.TorusGeometry(0.0075, 0.0025, 6, 12), eye); e.position.set(sx * 0.04, y - 0.002, z - 0.008); e.rotation.x = -0.6; g.add(e); }
      g.add(strapTube([[-0.041, y, z - 0.01], [0, y + 0.012, z + 0.003], [0.041, y, z - 0.01]], 0.0048, lace, 1));
      g.add(strapTube([[-0.041, y, z + 0.006], [0, y + 0.012, z - 0.012], [0.041, y, z + 0.006]], 0.0048, lace, 1));
    }
    const bow = mesh(new THREE.TorusKnotGeometry(0.012, 0.0035, 30, 6, 2, 3), lace); bow.position.set(0, 0.21, -0.03); bow.rotation.x = 0.5; g.add(bow);
    // colarinho acolchoado escuro
    const collar = mesh(new THREE.TorusGeometry(0.095, 0.017, 10, 28), leatherMat('#8a6410', { suede: true }, 0.95)); collar.scale.set(1.0, 1.1, 1); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.255, -0.01); g.add(collar);
    // etiqueta de marca atrás
    const tab = mesh(new THREE.BoxGeometry(0.03, 0.04, 0.006), leatherMat('#3a2616', { grain: 5 }, 0.5)); tab.position.set(0, 0.22, -0.125); g.add(tab);
    return g;
  },

  // ---- CHINELO DE COURO: palmilha de couro, tira em V, pino entre os dedos ----
  'chinelo-couro'(skin) {
    const g = new THREE.Group();
    g.add(footSkin(skin, { z0: -0.085, z1: 0.205, w: 0.082 }));
    const wid = [[-0.105, 0.05], [-0.09, 0.07], [0, 0.078], [0.1, 0.088], [0.2, 0.082], [0.245, 0.06]];
    const bed = mesh(loft(sections({ z0: -0.105, z1: 0.245, k: 14, wid, hei: [[-0.105, 0.016], [0.245, 0.016]], y0: () => 0.012, pt: 3.5, pb: 4 }), { n: 28, uRep: 2, vRep: 1 }), leatherMat('#a8774a', { grain: 5, crease: 0.4, mottle: 20 }, 0.55));
    g.add(bed);
    g.add(mesh(loft(sections({ z0: -0.107, z1: 0.247, k: 14, wid: wid.map(([z, a]) => [z, a + 0.004]), hei: [[-0.107, 0.012], [0.247, 0.012]], pt: 4 }), { n: 28, uRep: 2, vRep: 1 }), rubberMat('#6b4a2a')));
    const strapM = leatherMat('#5a3a20', { grain: 5, crease: 0.4 }, 0.5);
    g.add(strapTube([[-0.086, 0.032, 0.05], [-0.07, 0.07, 0.085], [-0.03, 0.078, 0.14], [0.0, 0.05, 0.19]], 0.011, strapM, 0.55));
    g.add(strapTube([[0.086, 0.032, 0.05], [0.07, 0.07, 0.085], [0.03, 0.078, 0.14], [0.0, 0.05, 0.19]], 0.011, strapM, 0.55));
    const post = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.04, 10), strapM); post.position.set(0, 0.034, 0.192); g.add(post);
    const stud = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 12), plain(0xd8b24a, 0.3, 0.9)); stud.position.set(0, 0.054, 0.192); g.add(stud);
    return g;
  },

  // ---- SANDÁLIA QUADRADA: plataforma preta, tira de tornozelo com fivela, tira cruzada ----
  'sandalia-quadrada'(skin) {
    const g = new THREE.Group();
    g.add(footSkin(skin, { z0: -0.08, z1: 0.2, w: 0.08 }));
    const wid = [[-0.105, 0.062], [-0.09, 0.082], [0, 0.088], [0.1, 0.092], [0.2, 0.09], [0.245, 0.084]];
    const plat = mesh(loft(sections({ z0: -0.105, z1: 0.248, k: 12, wid, hei: [[-0.105, 0.05], [0.248, 0.05]], pt: 5, pb: 7 }), { n: 28, uRep: 2, vRep: 1 }), rubberMat('#222226'));
    g.add(plat);
    const bed = mesh(loft(sections({ z0: -0.1, z1: 0.24, k: 12, wid: wid.map(([z, a]) => [z, a - 0.004]), hei: [[-0.1, 0.01], [0.24, 0.01]], y0: () => 0.05, pt: 5 }), { n: 28 }), leatherMat('#d8b27a', { grain: 5, crease: 0.3, mottle: 18 }, 0.5));
    g.add(bed);
    // solado com listra clara
    const stripe = mesh(loft(sections({ z0: -0.106, z1: 0.249, k: 12, wid: wid.map(([z, a]) => [z, a + 0.002]), hei: [[-0.106, 0.008], [0.249, 0.008]], y0: () => 0.02, pt: 5 }), { n: 28 }), plain('#d8b27a', 0.6)); g.add(stripe);
    const tan = leatherMat('#d8b27a', { grain: 5, crease: 0.3 }, 0.5);
    // tira cruzada sobre o peito do pé
    g.add(strapTube([[-0.084, 0.06, 0.07], [-0.07, 0.115, 0.08], [0.0, 0.135, 0.085], [0.07, 0.115, 0.08], [0.084, 0.06, 0.07]], 0.0105, tan, 0.55));
    // tira do tornozelo
    const ank = mesh(new THREE.TorusGeometry(0.085, 0.0105, 8, 28), tan); ank.scale.set(1, 1.1, 1); ank.rotation.x = Math.PI / 2; ank.position.set(0, 0.13, -0.045); ank.scale.y = 0.55; g.add(ank);
    for (const sx of [-1, 1]) g.add(strapTube([[sx * 0.072, 0.13, -0.035], [sx * 0.084, 0.095, 0.0], [sx * 0.084, 0.065, 0.05]], 0.0095, tan, 0.55));
    const buckle = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), plain(0xe8c94a, 0.3, 0.9)); buckle.position.set(0.075, 0.135, -0.02); buckle.rotation.y = 1.2; g.add(buckle);
    return g;
  },
};

export function makeShoe(id, skinHex) {
  const f = BUILD[id] || BUILD.americana;
  const g = f(skinHex || '#e5b184');
  g.userData.shoe = true;
  return bake(g);
}
