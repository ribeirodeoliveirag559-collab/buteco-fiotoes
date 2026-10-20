// Montagem 3D das roupas: tronco com ombros e caimento, gola de verdade (rib, colarinho, V), mangas com punho,
// pernas (pele + calça com barra), quadril com cinto e fivela. Tudo em superfícies lofted com texturas de gear-cloth-art.js.
import * as THREE from 'three';
import { tex, sharedMat } from './gear-tex.js';
import { bake } from './gear-merge.js';
import { shirtSpec, shirtTorsoTexture, sleeveTexture, pantSpec, legTexture, pelvisTexture, SHIRT_IDS } from './gear-cloth-art.js';

const TAU = Math.PI * 2;
const sg = (v) => (v < 0 ? -1 : 1);
const TC = new WeakMap();
const T = (c) => { if (!TC.has(c)) { const t = tex(c, { repeat: [1, 1] }); t.wrapT = THREE.ClampToEdgeWrapping; TC.set(c, t); } return TC.get(c); };  // emenda em volta (u) repete; no sentido da altura (v) não
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
let CID = 0;
const cloth = (map, o = {}) => { map.__mid = map.__mid || ++CID; return sharedMat('C-cloth|' + map.__mid + '|' + (o.rough ?? 0.92) + '|' + (o.env ?? 0.3), () => new THREE.MeshStandardMaterial({ map: T(map), roughness: o.rough ?? 0.92, metalness: 0, envMapIntensity: o.env ?? 0.3, side: THREE.DoubleSide })); };
const plain = (c, r = 0.8, m = 0) => sharedMat('C-plain|' + c + '|' + r + '|' + m, () => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, envMapIntensity: m > 0.5 ? 1 : 0.3 }));

export const NEW_SHIRTS = new Set(SHIRT_IDS);

// ---- loft em y: anéis superelípticos (t = 0 na frente +z, cresce pro +x) ----
// secs: [{ y, a, b, dx, dz }], p = expoente (2 = elipse, maior = mais quadrado)
function ringY(secs, { n = 36, p = 2.5, uShift = 0, vMin, vMax, closeTop = false } = {}) {
  const pos = [], uv = [], idx = [], m = secs.length;
  const y0 = vMin ?? secs[0].y, y1 = vMax ?? secs[m - 1].y;
  for (let j = 0; j < m; j++) {
    const S = secs[j], pp = S.p || p;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU, s = Math.sin(t), c = Math.cos(t);
      pos.push((S.dx || 0) + S.a * sg(s) * Math.pow(Math.abs(s), 2 / pp), S.y, (S.dz || 0) + S.b * sg(c) * Math.pow(Math.abs(c), 2 / pp));
      uv.push(uShift + i / n, (S.y - y0) / (y1 - y0));
    }
  }
  const w = n + 1;
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < n; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const nn = g.attributes.normal;
  for (let j = 0; j < m; j++) { const a = j * w, b = j * w + n; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = Math.hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); }
  return g;
}
const lin = (tbl, y) => { for (let i = 1; i < tbl.length; i++) if (y <= tbl[i][0]) { const [y0, a0, b0] = tbl[i - 1], [y1, a1, b1] = tbl[i]; const t = (y - y0) / (y1 - y0); return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t]; } const l = tbl[tbl.length - 1]; return [l[1], l[2]]; };

// perfil do tronco (y do mundo, meia-largura, meia-profundidade)
const TORSO = [[0.62, 0.262, 0.15], [0.7, 0.256, 0.143], [0.8, 0.25, 0.137], [0.95, 0.253, 0.137], [1.12, 0.262, 0.141], [1.24, 0.272, 0.138], [1.295, 0.258, 0.124], [1.33, 0.19, 0.105], [1.35, 0.112, 0.085]];
// raio mínimo do quadril por altura: a camisa solta tem que ficar POR FORA dele
const PELVIS_R = [[0.6, 0.264, 0.152], [0.66, 0.268, 0.152], [0.74, 0.262, 0.146], [0.8, 0.256, 0.14]];
function torsoSecs(hem, tucked) {
  const ys = [hem, hem + 0.06, 0.8, 0.95, 1.12, 1.24, 1.295, 1.33, 1.35].filter((y, i, a) => i === 0 || y > a[i - 1] + 1e-4);
  return ys.map((y) => {
    let [a, b] = lin(TORSO, y);
    if (!tucked && y <= 0.84) { const [pa, pb] = lin(PELVIS_R, Math.max(0.6, Math.min(0.8, y))); const k = y <= 0.8 ? 0.012 : 0.012 * (0.84 - y) / 0.04; a = Math.max(a, pa + k); b = Math.max(b, pb + k * 0.8); }
    return { y, a, b };
  });
}

// =====================================================================================
//  TRONCO (camisa): devolve um Group centrado em y = 1,04 (como o tronco antigo, pro "balanço" do avatar)
// =====================================================================================
const TORSO_Y = 0.74 + 0.3;
export function buildTorso(id, skinHex) {
  const S = shirtSpec(id), g = new THREE.Group();
  const hem = S.tucked ? 0.8 : S.short ? 0.72 : 0.66;
  const secs = torsoSecs(hem, !!S.tucked);
  if (!S.tucked) { secs[0].a += 0.012; secs[0].b += 0.009; } // barra levemente aberta
  const geo = ringY(secs, { uShift: 0.5 - 0.5, vMin: 0.70, vMax: 1.34, p: 2.6 });
  // u: frente no meio da textura (0,5)
  { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + 0.5); }
  const body = mesh(geo, cloth(shirtTorsoTexture(id), { rough: S.fabric === 'jersey' || S.fabric === 'mesh' ? 0.85 : 0.93 }));
  g.add(body);
  addCollar(g, S, id);
  g.position.y = TORSO_Y; g.children.forEach((c) => { c.position.y -= TORSO_Y; });
  g.userData.hem = hem; g.userData.spec = S;
  return bake(g);
}
function addCollar(g, S, id) {
  const base = S.base, trim = S.trim;
  const ring = (rx, rz, tube, color, y, tilt = 0) => {
    const t = mesh(new THREE.TorusGeometry(1, tube, 8, 36), plain(color, 0.9));
    t.rotation.x = Math.PI / 2 + tilt; t.scale.set(rx, rz, 1); t.position.set(0, y, 0); g.add(t); return t;
  };
  const col = (c) => new THREE.Color(c).multiplyScalar(0.92);
  if (S.collar === 'crew') { // gola careca de malha (rib duplo)
    ring(0.118, 0.098, 0.016, '#' + col(base).getHexString(), 1.345); const r2 = ring(0.114, 0.093, 0.01, '#' + new THREE.Color(base).multiplyScalar(0.7).getHexString(), 1.33); r2.scale.z = 1;
  } else if (S.collar === 'vneck') { // gola em V com vivo
    for (const sx of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(0.014, 0.115, 0.016), plain(trim, 0.85)); b.position.set(sx * 0.047, 1.3, 0.1); b.rotation.z = -sx * 0.55; g.add(b); }
    ring(0.108, 0.085, 0.012, trim, 1.352, 0);
  } else { // colarinho de camisa: base (pé de gola) + duas abas (oxford ou americano)
    const stand = ring(0.112, 0.09, 0.012, base, 1.345);
    const col2 = S.collar === 'western' ? 0xf1e3c0 : new THREE.Color(base).multiplyScalar(1.06).getHex();
    const wingGeo = (() => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.092, 0.018); sh.lineTo(0.106, -0.058); sh.lineTo(0.03, -0.07); sh.closePath(); const e = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: true, bevelSize: 0.0016, bevelThickness: 0.0016, bevelSegments: 1 }); return e; })();
    for (const sx of [-1, 1]) {
      const wing = mesh(wingGeo, plain(col2, 0.9)); wing.scale.x = sx; wing.position.set(sx * 0.006, 1.352, 0.083); wing.rotation.set(-0.36, sx * -0.28, sx * 0.34); g.add(wing);
    }
    const back = ring(0.118, 0.095, 0.014, '#' + new THREE.Color(col2).getHexString(), 1.352); back.scale.set(0.12, 0.098, 1);
  }
  if (S.collar !== 'crew' && S.collar !== 'vneck') { // vão do pescoço escurecido
    const hole = mesh(new THREE.CircleGeometry(1, 24), plain(0x1a1210, 1)); hole.rotation.x = -Math.PI / 2; hole.scale.set(0.1, 0.078, 1); hole.position.set(0, 1.347, 0); g.add(hole);
  }
}

// =====================================================================================
//  BRAÇO: pele + manga (curta ou longa) com punho; origem no ombro (pivô), desce em -y
// =====================================================================================
function tube(secs, opts) { // secs: [{y,a,b}] em coordenadas locais
  return ringY(secs, Object.assign({ n: 24, p: 2.1 }, opts));
}
export function buildArm(id, skinHex, side) {
  const S = id ? shirtSpec(id) : null, g = new THREE.Group();
  const skin = plain(skinHex, 0.72);
  // braço de pele
  g.add(mesh(tube([{ y: 0.02, a: 0.062, b: 0.062 }, { y: -0.12, a: 0.06, b: 0.058 }, { y: -0.3, a: 0.054, b: 0.052 }, { y: -0.46, a: 0.046, b: 0.046 }, { y: -0.58, a: 0.042, b: 0.04 }], { vMin: -0.6, vMax: 0.02 }), skin));
  const hand = mesh(new THREE.SphereGeometry(0.05, 16, 12), skin); hand.scale.set(0.9, 1.05, 0.8); hand.position.set(0, -0.63, 0.005); g.add(hand);
  const thumb = mesh(new THREE.CapsuleGeometry(0.014, 0.04, 4, 8), skin); thumb.position.set(-side * 0.03, -0.62, 0.03); thumb.rotation.z = side * 0.3; thumb.rotation.x = 0.4; g.add(thumb);
  if (!S) return bake(g);
  const len = S.long ? 0.55 : S.short ? 0.17 : 0.24;
  const flare = S.long ? 0.0 : 0.006;
  const secs = [
    { y: 0.085, a: 0.03, b: 0.03 }, { y: 0.07, a: 0.062, b: 0.06 }, { y: 0.04, a: 0.076, b: 0.074 }, { y: -0.02, a: 0.08, b: 0.078 },
  ];
  const wA = S.long ? 0.058 : 0.073, wB = S.long ? 0.056 : 0.07;
  secs.push({ y: -len * 0.45, a: 0.078 - (S.long ? 0.012 : 0), b: 0.075 - (S.long ? 0.012 : 0) }, { y: -len, a: wA + flare, b: wB + flare });
  const sg2 = ringY(secs, { n: 24, p: 2.1, uShift: 0, vMin: -0.55, vMax: 0.085 });
  g.add(mesh(sg2, cloth(sleeveTexture(id))));
  if (S.cuff) {
    const col = S.collar === 'crew' ? S.base : (S.trim && S.fabric === 'mesh' ? S.trim : S.base);
    const t = mesh(new THREE.CylinderGeometry(wA + 0.006, wA + 0.004, 0.06, 20, 1, true), cloth(sleeveTexture(id)));
    t.position.y = -len + 0.03; t.scale.z = wB / wA; g.add(t);
    const rim = mesh(new THREE.TorusGeometry(wA + 0.005, 0.0055, 8, 24), plain(S.fabric === 'mesh' ? S.trim : '#' + new THREE.Color(S.base).multiplyScalar(0.78).getHexString(), 0.9)); rim.rotation.x = Math.PI / 2; rim.position.y = -len; rim.scale.y = wB / wA; g.add(rim);
    if (S.snaps) { const sn = mesh(new THREE.SphereGeometry(0.0085, 8, 6), plain(S.snaps, 0.35, 0.3)); sn.position.set(wA * 0.2, -len + 0.035, wB + 0.007); g.add(sn); }
  } else if (!S.long) { // barra da manga curta dobrada
    const rim = mesh(new THREE.TorusGeometry(wA + 0.003, 0.0045, 6, 24), plain('#' + new THREE.Color(S.base).multiplyScalar(0.8).getHexString(), 0.9)); rim.rotation.x = Math.PI / 2; rim.position.y = -len; rim.scale.y = wB / wA; g.add(rim);
  }
  return bake(g);
}

// =====================================================================================
//  QUADRIL (cós, cinto, braguilha) e PERNAS (pele + calça)
// =====================================================================================
export function buildPelvis(pantsId) {
  const P = pantSpec(pantsId), g = new THREE.Group();
  const secs = [{ y: 0.6, a: 0.264, b: 0.152 }, { y: 0.66, a: 0.268, b: 0.152 }, { y: 0.74, a: 0.262, b: 0.146 }, { y: 0.8, a: 0.256, b: 0.14 }];
  const geo = ringY(secs, { n: 40, p: 2.6, vMin: 0.6, vMax: 0.8 });
  { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + 0.5); }
  g.add(mesh(geo, cloth(pelvisTexture(pantsId), { rough: 0.9 })));
  return bake(g);
}
export function buildLeg(pantsId, skinHex) {
  const P = pantSpec(pantsId), g = new THREE.Group();
  const skin = plain(skinHex, 0.72);
  // perna de pele (de baixo da barra até o tornozelo) com panturrilha
  g.add(mesh(ringY([{ y: -0.16, a: 0.09, b: 0.09 }, { y: -0.3, a: 0.078, b: 0.078 }, { y: -0.44, a: 0.066, b: 0.07 }, { y: -0.56, a: 0.054, b: 0.056 }, { y: -0.68, a: 0.044, b: 0.046 }], { n: 20, p: 2.1, vMin: -0.7, vMax: -0.15 }), skin));
  const len = P.long ? 0.66 : P.len;
  const flare = P.flare || 0;
  const hemR = P.slim ? 0.082 : 0.098 + flare;
  const secs = [{ y: 0.04, a: 0.128, b: 0.118 }, { y: -0.02, a: 0.128, b: 0.118 }, { y: -len * 0.35, a: 0.108 + (P.slim ? -0.008 : 0.004), b: 0.1 }, { y: -len * 0.62, a: P.slim ? 0.094 : 0.108, b: P.slim ? 0.088 : 0.1 }, { y: -len, a: hemR, b: hemR * 0.94 }];
  const geo = ringY(secs, { n: 36, p: 2.3, vMin: -len, vMax: 0.04 });
  g.add(mesh(geo, cloth(legTexture(pantsId), { rough: P.kind === 'satin' ? 0.45 : 0.93, env: P.kind === 'satin' ? 0.7 : 0.3 })));
  if (P.cuff) { // barra dobrada
    const c = mesh(new THREE.CylinderGeometry(hemR + 0.008, hemR + 0.004, 0.05, 28, 1, true), cloth(legTexture(pantsId))); c.position.y = -len + 0.025; c.scale.z = 0.94; g.add(c);
    const rim = mesh(new THREE.TorusGeometry(hemR + 0.007, 0.006, 6, 28), plain(P.base, 0.9)); rim.rotation.x = Math.PI / 2; rim.position.y = -len; rim.scale.y = 0.94; g.add(rim);
  }
  if (P.zip) { const z = mesh(new THREE.BoxGeometry(0.006, 0.07, 0.006), plain(0xb8bcc4, 0.3, 0.9)); z.position.set(hemR + 0.001, -len + 0.05, 0); g.add(z); }
  return bake(g);
}
export const hasPants = (id) => !!pantSpec(id);
