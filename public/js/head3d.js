// Cabeça 3D oval com volume de verdade: crânio oval texturizado, olhos (globo, íris, pupila, pálpebras),
// sobrancelhas, nariz, orelhas, boca/lábios, bigode e barba, cabelo em cascas 3D com mechas e óculos.
// Origem do grupo = centro da cabeça; frente = +z.
import * as THREE from 'three';
import { toTex } from './textures.js';
import { bake } from './gear-merge.js';
import { paintHeadSkin, hairTexture, irisColor } from './face.js';

import { RX, RY, RZ, PI, TAU, sstep, lerp, headPoint, dirOf, surf, normalAt, fixSeam, grid } from './head-geo.js';
import { buildHair } from './hair3d.js';
export { RX, RY, RZ, headPoint };

// barba: casca sobre maxilar e queixo (das costeletas até embaixo do queixo)
function beardGeo() {
  const NU = 44, NV = 14;
  return grid(NU, NV, (i, j) => {
    const u = i / NU * 2 - 1, v = j / NV, az = u * 1.65;
    const top = -0.5 + 0.55 * sstep(0.3, 1.4, Math.abs(az)), el = lerp(top, -1.35, v);
    const lump = 0.006 * (0.5 + 0.5 * Math.sin(az * 9 + v * 7) * Math.sin(v * 13 - az * 4)) + 0.002 * Math.sin(az * 30);
    const gr = (0.012 + lump) * sstep(0, 0.3, v) * sstep(1, 0.8, Math.abs(u)) * (1 - 0.7 * sstep(0.8, 1, v));
    const p = surf(az, el, gr);
    p.y -= 0.035 * sstep(0.25, 0.75, v) * (1 - sstep(0.85, 1, v)) * Math.pow(Math.cos(az * 0.8), 2);
    return [p.x, p.y, p.z, (u + 1) * 2, v];
  }, false);
}

export function buildHead(look, skinC, hairC, opts = {}) {
  const group = new THREE.Group();
  const stat = new THREE.Group();   // peças fixas (fundidas no fim)
  const mats = [], texs = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const mesh = (geo, mat, parent = stat) => { const o = new THREE.Mesh(geo, mat); o.castShadow = true; parent.add(o); return o; };
  const tex = (c, o) => { const t = toTex(c, o); texs.push(t); return t; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tubeAlong = (pts, r, mat, closed = false, caps = true) => {
    const curve = new THREE.CatmullRomCurve3(pts, closed);
    mesh(new THREE.TubeGeometry(curve, pts.length * 6, r, 8, closed), mat);
    if (caps && !closed) for (const p of [pts[0], pts[pts.length - 1]]) mesh(new THREE.SphereGeometry(r, 8, 6), mat).position.copy(p);
  };
  const ball = (r, mat, p, sc = [1, 1, 1], rot = null) => { const o = mesh(new THREE.SphereGeometry(r, 16, 12), mat); o.position.copy(p); o.scale.set(...sc); if (rot) o.rotation.set(...rot); return o; };

  const skinCol = new THREE.Color(skinC);
  const skinMat = M({ color: skinC, roughness: 0.62 });
  const skinDark = M({ color: skinCol.clone().multiplyScalar(0.8), roughness: 0.7 });
  const lipCol = skinCol.clone().lerp(new THREE.Color('#8a2430'), 0.62).multiplyScalar(0.72);
  const lipMat = M({ color: lipCol, roughness: 0.45 });
  const browMat = M({ color: new THREE.Color(hairC).multiplyScalar(0.85), roughness: 0.8 });
  const hairMap = tex(hairTexture(hairC), { repeat: [1, 1] });
  const hairMat = M({ map: hairMap, roughness: 0.72, envMapIntensity: 0.35, side: THREE.DoubleSide });

  // ---- crânio ----
  const hg = new THREE.SphereGeometry(1, 64, 44, -PI / 2);
  { const p = hg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { headPoint(p.getX(i), p.getY(i), p.getZ(i), 0, v); p.setXYZ(i, v.x, v.y, v.z); } }
  hg.computeVertexNormals(); fixSeam(hg, 64, 44);
  mesh(hg, M({ map: tex(paintHeadSkin(look, skinC, hairC), { aniso: 8 }), roughness: 0.6 }));

  // ---- olhos ----
  const eyeWhite = M({ color: '#f7f6f0', roughness: 0.18 });
  const irisMat = M({ color: irisColor(look), roughness: 0.25 });
  const pupilMat = M({ color: '#0b0808', roughness: 0.1 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); mats.push(shineMat);
  const lashMat = M({ color: '#1d120e', roughness: 0.7 });
  const type = look.eyes || 'normal';
  const LID = { normal: 0.62, redondo: 0.5, sonolento: 1.45, bravo: 0.95, piscadinha: 0.62, coracao: 0.5, sedutor: 1.2 };
  const eyes = {};
  for (const side of [-1, 1]) {
    const r = type === 'redondo' ? 0.034 : 0.031, az = side * 0.34, el = 0.075;
    const c = surf(az, el, -0.012);
    const dir = normalAt(az, el).multiplyScalar(0.35).add(V(0, 0, 0.65)).normalize();
    const eg = new THREE.Group(); eg.position.copy(c); eg.lookAt(c.clone().add(dir)); stat.add(eg);
    mesh(new THREE.SphereGeometry(r, 24, 16), eyeWhite, eg);
    if (type === 'coracao') {
      const sh = new THREE.Shape(); sh.moveTo(0, -0.6); sh.bezierCurveTo(-1.2, 0.2, -0.6, 1.1, 0, 0.45); sh.bezierCurveTo(0.6, 1.1, 1.2, 0.2, 0, -0.6);
      const hgeo = new THREE.ExtrudeGeometry(sh, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 10 });
      const h = mesh(hgeo, M({ color: '#e8193f', roughness: 0.3, emissive: '#5a0010', emissiveIntensity: 0.4 }), eg); h.scale.setScalar(r * 0.8); h.position.z = r * 0.82;
    } else {
      const ir = mesh(new THREE.SphereGeometry(r * 0.58, 20, 12), irisMat, eg); ir.scale.z = 0.32; ir.position.z = r * 0.86;
      const pu = mesh(new THREE.SphereGeometry(r * 0.26, 14, 8), pupilMat, eg); pu.scale.z = 0.3; pu.position.z = r * 0.98;
      mesh(new THREE.SphereGeometry(r * 0.1, 8, 6), shineMat, eg).position.set(-r * 0.22, r * 0.25, r * 1.04);
    }
    // pálpebra de baixo (fixa)
    mesh(new THREE.SphereGeometry(r * 1.06, 24, 6, 0, TAU, PI - 0.6, 0.6), skinMat, eg);
    // pálpebra de cima aberta + cílios, e a fechada (piscadinha) — ficam fora da fusão porque trocam
    const lidG = new THREE.Group(); lidG.position.copy(c); lidG.quaternion.copy(eg.quaternion); group.add(lidG);
    const open = new THREE.Group(); lidG.add(open);
    const th = LID[type] ?? 0.62, R = r * 1.1;
    if (type === 'bravo') open.rotation.z = side * 0.38;
    mesh(new THREE.SphereGeometry(R, 24, 10, 0, TAU, 0, th), skinMat, open);
    const lash = mesh(new THREE.TorusGeometry(R * Math.sin(th), type === 'sedutor' ? 0.0048 : 0.0032, 6, 32), lashMat, open);
    lash.rotation.x = PI / 2; lash.position.y = R * Math.cos(th);
    if (type === 'sedutor') { const fl = mesh(new THREE.ConeGeometry(0.004, 0.02, 6), lashMat, open); fl.position.set(side * R * Math.sin(th) * 1.02, R * Math.cos(th) + 0.006, 0.004); fl.rotation.z = -side * 0.9; }
    const closed = new THREE.Group(); lidG.add(closed);
    const thc = PI - 0.55;
    mesh(new THREE.SphereGeometry(R * 1.01, 24, 12, 0, TAU, 0, thc), skinMat, closed);
    const cl = mesh(new THREE.TorusGeometry(R * Math.sin(thc), 0.0036, 6, 32), lashMat, closed); cl.rotation.x = PI / 2; cl.position.y = R * Math.cos(thc);
    eyes[side] = { open, closed };
  }

  // ---- sobrancelhas ----
  const BROW = { normal: [0.24, 0.27, 0.245], redondo: [0.27, 0.3, 0.275], sonolento: [0.22, 0.235, 0.2], bravo: [0.19, 0.24, 0.275], coracao: [0.29, 0.29, 0.25], sedutor: [0.24, 0.29, 0.27] };
  for (const side of [-1, 1]) {
    let e = BROW[type] || BROW.normal;
    if (type === 'piscadinha') e = side > 0 ? [0.22, 0.235, 0.22] : [0.26, 0.29, 0.265];
    const pts = [0.2, 0.34, 0.5].map((a, i) => surf(side * a, e[i], 0.005));
    tubeAlong(pts, type === 'sedutor' ? 0.006 : 0.0085, browMat);
  }

  // ---- nariz ----
  {
    const B = surf(0, 0.02, 0.0), T = surf(0, -0.15, 0.028), d = T.clone().sub(B);
    const br = mesh(new THREE.CapsuleGeometry(0.012, Math.max(0.01, d.length() - 0.024), 4, 10), skinMat);
    br.position.copy(B).add(T).multiplyScalar(0.5); br.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    ball(0.021, skinMat, T, [1.15, 0.95, 1]);
    for (const s of [-1, 1]) ball(0.014, skinMat, surf(s * 0.1, -0.17, 0.008));
  }
  // ---- orelhas ----
  for (const s of [-1, 1]) {
    const p = surf(s * (PI / 2 - 0.08), 0, 0.006);
    ball(1, skinMat, p, [0.016, 0.05, 0.032], [0, s * 0.25, 0]);
    ball(1, skinDark, p.clone().add(V(s * 0.008, 0, -0.003)), [0.008, 0.032, 0.019], [0, s * 0.25, 0]);
  }

  // ---- boca ----
  const arc = (azs, els, grow = 0.004) => azs.map((a, i) => surf(a, els[i], grow));
  const smile = () => tubeAlong(arc([-0.27, -0.15, 0, 0.15, 0.27], [-0.38, -0.44, -0.46, -0.44, -0.38]), 0.0075, lipMat);
  const flat = (r = 0.0065, mat = lipMat) => tubeAlong(arc([-0.22, 0, 0.22], [-0.43, -0.44, -0.43]), r, mat);
  const tongueMat = () => M({ color: '#e0607a', roughness: 0.4 });
  const mustache = (scale) => {
    const N = 15;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1) * 2 - 1, rr = (0.016 * (1 - 0.55 * Math.abs(t)) + 0.004) * scale;
      const s = mesh(new THREE.SphereGeometry(1, 12, 8), hairMat);
      s.position.copy(surf(t * 0.4, -0.35 - 0.11 * Math.pow(Math.abs(t), 1.5), rr * 0.55)); s.scale.set(rr * 1.3, rr, rr);
    }
  };
  switch (look.mouth) {
    case 'serio': flat(); break;
    case 'risada': {
      const N = 10, up = [], low = [];
      for (let i = 0; i <= N; i++) { const a = -0.3 + 0.6 * i / N, k = Math.cos(a / 0.3 * PI / 2); up.push([a, -0.37 - 0.015 * k]); low.push([a, -0.37 - 0.2 * k]); }
      const ring = up.concat(low.slice(1, -1).reverse());
      const pos = [], C = surf(0, -0.45, -0.006); pos.push(C.x, C.y, C.z);
      ring.forEach(([a, e]) => { const p = surf(a, e, 0.002); pos.push(p.x, p.y, p.z); });
      const idx = []; for (let i = 1; i <= ring.length; i++) idx.push(0, i, i === ring.length ? 1 : i + 1);
      const fan = new THREE.BufferGeometry(); fan.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fan.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); fan.setIndex(idx); fan.computeVertexNormals();
      mesh(fan, M({ color: '#3a0e10', roughness: 0.9, side: THREE.DoubleSide }));
      const teeth = []; for (let i = 0; i <= 8; i++) { const a = -0.23 + 0.46 * i / 8; teeth.push(surf(a, -0.39 - 0.012 * Math.cos(a / 0.3 * PI / 2), 0.001)); }
      tubeAlong(teeth, 0.011, M({ color: '#f6f3ea', roughness: 0.3 }));
      ball(1, tongueMat(), surf(0, -0.52, -0.004), [0.05, 0.022, 0.03]);
      tubeAlong(ring.map(([a, e]) => surf(a, e, 0.004)), 0.006, lipMat, true);
      break;
    }
    case 'lingua': smile(); ball(1, tongueMat(), surf(0.04, -0.52, 0.012), [0.028, 0.04, 0.015], [0.35, 0, 0]); break;
    case 'batom': {
      const red = M({ color: '#c8143c', roughness: 0.22, metalness: 0.05 });
      for (const s of [-1, 1]) ball(1, red, surf(s * 0.075, -0.41, 0.002), [0.03, 0.011, 0.014], [0, 0, -s * 0.25]);
      ball(1, red, surf(0, -0.47, 0.003), [0.055, 0.015, 0.017]);
      tubeAlong(arc([-0.24, 0, 0.24], [-0.43, -0.44, -0.43], 0.006), 0.0025, M({ color: '#5a0818', roughness: 0.5 }));
      break;
    }
    case 'bigode': flat(0.005); mustache(1); break;
    case 'barba': {
      flat(0.004, M({ color: lipCol.clone().multiplyScalar(0.7), roughness: 0.5 }));
      mustache(1.25);
      mesh(beardGeo(), hairMat);
      break;
    }
    default: smile();
  }

  // ---- cabelo (cada corte com silhueta e detalhes 3D próprios: hair3d.js) ----
  const hr = buildHair(look, hairC, { underHat: !!opts.underHat, M, tex, mesh });

  // ---- óculos ----
  if (look.glasses === 'grau' || look.glasses === 'sol') {
    const E = surf(0.34, 0.075, -0.012), ex = E.x, ey = E.y, z0 = E.z + 0.052;
    const frame = M({ color: '#202026', roughness: 0.35, metalness: 0.4 });
    const temple = (s) => tubeAlong([V(s * (ex + 0.043), ey, z0 - 0.004), surf(s * 0.75, 0.09, 0.008), surf(s * 1.1, 0.08, 0.008), surf(s * 1.5, 0.06, 0.008)], 0.0035, frame);
    if (look.glasses === 'grau') {
      const lens = M({ color: '#cfe8ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false });
      for (const s of [-1, 1]) {
        mesh(new THREE.TorusGeometry(0.043, 0.0042, 8, 32), frame).position.set(s * ex, ey, z0);
        mesh(new THREE.CircleGeometry(0.042, 28), lens).position.set(s * ex, ey, z0);
        temple(s);
      }
      mesh(new THREE.TorusGeometry(Math.max(0.006, ex - 0.043), 0.0038, 6, 12, PI), frame).position.set(0, ey + 0.004, z0);
    } else {
      const rr = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
      const lensM = M({ color: '#0a0a10', roughness: 0.08, metalness: 0.5 });
      for (const s of [-1, 1]) {
        mesh(new THREE.ExtrudeGeometry(rr(0.098, 0.068, 0.02), { depth: 0.004, bevelEnabled: false }), frame).position.set(s * ex, ey - 0.004, z0 - 0.006);
        mesh(new THREE.ExtrudeGeometry(rr(0.088, 0.058, 0.017), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 }), lensM).position.set(s * ex, ey - 0.004, z0 - 0.002);
        temple(s);
      }
      mesh(new THREE.BoxGeometry(Math.max(0.01, 2 * ex - 0.09), 0.006, 0.006), frame).position.set(0, ey + 0.012, z0);
    }
  }

  bake(stat);
  group.add(stat);

  let red = false, wink = false;
  const applyEyes = () => {
    eyeWhite.color.set(red ? '#f3a7a7' : '#f7f6f0');
    for (const side of [-1, 1]) {
      const shut = side > 0 && (wink || type === 'piscadinha');
      eyes[side].open.visible = !shut; eyes[side].closed.visible = shut;
    }
  };
  applyEyes();
  return {
    group,
    topY: RY + hr.top,
    hatScale: hr.hatScale,
    setRed(v) { red = !!v; applyEyes(); },
    setWink(v) { wink = !!v; applyEyes(); },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mats.forEach((m) => m.dispose()); texs.forEach((t) => t.dispose());
    },
  };
}
