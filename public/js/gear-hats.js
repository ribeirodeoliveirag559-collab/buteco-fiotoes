// Chapéus e bonés em 3D de verdade: copa com vinco e "pinça" na frente, aba curvada (laterais viradas pra cima,
// frente e atrás caídas), fita com fivela/conchas, costura nas bordas. Nada de caixas: tudo é superfície paramétrica.
import * as THREE from 'three';
import { felt, strawWeave, fabric, leather, tex, cv, rng, hash, stitch, shade, sharedMat, memoize } from './gear-tex.js';
import { bake } from './gear-merge.js';

const TAU = Math.PI * 2;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sqDir = (th, p = 3.6) => { const s = Math.sin(th), c = Math.cos(th); return [Math.sign(s) * Math.pow(Math.abs(s), 2 / p), Math.sign(c) * Math.pow(Math.abs(c), 2 / p)]; };
const wrap = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };

// textura compartilhada por canvas (não é descartada com o avatar)
const TC = new WeakMap();
const T = (c, srgb = true) => { if (!TC.has(c)) TC.set(c, tex(c, { repeat: [1, 1], srgb })); return TC.get(c); };

// malha a partir de uma função (i = coluna 0..nu, j = linha 0..nv) -> [x,y,z,u,v]; fecha a costura se closeU
function surface(nu, nv, fn, closeU = true, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i, j); pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if (closeU) { // normais iguais nas duas pontas da costura (sem "vinco" artificial)
    const n = g.attributes.normal;
    for (let j = 0; j <= nv; j++) { const a = j * w, b = j * w + nu; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1; n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  }
  return g;
}

// ---------- copa ----------
// o: { rx, rz, h, taper, pinch, crease, dome, rise } ; th=0 é a frente (+z)
function crownPoint(o, th, w, grow = 0) {
  const [sx, cz] = sqDir(th, o.sq || 3.6);
  const wallK = Math.min(w, 1), capK = Math.max(0, w - 1);
  let f, y;
  const g = Math.exp(-Math.pow(wrap(th) / (o.pinchW || 0.6), 2));            // 1 na frente, 0 nas costas
  const pinchF = 1 - o.pinch * g * sstep(0.3, 1.0, wallK);
  if (w <= 1) { f = 1 - o.taper * Math.pow(wallK, 1.25); y = o.h * wallK; f *= pinchF; }
  else { const f1 = (1 - o.taper) * pinchF; f = f1 * (1 - capK) ** 0.85; y = o.h + o.dome * (1 - (1 - capK) ** 2); }
  let x = o.rx * f * sx, z = o.rz * f * cz;
  if (w > 1) { const d = o.crease * Math.exp(-Math.pow(x / (o.creaseW || 0.055), 2)) * sstep(0.02, 0.5, capK); y -= d; }  // vinco no meio do topo
  // abas laterais da copa levemente mais altas atrás (copa "inclinada")
  y += (o.rise || 0) * (1 - cz) * 0.5 * wallK;
  const k = 1 + grow;
  return [x * k, y + grow * 0.6, z * k];
}
function crownGeo(o, uRep = 4, vRep = 2) {
  const NU = 64, NW = 14, NC = 12;
  return surface(NU, NW + NC, (i, j) => {
    const th = (i / NU) * TAU, w = j <= NW ? j / NW : 1 + (j - NW) / NC;
    const p = crownPoint(o, th, w);
    return [p[0], p[1], p[2], (i / NU) * uRep, (w / 2) * vRep];
  }, true, true);
}
// faixa que acompanha a parede da copa
function bandGeo(o, w0, w1, grow = 0.012) {
  const NU = 64, NV = 4;
  return surface(NU, NV, (i, j) => {
    const th = (i / NU) * TAU, w = w0 + (w1 - w0) * (j / NV);
    const p = crownPoint(o, th, w, grow);
    return [p[0], p[1], p[2], (i / NU) * 6, j / NV];
  }, true, true);
}

// ---------- aba ----------
// b: { wF, wS, wB (largura frente/lado/trás), up (levantada nas laterais), down (caída na frente/trás), curl, y0 }
function brimPoint(o, b, th, s) {
  const sx = Math.sin(th), cz = Math.cos(th);
  // contorno interno = base da copa; externo = base + largura por direção
  const [qx, qz] = sqDir(th, o.sq || 3.6);
  const wid = (b.wF * Math.max(0, cz) ** 1.6) + (b.wB * Math.max(0, -cz) ** 1.6) + b.wS * sx * sx;
  const nx = sx, nz = cz;                                            // direção radial aproximada
  const bx = o.rx * qx, bz = o.rz * qz;
  const x = bx + nx * wid * s, z = bz + nz * wid * s;
  const lift = b.up * sx * sx - b.down * (cz > 0 ? 1 : 0.75) * cz * cz;
  const y = (b.y0 || 0) + Math.pow(s, 1.7) * lift + (b.curl || 0) * Math.pow(s, 3) * sx * sx + 0.004 * Math.sin(th * 3) * s;
  return [x, y, z];
}
function brimGeo(o, b, uRep = 8, vRep = 3) {
  const NU = 96, NV = 14;
  return surface(NU, NV, (i, j) => {
    const th = (i / NU) * TAU, s = j / NV;
    const p = brimPoint(o, b, th, s);
    return [p[0], p[1], p[2], (i / NU) * uRep, s * vRep];
  });
}
function rimTube(o, b, r, color, rough = 0.8) {
  const pts = [];
  for (let i = 0; i < 96; i++) { const p = brimPoint(o, b, (i / 96) * TAU, 1); pts.push(new THREE.Vector3(p[0], p[1], p[2])); }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 192, r, 6, true), sharedMat('H-rim|' + color + rough, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: rough < 0.5 ? 0.8 : 0 })));
  return m;
}

// ---------- materiais ----------
function feltMat(color, repeatU, o = {}) {
  return sharedMat('H-felt|' + color, () => { const t = felt(color); return new THREE.MeshStandardMaterial({ map: T(t.map), bumpMap: T(t.bump, false), bumpScale: 0.7, roughness: 0.92, side: THREE.DoubleSide, color: 0xffffff, envMapIntensity: 0.35, ...o }); });
}
function strawMat(base, dark) {
  return sharedMat('H-straw|' + base + dark, () => { const t = strawWeave(base, dark); return new THREE.MeshStandardMaterial({ map: T(t.map), bumpMap: T(t.bump, false), bumpScale: 1.2, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.4 }); });
}
function leatherMat(color, o) {
  return sharedMat('H-leather|' + color + JSON.stringify(o || {}), () => { const t = leather(color, o || { grain: 5, crease: 0.1, mottle: 10 }); return new THREE.MeshStandardMaterial({ map: T(t.map), bumpMap: T(t.bump, false), bumpScale: 0.8, roughness: 0.55, side: THREE.DoubleSide, envMapIntensity: 0.5 }); });
}
const metal = (c) => sharedMat('H-metal|' + c, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: 0.28 }));

function concho(r, mat, th, o, w) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), mat);
  m.scale.z = 0.35;
  const p = crownPoint(o, th, w, 0.014);
  m.position.set(p[0], p[1], p[2]); m.rotation.y = th;
  return m;
}

// ---------- chapéus de aba ----------
const HATS = {
  // cowboy preto: feltro, copa alta com vinco fundo e pinça, aba bem enrolada nas laterais, fita de couro com conchas de prata
  'cowboy-preto': {
    crown: { rx: 0.222, rz: 0.236, h: 0.215, taper: 0.17, pinch: 0.27, crease: 0.075, dome: 0.02, pinchW: 0.6, creaseW: 0.06 },
    brim: { wF: 0.16, wS: 0.19, wB: 0.15, up: 0.15, down: 0.035, curl: 0.09, y0: 0.0 },
    felt: '#16161b', band: { color: '#2b2b31', w0: 0.04, w1: 0.2, kind: 'leather' }, conchos: { n: 7, color: 0xcfd3da }, rim: '#0d0d10',
  },
  // magnata: feltro branco, "Texas tall": copa mais alta, aba larga com debrum dourado, fita dourada com conchão
  magnata: {
    crown: { rx: 0.222, rz: 0.238, h: 0.27, taper: 0.18, pinch: 0.28, crease: 0.08, dome: 0.02, pinchW: 0.6, creaseW: 0.06 },
    brim: { wF: 0.18, wS: 0.21, wB: 0.16, up: 0.17, down: 0.035, curl: 0.1, y0: 0.0 },
    felt: '#f7f5ec', band: { color: '#d9a92a', w0: 0.04, w1: 0.21, kind: 'gold' }, conchos: { n: 5, color: 0xf6d26b }, rim: '#d9a92a', rimMetal: true,
  },
  // palha branca: copa de "cattleman" achatada, aba reta que cai um pouco, fita de couro marrom
  'palha-branco': {
    crown: { rx: 0.224, rz: 0.238, h: 0.185, taper: 0.12, pinch: 0.22, crease: 0.055, dome: 0.015, pinchW: 0.65, creaseW: 0.06 },
    brim: { wF: 0.15, wS: 0.17, wB: 0.15, up: 0.09, down: 0.04, curl: 0.05, y0: 0.0 },
    straw: ['#efe6c8', '#b8a878'], band: { color: '#6b4a2b', w0: 0.04, w1: 0.19, kind: 'leather' }, rim: '#cdbf98',
  },
  // palha amarela: "palhão" de roça: copa redonda e mole, aba larguíssima ondulada
  'palha-amarelo': {
    crown: { rx: 0.22, rz: 0.236, h: 0.19, taper: 0.2, pinch: 0.08, crease: 0.02, dome: 0.045, pinchW: 0.9, creaseW: 0.07 },
    brim: { wF: 0.2, wS: 0.21, wB: 0.2, up: 0.05, down: 0.07, curl: 0.0, y0: 0.0 },
    straw: ['#e8c24a', '#9c7c1c'], band: { color: '#a8321e', w0: 0.04, w1: 0.17, kind: 'cloth' }, rim: '#caa338',
  },
};

function bandMat(spec) { return sharedMat('H-band|' + JSON.stringify(spec), () => bandMatMake(spec)); }
function bandMatMake(spec) {
  if (spec.kind === 'gold') {
    const c = cv(256, 64), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#f3d878'); gr.addColorStop(0.5, '#c9962a'); gr.addColorStop(1, '#8a6212'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
    const r = rng(11); for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(255,240,170,.5)'; g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 8, 10); g.lineTo(x + 16, 32); g.lineTo(x + 8, 54); g.fill(); }
    stitch(g, [[0, 5], [256, 5]], 'rgba(60,40,0,.6)', 5, 4, 1.4); stitch(g, [[0, 59], [256, 59]], 'rgba(60,40,0,.6)', 5, 4, 1.4);
    return new THREE.MeshStandardMaterial({ map: T(c), roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  }
  if (spec.kind === 'cloth') { // lenço xadrez
    const c = cv(256, 64), g = c.getContext('2d'); g.fillStyle = spec.color; g.fillRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 6, 64); for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 256, 6);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < 256; x += 16) for (let y = 0; y < 64; y += 16) g.fillRect(x, y, 6, 6);
    return new THREE.MeshStandardMaterial({ map: T(c), roughness: 0.9, side: THREE.DoubleSide });
  }
  const t = leather(spec.color, { grain: 5, crease: 0.1, mottle: 8, size: 128 });
  const c = cv(256, 64), g = c.getContext('2d'); g.drawImage(t.map, 0, 0, 256, 64);
  stitch(g, [[0, 7], [256, 7]], 'rgba(235,205,140,.85)', 6, 4, 1.5); stitch(g, [[0, 57], [256, 57]], 'rgba(235,205,140,.85)', 6, 4, 1.5);
  return new THREE.MeshStandardMaterial({ map: T(c), roughness: 0.5, side: THREE.DoubleSide });
}

function brimHat(id) {
  const H = HATS[id];
  const g = new THREE.Group();
  const o = H.crown, b = H.brim;
  const crownMat = H.felt ? feltMat(H.felt) : strawMat(H.straw[0], H.straw[1]);
  const crown = new THREE.Mesh(crownGeo(o, H.felt ? 3 : 5, H.felt ? 2 : 3), crownMat);
  const brim = new THREE.Mesh(brimGeo(o, b, H.felt ? 6 : 12, H.felt ? 2 : 4), crownMat);
  const band = new THREE.Mesh(bandGeo(o, H.band.w0, H.band.w1), bandMat(H.band));
  const rim = rimTube(o, b, 0.0055, H.rim, H.rimMetal ? 0.3 : 0.85);
  const items = [crown, brim, band, rim];
  if (H.conchos) {
    const mat = metal(H.conchos.color);
    const w = (H.band.w0 + H.band.w1) / 2;
    for (let i = 0; i < H.conchos.n; i++) {
      const th = ((i + 0.5) / H.conchos.n) * TAU - Math.PI / H.conchos.n + Math.PI; // maior na frente
      const big = Math.abs(wrap(th)) < 0.12;
      items.push(concho(big ? 0.024 : 0.013, mat, th, o, w));
    }
  } else if (H.band.kind === 'leather') { // fivela quadrada na frente
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.034, 0.008), metal(0xd8b24a));
    const w = (H.band.w0 + H.band.w1) / 2, p = crownPoint(o, 0, w, 0.016);
    bk.position.set(p[0], p[1], p[2]); items.push(bk);
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.01), sharedMat('H-hole', () => new THREE.MeshStandardMaterial({ color: 0x2b1c10, roughness: 0.6 })));
    hole.position.set(p[0], p[1], p[2] + 0.001); items.push(hole);
  }
  items.forEach((m) => { m.castShadow = true; g.add(m); });
  g.userData.coversHair = true; g.userData.brimR = 0.28;
  return bake(g);
}

// ---------- bonés ----------
const EMBLEMS = {
  vermelho: (g, w, h, c) => { // estrela
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 11 : 26; g.lineTo(w / 2 + Math.cos(a) * r, c + Math.sin(a) * r); } g.closePath(); g.fill();
  },
  azul: (g, w, h, c) => { g.fillStyle = '#fff'; g.font = '900 44px Impact, sans-serif'; g.textAlign = 'center'; g.fillText('FT', w / 2, c + 16); g.fillStyle = '#ffd23a'; g.fillRect(w / 2 - 28, c + 24, 56, 4); },
  preto: (g, w, h, c) => { g.strokeStyle = '#d9a92a'; g.lineWidth = 6; g.strokeRect(w / 2 - 30, c - 20, 60, 40); g.fillStyle = '#d9a92a'; g.fillRect(w / 2 - 14, c - 4, 28, 8); },
  verde: (g, w, h, c) => { g.fillStyle = '#e9ffd6'; g.beginPath(); g.moveTo(w / 2, c - 28); g.quadraticCurveTo(w / 2 + 30, c - 6, w / 2, c + 26); g.quadraticCurveTo(w / 2 - 30, c - 6, w / 2, c - 28); g.fill(); g.strokeStyle = '#2e9b57'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, c - 20); g.lineTo(w / 2, c + 22); g.stroke(); },
  branco: (g, w, h, c) => { g.fillStyle = '#c9142a'; g.beginPath(); g.moveTo(w / 2 - 28, c + 16); g.lineTo(w / 2 - 28, c - 12); g.lineTo(w / 2 - 14, c + 2); g.lineTo(w / 2, c - 20); g.lineTo(w / 2 + 14, c + 2); g.lineTo(w / 2 + 28, c - 12); g.lineTo(w / 2 + 28, c + 16); g.closePath(); g.fill(); },
  amarelo: (g, w, h, c) => { g.fillStyle = '#26262b'; g.beginPath(); g.moveTo(w / 2 + 6, c - 28); g.lineTo(w / 2 - 16, c + 4); g.lineTo(w / 2 - 2, c + 4); g.lineTo(w / 2 - 8, c + 28); g.lineTo(w / 2 + 18, c - 8); g.lineTo(w / 2 + 3, c - 8); g.closePath(); g.fill(); },
  rosa: (g, w, h, c) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2, c + 24); g.bezierCurveTo(w / 2 - 44, c - 6, w / 2 - 20, c - 34, w / 2, c - 12); g.bezierCurveTo(w / 2 + 20, c - 34, w / 2 + 44, c - 6, w / 2, c + 24); g.fill(); },
};
function capTexture(color, key) { return memoize('H-capTex|' + color + key, () => capTextureDraw(color, key)); }
function capTextureDraw(color, key) {
  const W = 512, Hh = 256, c = cv(W, Hh), g = c.getContext('2d');
  const f = fabric(color, 'twill', { thread: 2, size: 128 });
  g.fillStyle = color; g.fillRect(0, 0, W, Hh);
  g.globalAlpha = 0.9; g.drawImage(f.map, 0, 0, W, Hh); g.globalAlpha = 1;
  g.fillStyle = shade(color, -16); g.globalAlpha = 0.6; g.fillRect(0, 0, W, Hh); g.globalAlpha = 1;
  // v = 0 (borda de baixo da copa) fica embaixo do canvas, v = 1 (topo) em cima
  for (let k = 0; k < 6; k++) {
    const x = ((k + 0.5) / 6) * W;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 1.5, 0, 3, Hh);
    stitch(g, [[x - 5, 0], [x - 5, Hh]], 'rgba(255,255,255,.35)', 5, 4, 1.1); stitch(g, [[x + 5, 0], [x + 5, Hh]], 'rgba(255,255,255,.35)', 5, 4, 1.1);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(x, 22, 3, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(x, 21, 1.4, 0, 6.28); g.fill(); // ilhó
  }
  const cx = 0.5 * W, cy = Hh * 0.58;
  g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 4; (EMBLEMS[key] || EMBLEMS.vermelho)(g, W, Hh, cy); g.restore();
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, Hh - 14, W, 14);   // suor/barra interna
  return c;
}
function capHat(id, color) {
  const key = id.replace('bone-', '');
  const g = new THREE.Group();
  const rx = 0.224, rz = 0.24, h = 0.19;
  const dome = surface(64, 16, (i, j) => {
    const th = (i / 64) * TAU, w = j / 16, phi = w * Math.PI / 2;
    const r = Math.pow(Math.cos(phi), 2 / 3), y = h * Math.pow(Math.sin(phi), 2 / 3);   // perfil quadradinho: laterais retas, topo redondo
    const [qx, qz] = sqDir(th, 3.6);
    return [rx * r * qx, y, rz * r * qz, i / 64 + 0.5, w];   // u = 0,5 é a frente (emblema)
  }, true, true);
  const cmap = capTexture(color, key);
  const domeMat = sharedMat('H-dome|' + color + key, () => new THREE.MeshStandardMaterial({ map: T(cmap), roughness: 0.88, envMapIntensity: 0.35 }));
  const meshes = [new THREE.Mesh(dome, domeMat)];
  // aba curva (a frente): desce nas pontas e na ponta da frente
  const billMat = sharedMat('H-bill|' + color, () => new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, map: T((() => { const c = cv(128, 64), q = c.getContext('2d'); q.fillStyle = shade(color, -26); q.fillRect(0, 0, 128, 64); for (let x = 0; x < 128; x += 8) { q.fillStyle = 'rgba(255,255,255,.07)'; q.fillRect(x, 0, 2, 64); } stitch(q, [[4, 56], [124, 56]], 'rgba(255,255,255,.45)', 5, 4, 1.2); stitch(q, [[4, 48], [124, 48]], 'rgba(255,255,255,.3)', 5, 4, 1.0); return c; })()) }));
  const bill = surface(40, 8, (i, j) => {
    const a = (-1.05 + 2.1 * (i / 40)), s = j / 8;
    const [qx, qz] = sqDir(a, 3.6);
    const r0x = rx * qx, r0z = rz * qz;
    const len = 0.11 * (0.6 + 0.4 * Math.cos(a * 1.3)) * s;
    const x = r0x + Math.sin(a) * len, z = r0z + Math.cos(a) * len;
    const y = 0.02 - 0.05 * s * s - 0.025 * (1 - Math.cos(a)) * s;
    return [x, y, z, i / 40, s];
  }, false);
  meshes.push(new THREE.Mesh(bill, billMat));
  // pontinha do topo + fecho traseiro
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), sharedMat('H-btn|' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }))); btn.position.y = h + 0.003;
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.01), sharedMat('H-strap', () => new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.6 }))); strap.position.set(0, 0.03, -rz * 1.0); strap.rotation.x = 0.1;
  const dots = new THREE.Group();
  for (let i = -2; i <= 2; i++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8), sharedMat('H-dot', () => new THREE.MeshStandardMaterial({ color: 0x777777 }))); d.rotation.x = Math.PI / 2; d.position.set(i * 0.017, 0, -0.002); dots.add(d); }
  dots.position.copy(strap.position); dots.rotation.x = strap.rotation.x;
  meshes.push(btn, strap, dots);
  meshes.forEach((m) => { m.castShadow = true; g.add(m); });
  g.userData.coversHair = true;
  return bake(g);
}

export function makeHat(id, capColor) {
  if (!id || id === 'nenhum') return null;
  if (HATS[id]) return brimHat(id);
  if (id.startsWith('bone-')) return capHat(id, capColor || '#d93a3a');
  return null;
}
