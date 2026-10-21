// Cabelos 3D: cada corte tem silhueta própria (casca com risca, degradê, franja, pontas desfiadas, queda até os
// ombros) e detalhes em geometria (topete, cachos, black power, dreads, tranças nagô, coque, rabo de cavalo, moicano).
// Tudo usa o mesmo material de cabelo, então a fusão (bake) da cabeça junta tudo em poucas malhas.
import * as THREE from 'three';
import { PI, TAU, sstep, lerp, headPoint, grid } from './head-geo.js';
import { hairTex } from './face.js';

const HANG = 0.35;                   // metros de queda por radiano abaixo do "equador" da cabeça
const D = (m) => PI / 2 + m / HANG;  // limite que desce m metros
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// f/s/b = até onde o cabelo desce na frente / lado / nuca (ângulo a partir do topo); hang = cai reto abaixo da orelha
// thick = volume, curl = ondulação, lift = volume no topo, fade = laterais raspadas, part = risca, fringe = franja de lado,
// jag = pontas desfiadas, flare = abre (+) ou fecha (-) nas pontas, tex = tipo de fio, extras = detalhes 3D
export const HAIR_STYLES = {
  curto: { f: 0.34 * PI, s: 0.5 * PI, b: 0.64 * PI, thick: 0.018, curl: 0.004, lift: 0.014, tex: 'straight', extras: ['tufts'] },
  degrade: { f: 0.3 * PI, s: 0.5 * PI, b: 0.62 * PI, thick: 0.032, curl: 0.002, lift: 0.004, fade: { from: 0.29 * PI, to: 0.4 * PI, k: 0.05 }, tex: 'straight' },
  oldmoney: { f: 0.3 * PI, s: 0.48 * PI, b: 0.62 * PI, thick: 0.02, curl: 0.002, lift: 0.014, part: 0.42, sweep: 0.03, tex: 'slick', extras: ['combed'] },
  topete: { f: 0.34 * PI, s: 0.5 * PI, b: 0.64 * PI, thick: 0.016, curl: 0.002, lift: 0.008, fade: { from: 0.3 * PI, to: 0.42 * PI, k: 0.12 }, tex: 'slick', extras: ['pompadour'], topH: 0.08 },
  ondulado: { f: 0.3 * PI, s: D(0.08), b: D(0.13), hang: true, flare: 0.5, thick: 0.024, curl: 0.016, lift: 0.02, tex: 'curly', extras: ['curls'] },
  mullet: { f: 0.34 * PI, s: 0.5 * PI, b: D(0.32), hang: true, flare: 0.12, thick: 0.02, curl: 0.006, lift: 0.012, fade: { from: 0.36 * PI, to: 0.47 * PI, k: 0.12, keepBack: true }, jag: 0.05, tex: 'straight', extras: ['backTips'] },
  longo: { f: 0.27 * PI, s: D(0.34), b: D(0.44), hang: true, flare: 0.3, thick: 0.02, curl: 0.004, lift: 0.014, tex: 'straight' },
  blackpower: { f: 0.3 * PI, s: 0.56 * PI, b: 0.66 * PI, thick: 0.085, curl: 0.02, curlF: 2.4, lift: 0.03, tex: 'coily', extras: ['puffs'], hatThick: 0.03, topH: 0.06 },
  dreads: { f: 0.32 * PI, s: 0.5 * PI, b: 0.62 * PI, thick: 0.012, curl: 0.004, lift: 0.008, tex: 'braid', extras: ['locs'] },
  moicano: { noShell: true, extras: ['crest'], topH: 0.1 },
  coque: { f: 0.32 * PI, s: 0.5 * PI, b: 0.62 * PI, thick: 0.01, curl: 0.001, lift: 0.004, tex: 'slick', extras: ['bun'], topH: 0.06 },
  rabo: { f: 0.3 * PI, s: 0.5 * PI, b: 0.62 * PI, thick: 0.01, curl: 0.001, lift: 0.004, tex: 'slick', extras: ['ponytail'] },
  nago: { f: 0.3 * PI, s: 0.5 * PI, b: 0.64 * PI, thick: 0.004, curl: 0, lift: 0, tex: 'braid', extras: ['cornrows'] },
  emo: { f: 0.3 * PI, s: 0.52 * PI, b: 0.64 * PI, thick: 0.022, curl: 0.004, lift: 0.02, fringe: { a0: -0.8, a1: 0.22, add: 0.2 * PI }, jag: 0.03, tex: 'straight', extras: ['fringeTips', 'spikesBack'] },
  raspado: { noShell: true },
  cacheado: { f: 0.32 * PI, s: 0.5 * PI, b: 0.63 * PI, thick: 0.02, curl: 0.01, lift: 0.016, tex: 'curly', extras: ['smallCurls'] },
  chanel: { f: 0.4 * PI, s: D(0.1), b: D(0.08), hang: true, flare: -0.35, thick: 0.022, curl: 0.002, lift: 0.014, tex: 'straight' },
  liso: { f: 0.25 * PI, s: D(0.36), b: D(0.48), hang: true, flare: 0.18, thick: 0.016, curl: 0.002, lift: 0.01, part: 0, tex: 'straight' },
  cowboy: { f: 0.33 * PI, s: D(0.09), b: D(0.15), hang: true, flare: 0.4, thick: 0.024, curl: 0.01, lift: 0.016, jag: 0.07, tex: 'straight', extras: ['shagTips'] },
};

function limitAt(S, az) {
  const a = Math.abs(az), f = a / PI;
  let pm = f < 0.5 ? lerp(S.f, S.s, sstep(0, 0.5, f)) : lerp(S.s, S.b, sstep(0.5, 1, f));
  if (S.fringe) { const { a0, a1, add } = S.fringe; pm += add * sstep(a0, a0 + 0.25, az) * (1 - sstep(a1 - 0.15, a1, az)) * lerp(1, 0.45, Math.min(1, Math.max(0, (az - a0) / (a1 - a0)))); }
  if (S.jag) pm += (S.jag / (pm > PI / 2 ? HANG : 0.2)) * (0.5 + 0.5 * Math.sin(az * 13 + Math.sin(az * 5) * 2)) * sstep(0.5, 1.2, a);
  return pm;
}
function hairPoint(S, az, polar, grow) {
  const el = PI / 2 - polar, d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  if (!S.hang || el >= 0) return headPoint(d[0], d[1], d[2], grow);
  const base = headPoint(Math.sin(az), 0, Math.cos(az), grow), drop = -el * HANG, fl = 1 + drop * (S.flare || 0.3);
  return V(base.x * fl, base.y - drop, base.z * fl);
}
// volume da casca num ponto (fade, risca, volume do topo, ondas, fios)
function growAt(S, az, polar, t, underHat) {
  let tf = 1;
  if (S.fade) { tf = S.fade.k + (1 - S.fade.k) * (1 - sstep(S.fade.from, S.fade.to, polar)); if (S.fade.keepBack) tf = lerp(tf, 1, sstep(0.6 * PI, 0.85 * PI, Math.abs(az))); }
  const cf = S.curlF || 1;
  let gr = S.thick * tf + S.lift * Math.pow(Math.max(0, Math.cos(polar)), 2) * tf
    + S.curl * (0.5 + 0.5 * Math.sin(az * 7 * cf + polar * 9 * cf) * Math.sin(polar * 11 * cf - az * 5 * cf));
  if (S.part != null) {
    const dd = az - S.part, near = 1 - sstep(0.3 * PI, 0.44 * PI, polar);
    gr -= S.thick * 0.8 * Math.exp(-Math.pow(dd / 0.045, 2)) * near;               // risca
    const front = Math.max(0, Math.cos(Math.abs(az) * 0.8)) * sstep(0.12 * PI, 0.26 * PI, polar);
    gr += (S.sweep || (S.part ? 0.012 : 0.004)) * (dd < 0 ? 1 : 0.3) * (S.sweep ? front * sstep(0, 0.35, -dd) : Math.max(0, Math.cos(polar))) * near;  // lado penteado mais cheio (onda)
    gr += 0.0026 * Math.sin(az * 22 + polar * 16 * (dd < 0 ? -1 : 1));
  } else gr += (S.tex === 'slick' ? 0.0018 : 0.0028) * Math.sin(az * 28 + Math.sin(polar * 6) * 2);
  if (underHat && polar < 0.42 * PI) gr = Math.min(gr, S.hatThick || 0.02);
  gr *= 1 - 0.45 * sstep(0.86, 1, t);
  return Math.max(0.002, gr);
}
function shellGeo(S, underHat) {
  const NU = 112, NV = 24;
  return grid(NU, NV + 1, (i, j) => {
    const az = (i / NU) * TAU - PI, pm = limitAt(S, az);
    if (j > NV) { const p = hairPoint(S, az, pm, 0.0015); return [p.x, p.y, p.z, (i / NU) * 4, 1]; } // borda volta pra pele
    const t = j / NV, polar = t * pm, p = hairPoint(S, az, polar, growAt(S, az, polar, t, underHat));
    return [p.x, p.y, p.z, (i / NU) * 4, t];
  }, true);
}

export function buildHair(look, hairC, { underHat, M, tex, mesh }) {
  const S = HAIR_STYLES[look.hair];
  if (!S || (S.noShell && !S.extras)) return { top: S ? 0.004 : 0, hatScale: 1 };
  const r = rng(look.hair.length * 977 + 13);
  const mat = M({ color: 0xc4c4c4, map: tex(hairTex(hairC, S.tex || 'straight', 63), { repeat: [1, 1] }), roughness: S.tex === 'slick' ? 0.45 : 0.75, envMapIntensity: 0.35, side: THREE.DoubleSide });
  const dark = M({ color: '#141014', roughness: 0.5 });
  if (!S.noShell) mesh(shellGeo(S, underHat), mat);

  const at = (az, polar, extra = 0) => hairPoint(S, az, polar, (S.noShell ? 0 : growAt(S, az, polar, polar / limitAt(S, az), underHat)) + extra);
  const nrm = (az, polar) => { const p = at(az, polar), a = at(az + 0.02, polar).sub(p), b = at(az, polar + 0.02).sub(p); return a.cross(b).normalize(); };
  const hidden = (p) => underHat && p.y > 0.05;        // o chapéu cobre o que fica no alto
  const ell = (p, sc, look2, m = mat, seg = 10) => {
    if (hidden(p)) return null;
    const o = mesh(new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2)), m); o.position.copy(p); o.scale.set(...sc);
    if (look2) o.lookAt(p.clone().add(look2));
    return o;
  };
  const pointAlong = (o, dir) => o.quaternion.setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());

  for (const ex of S.extras || []) {
    switch (ex) {
      case 'tufts': // mechas curtas arrepiadas pra frente
        for (let i = 0; i < 26; i++) { const az = (r() - 0.5) * 2.6, pol = (0.04 + r() * 0.28) * PI; const n = nrm(az, pol); ell(at(az, pol, -0.003), [0.02, 0.008, 0.042], n.multiplyScalar(0.5).add(V(Math.sin(az) * 0.3, 0.25, 1))); }
        break;
      case 'combed': // mechas penteadas pro lado, saindo da risca (afundadas na casca: só dão relevo)
        for (let i = 0; i < 16; i++) { const az = lerp(0.3, -1.2, r()), pol = (0.06 + r() * 0.24) * PI; ell(at(az, pol, -0.004), [0.016, 0.007, 0.06], V(-Math.cos(az), 0.05, -Math.sin(az) * 0.5 + 0.2)); }
        break;
      case 'pompadour': { // topete alto: rolo grande na frente + volume que vai pra trás
        if (underHat) break;
        // 4 fileiras da testa pro cocuruto: a da frente é a mais alta e passa da linha do cabelo
        for (let row = 0; row < 4; row++) for (let i = 0; i < 7; i++) {
          const k = i / 6 - 0.5, az = k * (1.25 - row * 0.12), pol = (0.3 - row * 0.075) * PI, big = (1 - Math.abs(k) * 1.1) * (1 - row * 0.2);
          if (big <= 0.05) continue;
          const p = at(az, pol, 0.012); p.y += 0.07 * big; p.z += 0.03 * big - row * 0.008;
          ell(p, [0.03 + 0.03 * big, 0.026 + 0.03 * big, 0.06 + 0.02 * big], V(Math.sin(az) * 0.15, 0.35 + row * 0.1, 1), mat, 14);
        }
        break;
      }
      case 'curls': // cachos soltos por toda a casca
        for (let i = 0; i < 90; i++) {
          const az = (r() * 2 - 1) * PI, pm = limitAt(S, az), pol = r() * (pm - 0.04), p = at(az, pol, 0.004); if (hidden(p)) continue;
          const rr = 0.014 + r() * 0.012, c = mesh(new THREE.TorusGeometry(rr, rr * 0.45, 6, 12, PI * (1.3 + r() * 0.6)), mat);
          c.position.copy(p); c.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
        }
        break;
      case 'smallCurls': // cachinhos curtos e fechados
        for (let i = 0; i < 130; i++) { const az = (r() * 2 - 1) * PI, pm = limitAt(S, az), pol = r() * (pm - 0.05); const rr = 0.013 + r() * 0.008; ell(at(az, pol, rr * 0.3), [rr, rr, rr], null, mat, 8); }
        break;
      case 'puffs': // black power: bolinhas crespas no contorno
        for (let i = 0; i < 170; i++) { const az = (r() * 2 - 1) * PI, pm = limitAt(S, az), pol = r() * (pm - 0.03); const rr = 0.02 + r() * 0.014; ell(at(az, pol, -rr * 0.55), [rr, rr, rr], null, mat, 8); }
        break;
      case 'backTips': // mullet: mechas pontudas caindo na nuca
        for (let i = 0; i < 13; i++) { const az = PI + (i / 12 - 0.5) * 2.1, pm = limitAt(S, az), p = at(az, pm - 0.05, 0.004); p.y -= 0.03; const o = ell(p, [0.022, 0.06, 0.014], null); if (o) o.rotation.z = (r() - 0.5) * 0.4; }
        break;
      case 'shagTips': // cowboy desfiado: pontas pra fora nas laterais e atrás
        for (let i = 0; i < 18; i++) { const az = (r() < 0.5 ? -1 : 1) * (0.95 + r() * (PI - 0.95)), pm = limitAt(S, az), p = at(az, pm - 0.06, 0.006); p.y -= 0.025; const o = ell(p, [0.02, 0.055, 0.013], null); if (o) pointAlong(o, V(Math.sin(az) * 0.5, -1, Math.cos(az) * 0.5)); }
        break;
      case 'fringeTips': { // emo: franja de lado em pontas cobrindo um olho
        const { a0, a1 } = S.fringe;
        for (let i = 0; i < 8; i++) { const az = lerp(a0 + 0.12, a1 - 0.06, i / 7), pm = limitAt(S, az), p = at(az, pm - 0.04, 0.006); p.y -= 0.018; const o = ell(p, [0.018, 0.05, 0.011], null); if (o) o.rotation.z = 0.25 + (r() - 0.5) * 0.3; }
        break;
      }
      case 'spikesBack': // emo: pontas arrepiadas atrás
        for (let i = 0; i < 7; i++) {
          const az = PI + (i / 6 - 0.5) * 1.6, pol = (0.22 + r() * 0.12) * PI, p = at(az, pol, 0); if (hidden(p)) continue;
          const c = mesh(new THREE.ConeGeometry(0.022, 0.07, 7), mat); const n = nrm(az, pol); c.position.copy(p).addScaledVector(n, 0.025); pointAlong(c, n.add(V(0, 0.3, -0.5)));
        }
        break;
      case 'crest': { // moicano: crista de pontas do meio da testa até a nuca
        const path = [];
        for (let i = 0; i <= 26; i++) { const th = lerp(0.42, PI + 0.4, i / 26); path.push(headPoint(0, Math.sin(th), Math.cos(th), 0.006)); }
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 40, 0.024, 8, false), mat);
        if (underHat) break;
        for (let i = 0; i < 12; i++) {
          const th = lerp(0.5, PI + 0.25, i / 11), n = V(0, Math.sin(th), Math.cos(th)), h = 0.1 * (1 - 0.45 * Math.abs(i / 11 - 0.35));
          const c = mesh(new THREE.ConeGeometry(0.028, h, 8), mat); c.position.copy(headPoint(0, n.y, n.z, 0.01 + h * 0.45)); pointAlong(c, n.clone().add(V(0, 0, -0.35)));
        }
        break;
      }
      case 'bun': { // coque samurai no alto da cabeça
        if (underHat) break;
        const n = V(0, 0.84, -0.54).normalize(), base = headPoint(n.x, n.y, n.z, 0.01), c = base.clone().addScaledVector(n, 0.055);
        ell(c, [0.062, 0.055, 0.062], null, mat, 18);
        for (let i = 0; i < 3; i++) { const t = mesh(new THREE.TorusGeometry(0.046, 0.016, 8, 22), mat); t.position.copy(c); t.rotation.set(i * 1.05, i * 0.7, 0.4); }
        const tie = mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 18), dark); tie.position.copy(base).addScaledVector(n, 0.012); pointAlong(tie, V(0, 0, 1)); tie.quaternion.setFromUnitVectors(V(0, 0, 1), n);
        break;
      }
      case 'ponytail': { // rabo de cavalo preso na nuca
        const n = V(0, 0.2, -1).normalize(), p0 = headPoint(n.x, n.y, n.z, 0.012);
        const tie = mesh(new THREE.TorusGeometry(0.028, 0.009, 6, 18), dark); tie.position.copy(p0).addScaledVector(n, 0.004); tie.quaternion.setFromUnitVectors(V(0, 0, 1), n);
        const curve = new THREE.CatmullRomCurve3([p0.clone().addScaledVector(n, 0.01), p0.clone().add(V(0, -0.04, -0.06)), p0.clone().add(V(0, -0.16, -0.085)), p0.clone().add(V(0, -0.3, -0.07)), p0.clone().add(V(0, -0.42, -0.045))]);
        for (let i = 0; i < 14; i++) { const t = i / 13, p = curve.getPoint(t), rr = lerp(0.036, 0.012, t); const o = mesh(new THREE.SphereGeometry(1, 12, 10), mat); o.position.copy(p); o.scale.set(rr, rr * 1.9, rr); pointAlong(o, curve.getTangent(t)); }
        break;
      }
      case 'locs': { // dreads: cordões grossos caindo da cabeça até os ombros
        for (let i = 0; i < 38; i++) {
          let az = (r() * 2 - 1) * PI; if (Math.abs(az) < 0.6) az = Math.sign(az || 1) * (0.6 + r() * 0.4);
          const el0 = Math.abs(az) < 1.2 ? 0.75 + r() * 0.5 : 0.2 + r() * 1.0, h = V(Math.sin(az), 0, Math.cos(az)), L = 0.2 + r() * 0.16;
          const d = (e) => [Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e)];
          const p0 = headPoint(...d(el0), 0.012), p1 = headPoint(...d(el0 * 0.45), 0.03), p2 = headPoint(...d(-0.1), 0.036);
          const p3 = p2.clone().addScaledVector(h, 0.03).add(V(0, -L * 0.5, 0)), p4 = p2.clone().addScaledVector(h, 0.055).add(V((r() - 0.5) * 0.03, -L, 0));
          const cv = new THREE.CatmullRomCurve3([p0, p1, p2, p3, p4]);
          mesh(new THREE.TubeGeometry(cv, 14, 0.0115, 6, false), mat);
          ell(p4, [0.0115, 0.0115, 0.0115], null, mat, 6);
        }
        break;
      }
      case 'cornrows': { // tranças nagô: fileiras de gomos da testa até a nuca
        for (let row = 0; row < 9; row++) {
          const s = lerp(-0.64, 0.64, row / 8), c = Math.sqrt(1 - s * s), th0 = 0.5 + Math.abs(s) * 0.6;
          const pt = (th) => headPoint(s, c * Math.sin(th), c * Math.cos(th), 0.007);
          for (let th = th0, k = 0; th < PI + 0.55; th += 0.105, k++) {
            const p = pt(th), q = pt(th + 0.05).sub(p);
            const o = mesh(new THREE.SphereGeometry(1, 8, 6), mat); o.position.copy(p); o.scale.set(0.013, 0.017, 0.009);
            pointAlong(o, q); o.rotateY(k % 2 ? 0.45 : -0.45);
          }
        }
        break;
      }
    }
  }
  const thickTop = underHat ? Math.min(S.thick || 0, S.hatThick || 0.02) : (S.thick || 0) + (S.lift || 0);
  return {
    top: thickTop + 0.01 + (underHat ? 0 : S.topH || 0),
    hatScale: 1 + Math.max(0, (S.hatThick || Math.min(S.thick || 0, 0.02)) - 0.02) * 2.5,
  };
}
