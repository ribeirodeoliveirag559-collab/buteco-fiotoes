// O bar em 3D: salão, balcão, mesas, luminárias com sombra, placar, jukebox e o canto escondido.
import * as THREE from 'three';
import * as TX from './textures.js';
import { createAvatar, makeMug } from './avatar.js';

const FT = window.FT;

export const BAR = {
  half: { x: 9.6, zMin: -6.55, zMax: 6.6 },
  spawn: { x: 3.2, z: 5.6 },
  npcPos: { x: -8.6, z: 5.4 },
  poster: { x: 5.6, y: 1.95, z: -6.93, w: 5.4, h: 2.6 },
};

export function createBar(quality = 'high') {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07040a);
  scene.fog = new THREE.FogExp2(0x0a0508, 0.035);
  const hi = quality === 'high';
  const root = new THREE.Group();
  scene.add(root);

  const colliders = []; // {c:1,x,z,r} | {x0,x1,z0,z1}
  const circle = (x, z, r) => colliders.push({ c: 1, x, z, r });
  const rect = (x0, z0, x1, z1) => colliders.push({ x0, z0, x1, z1 });

  const M = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85, metalness: 0.0 }, o));
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const box = (w, h, d, mat, x, y, z, parent = root, shadow = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
    parent.add(m); return m;
  };

  // ---------------- texturas ----------------
  const floorTex = TX.toTex(TX.floorWood(), { repeat: [8, 5.6] });
  const brickTex = TX.toTex(TX.brick(), { repeat: [5, 1.4] });
  const brickTexS = TX.toTex(TX.brick(4), { repeat: [3.5, 1.4] });
  const panelTex = TX.toTex(TX.panel(), { repeat: [10, 1] });
  const panelTexS = TX.toTex(TX.panel(5), { repeat: [7, 1] });
  const woodTex = TX.toTex(TX.woodDark([24, 42, 21]), { repeat: [2, 1] });
  const woodTexL = TX.toTex(TX.woodDark([27, 48, 34], 9), { repeat: [1, 1] });
  const woodFront = TX.toTex(TX.woodDark([20, 38, 15], 12), { repeat: [6, 1] });
  const ceilTex = TX.toTex(TX.woodDark([20, 30, 11], 21), { repeat: [6, 4] });

  // ---------------- piso, paredes, teto ----------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), M(floorTex, { roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), M(ceilTex));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.5; root.add(ceil);

  const wall = (w, x, z, ry, brickT, panelT) => {
    const g = new THREE.Group();
    const up = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.3), M(brickT));
    up.position.y = 1.15 + 1.2; g.add(up);
    const lo = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.2), M(panelT));
    lo.position.y = 0.6; lo.receiveShadow = true; g.add(lo);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.1), M(woodTex));
    rail.position.set(0, 1.22, 0.04); g.add(rail);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.06), M(woodTex));
    base.position.set(0, 0.07, 0.03); g.add(base);
    g.position.set(x, 0, z); g.rotation.y = ry;
    up.receiveShadow = true;
    root.add(g);
  };
  brickTex.repeat.set(5, 1.4); brickTexS.repeat.set(3.5, 1.4);
  wall(20, 0, -7, 0, brickTex, panelTex);                 // norte
  wall(20, 0, 7, Math.PI, brickTex, panelTex);            // sul
  wall(14, -10, 0, Math.PI / 2, brickTexS, panelTexS);    // oeste
  wall(14, 10, 0, -Math.PI / 2, brickTexS, panelTexS);    // leste

  // vigas do teto
  for (const z of [-4.5, 0, 4.5]) box(20, 0.22, 0.3, M(woodTex), 0, 3.38, z, root, false);
  for (const x of [-7.5, -2.5, 2.5, 7.5]) box(0.25, 0.2, 14, M(woodTex), x, 3.4, 0, root, false);

  // ---------------- balcão ----------------
  const cx = -5.25;
  box(7.6, 1.05, 0.8, M(woodFront), cx, 0.525, -5.8);
  box(7.9, 0.07, 1.05, M(woodTexL, { roughness: 0.35 }), cx, 1.085, -5.78);
  box(7.6, 0.06, 0.06, new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 }), cx, 0.28, -5.35, root, false); // apoio de pé
  for (let i = 0; i < 4; i++) box(1.6, 0.7, 0.04, M(woodTexL), cx - 2.8 + i * 1.9 + 0.9, 0.55, -5.395); // almofadas
  rect(-9.15, -6.9, -1.35, -5.25);

  // prateleiras + garrafas (instanciadas)
  const shelfMat = M(woodTex);
  for (const y of [1.55, 2.2]) box(8.0, 0.05, 0.3, shelfMat, cx, y, -6.8);
  const bodyGeo = new THREE.CylinderGeometry(0.032, 0.035, 0.2, 8); bodyGeo.translate(0, 0.1, 0);
  const neckGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.1, 8); neckGeo.translate(0, 0.25, 0);
  const nB = 2 * 52;
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.1 }), nB);
  const necks = new THREE.InstancedMesh(neckGeo, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.1 }), nB);
  const palette = ['#2f8a3c', '#a86a1e', '#d9d2b8', '#7a1f1f', '#1f5fa8', '#c9a24a'].map((c) => new THREE.Color(c));
  let bi = 0;
  const dummy = new THREE.Object3D();
  for (const y of [1.575, 2.225]) for (let i = 0; i < 52; i++) {
    dummy.position.set(cx - 3.8 + i * 0.146, y, -6.8 + (Math.random() - 0.5) * 0.06);
    dummy.scale.set(1, 0.85 + Math.random() * 0.35, 1);
    dummy.updateMatrix();
    bodies.setMatrixAt(bi, dummy.matrix); necks.setMatrixAt(bi, dummy.matrix);
    const col = palette[Math.floor(Math.random() * palette.length)];
    bodies.setColorAt(bi, col); necks.setColorAt(bi, col);
    bi++;
  }
  bodies.castShadow = necks.castShadow = true;
  root.add(bodies, necks);

  // torneiras e canecas no balcão
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.25 });
  for (let i = 0; i < 5; i++) {
    const x = cx - 2.2 + i * 0.55;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 10), brass); tower.position.set(x, 1.28, -5.95); tower.castShadow = true; root.add(tower);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), brass); spout.position.set(x, 1.4, -5.88); root.add(spout);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), new THREE.MeshStandardMaterial({ color: [0xd33, 0x3377aa, 0x33aa44, 0xddaa33, 0x8844aa][i] })); handle.position.set(x, 1.52, -5.95); root.add(handle);
  }
  for (const x of [-8.4, -3.3, -2.6, -1.9]) { const m = makeMug(); m.position.set(x, 1.19, -5.55); m.scale.setScalar(1.1); root.add(m); }

  // banquetas do balcão
  const seatMat = L({ color: 0x8a2a2a });
  for (let i = 0; i < 7; i++) {
    const x = -8.5 + i * 1.1, z = -4.75;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 14), seatMat); s.position.set(x, 0.76, z); s.castShadow = true; root.add(s);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.4 })); p.position.set(x, 0.37, z); p.castShadow = true; root.add(p);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 14), p.material); b.position.set(x, 0.02, z); root.add(b);
    circle(x, z, 0.3);
  }

  // ---------------- mesas com luminária ----------------
  const tables = [[-3.2, -1.2], [0.2, 1.8], [3.6, -1.6], [6.6, 2.4], [-6.4, 0.8], [2.6, 4.4]];
  const lampSpots = [];
  const lampShade = new THREE.MeshStandardMaterial({ color: 0x1f4a35, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a0).multiplyScalar(2.4) });
  const tableMat = M(woodTexL, { roughness: 0.5 });
  tables.forEach(([x, z], i) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.05, 28), tableMat); top.position.set(x, 0.78, z); top.castShadow = top.receiveShadow = true; root.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.76, 10), M(woodTex)); leg.position.set(x, 0.38, z); leg.castShadow = true; root.add(leg);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.45, 0.04, 20), M(woodTex)); base.position.set(x, 0.02, z); root.add(base);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + i;
      const sx = x + Math.cos(a) * 1.05, sz = z + Math.sin(a) * 1.05;
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 14), seatMat); seat.position.set(sx, 0.5, sz); seat.castShadow = true; root.add(seat);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.48, 8), M(woodTex)); st.position.set(sx, 0.25, sz); st.castShadow = true; root.add(st);
    }
    for (let k = 0; k < 2; k++) { const m = makeMug(); const a = k * 3 + i; m.position.set(x + Math.cos(a) * 0.3, 0.9, z + Math.sin(a) * 0.3); m.scale.setScalar(1.1); m.userData.setLevel(0.3 + 0.7 * ((i + k) % 3) / 2); root.add(m); }
    circle(x, z, 1.1);
    // luminária
    const lamp = new THREE.Group(); lamp.position.set(x, 2.35, z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 5), L({ color: 0x111111 })); cord.position.y = 0.7; lamp.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 20, 1, true), lampShade); shade.position.y = 0.0; lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat); bulb.position.y = -0.05; lamp.add(bulb);
    root.add(lamp);
    const spot = new THREE.SpotLight(0xffd9a0, 26, 9, 0.95, 0.7, 2);
    spot.position.set(x, 2.3, z); spot.target.position.set(x, 0, z);
    if (hi && i < 5) {
      spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.5; spot.shadow.camera.far = 8;
    }
    root.add(spot, spot.target);
    lampSpots.push(spot);
  });

  // iluminação do balcão (sem sombra, barata)
  for (const x of [-8, -5.2, -2.4]) {
    const p = new THREE.PointLight(0xffc27a, 6, 6.5, 2);
    p.position.set(x, 2.8, -4.6); root.add(p);
  }
  const fill = new THREE.HemisphereLight(0xffddb8, 0x20120a, hi ? 0.28 : 0.45);
  root.add(fill);

  // ---------------- letreiro neon ----------------
  const neonCanvas = TX.neonSign([
    { text: 'BUTECO', y: 90, size: 118, color: '#ff4f9d', glow: '#ff1f7a', core: '#ffe3f0' },
    { text: 'FIOTÕES', y: 205, size: 118, color: '#ff4f9d', glow: '#ff1f7a', core: '#ffe3f0' },
  ], { w: 1024, h: 300 });
  const neonMat = new THREE.MeshBasicMaterial({ map: TX.toTex(neonCanvas), transparent: true, toneMapped: false });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.35), neonMat);
  neon.position.set(cx, 2.95, -6.94); root.add(neon);
  const neonLight = new THREE.PointLight(0xff3d8b, 14, 9, 2); neonLight.position.set(cx, 2.9, -6.0); root.add(neonLight);

  // ---------------- placar (cartaz grande) ----------------
  const P = BAR.poster;
  const pc = document.createElement('canvas'); pc.width = 1024; pc.height = 492;
  const pTex = TX.toTex(pc); pTex.anisotropy = 8;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(P.w + 0.3, P.h + 0.3, 0.06), M(woodTex));
  frame.position.set(P.x, P.y, P.z - 0.03); frame.castShadow = true; root.add(frame);
  const posterMesh = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.9, emissive: 0xffffff, emissiveMap: pTex, emissiveIntensity: 0.42 }));
  posterMesh.position.set(P.x, P.y, P.z + 0.005); root.add(posterMesh);
  const posterLight = new THREE.SpotLight(0xfff0c8, 24, 8, 0.9, 0.5, 2);
  posterLight.position.set(P.x, 3.2, -4.8); posterLight.target.position.set(P.x, P.y, P.z); root.add(posterLight, posterLight.target);

  function drawPoster(rows, day, meId, mode) {
    const g = pc.getContext('2d');
    g.fillStyle = '#e9dbb0'; g.fillRect(0, 0, 1024, 492);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(120,90,40,${Math.random() * 0.1})`; g.fillRect(Math.random() * 1024, Math.random() * 492, 4 + Math.random() * 40, 2); }
    g.strokeStyle = '#7a1c1c'; g.lineWidth = 8; g.strokeRect(14, 14, 996, 464);
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#7a1c1c'; g.font = '66px Bungee, Impact, sans-serif';
    g.fillText('TORNEIO FIOTÕES', 512, 92);
    g.fillStyle = '#5a4020'; g.font = '800 28px Nunito, sans-serif';
    g.fillText(`QUEM BEBE MAIS?  ·  ${day || ''}`, 512, 132);
    g.fillStyle = '#7a1c1c'; g.fillRect(70, 148, 884, 4);
    g.textBaseline = 'middle';
    if (!rows.length) {
      g.fillStyle = '#5a4020'; g.font = '800 44px Nunito, sans-serif';
      g.fillText('Ninguém bebeu ainda…', 512, 270); g.fillText('seja o primeiro! 🍺', 512, 340);
    }
    rows.slice(0, 6).forEach((r, i) => {
      const y = 190 + i * 49;
      g.textAlign = 'left';
      g.font = '66px Nunito'; // placeholder para medir
      g.font = '900 40px Nunito, sans-serif';
      g.fillStyle = i === 0 ? '#b8860b' : '#5a4020';
      g.fillText(`${i + 1}º`, 80, y);
      g.fillStyle = r.pid === meId ? '#c0145a' : '#2a1608';
      g.fillText(r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name, 170, y);
      if (r.online) { g.fillStyle = '#2aa84a'; g.beginPath(); g.arc(640, y, 9, 0, 7); g.fill(); }
      g.textAlign = 'right'; g.fillStyle = '#7a1c1c'; g.font = '66px Nunito';
      g.font = '900 42px Bungee, Impact, sans-serif';
      g.fillText(`${r.beers} 🍺`, 950, y);
    });
    if (mode === 'offline') { g.textAlign = 'center'; g.fillStyle = 'rgba(90,64,32,.7)'; g.font = '700 22px Nunito'; g.fillText('(placar local — sem conexão com o servidor)', 512, 470); }
    pTex.needsUpdate = true;
  }
  drawPoster([], '', null);

  // cartazes de parede
  const wp = (title, sub, c1, c2, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshStandardMaterial({ map: TX.toTex(TX.wallPoster(title, sub, c1, c2, x * 7)), roughness: 0.9 }));
    m.position.set(x, y, z); m.rotation.y = ry; root.add(m);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.38, 0.04), M(woodTex)); fr.position.set(x, y, z - (Math.cos(ry) * 0.02)); fr.rotation.y = ry; root.add(fr);
  };
  wp('MODÃO RAIZ', 'sexta tem!', '#3a1a5a', '#a02a4a', 9.96, 1.9, 1.2, -Math.PI / 2);
  wp('CERVEJA GELADA', 'sempre', '#0a4a6a', '#2aa0b0', 9.96, 1.9, 3.0, -Math.PI / 2);
  wp('SERTANEJO', 'ao vivo', '#6a3a0a', '#d08a2a', -9.96, 1.9, -1.8, Math.PI / 2);
  wp('FIADO', 'só amanhã', '#5a0a0a', '#b02a1a', -9.96, 1.9, 0.6, Math.PI / 2);

  // ---------------- jukebox ----------------
  const jb = new THREE.Group(); jb.position.set(9.45, 0, -3.2); jb.rotation.y = -Math.PI / 2;
  const jbBody = box(1.1, 1.5, 0.7, M(TX.toTex(TX.fabric('#6a1d2e')), { roughness: 0.5 }), 0, 0.75, 0, jb);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 20, 1, false, -Math.PI / 2, Math.PI), M(TX.toTex(TX.fabric('#8a2840')), { roughness: 0.5 }));
  arch.rotation.x = -Math.PI / 2; arch.position.set(0, 1.5, 0);
  arch.castShadow = true;
  const jbStripes = [];
  const colors = [0xff3333, 0xffaa33, 0x33dd55, 0x33aaff, 0xcc44cc];
  colors.forEach((c, i) => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: c })); s.position.set(0, 1.05 + i * 0.12, 0.36); jb.add(s); jbStripes.push(s); });
  const jbGlass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.01), new THREE.MeshBasicMaterial({ color: 0x14102a, transparent: true, opacity: 0.55 }));
  jbGlass.position.set(0, 1.2, 0.355); jb.add(jbGlass);
  jb.add(arch);
  const jbLight = new THREE.PointLight(0xaa66ff, 9, 5, 2); jbLight.position.set(-0.7, 1.4, 0.3); jb.add(jbLight);
  root.add(jb);
  rect(8.8, -3.9, 10, -2.5);

  // ---------------- plantas ----------------
  const leafMat = L({ color: 0x2e7d3a, side: THREE.DoubleSide });
  for (const [x, z] of [[-9.1, -3.9], [9.1, 4.8], [-6.0, 6.4]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.4, 10), L({ color: 0x7a3b22 })); pot.position.set(x, 0.2, z); pot.castShadow = true; root.add(pot);
    for (let i = 0; i < 9; i++) {
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.9), leafMat);
      lf.position.set(x + Math.cos(i) * 0.1, 0.8, z + Math.sin(i) * 0.1);
      lf.rotation.set(-0.3 - Math.random() * 0.4, i * 0.7, 0.2 * Math.sin(i));
      lf.castShadow = true; root.add(lf);
    }
    circle(x, z, 0.4);
  }

  // ---------------- porta de entrada ----------------
  box(1.3, 2.3, 0.1, M(woodFront), 3.2, 1.15, 6.93, root, false);
  box(1.5, 0.12, 0.14, M(woodTex), 3.2, 2.36, 6.93, root, false);
  box(0.12, 2.4, 0.14, M(woodTex), 2.5, 1.2, 6.93, root, false); box(0.12, 2.4, 0.14, M(woodTex), 3.9, 1.2, 6.93, root, false);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), brass); knob.position.set(3.7, 1.1, 6.84); root.add(knob);

  // ---------------- canto escondido (o HOMEM) ----------------
  const crateMat = M(TX.toTex(TX.woodDark([28, 44, 28], 31)), { roughness: 0.9 });
    const addCrate = (x, y, z, ry) => {
    const c = box(0.5, 0.45, 0.45, crateMat, x, y + 0.225, z); c.rotation.y = ry;
    for (const dy of [0.12, 0.33]) box(0.52, 0.04, 0.47, crateMat, x, y + dy, z).rotation.y = ry;
    // garrafas na caixa
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.18, 6), L({ color: palette[(k + Math.floor(x * 3)) % palette.length] })); b.position.set(x - 0.15 + k * 0.1, y + 0.5, z + (k % 2) * 0.1 - 0.05); root.add(b); }
  };
  for (let i = 0; i < 6; i++) { addCrate(-9.5 + i * 0.52, 0, 3.15, (i % 3) * 0.04); if (i % 2 === 0) addCrate(-9.4 + i * 0.52, 0.45, 3.15, 0.1); }
  for (let i = 0; i < 4; i++) { addCrate(-6.95, 0, 5.1 + i * 0.52, 0.05 * i); if (i % 2) addCrate(-6.95, 0.45, 5.1 + i * 0.52, 0.2); }
  rect(-10, 2.9, -7.2, 3.4);
  rect(-7.2, 4.85, -6.65, 6.9);
  const redLight = new THREE.PointLight(0xff2a1a, 11, 7, 2); redLight.position.set(-8.3, 2.3, 5.3); root.add(redLight);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.2), M(TX.toTex(TX.fabric('#3a1230')), { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(-8.4, 0.012, 5.2); rug.receiveShadow = true; root.add(rug);
  const bulbRed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a22 })); bulbRed.position.set(-8.3, 2.5, 5.3); root.add(bulbRed);
  const redCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 5), L({ color: 0x111111 })); redCord.position.set(-8.3, 3.0, 5.3); root.add(redCord);

  // o HOMEM
  const npc = createAvatar(FT.sprites.HOMEM_LOOK, { npc: true, name: '???' });
  npc.root.position.set(BAR.npcPos.x, 0, BAR.npcPos.z);
  npc.root.rotation.y = Math.PI / 2 + 0.2;
  npc.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  root.add(npc.root);
  circle(BAR.npcPos.x, BAR.npcPos.z, 0.45);

  // fumaça do HOMEM
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.userData = { t: i * 0.6 }; root.add(s); puffs.push(s);
  }

  // ---------------- colisão ----------------
  function collide(p, r = 0.3) {
    const H = BAR.half;
    p.x = Math.max(-H.x, Math.min(H.x, p.x));
    p.z = Math.max(H.zMin, Math.min(H.zMax, p.z));
    for (const c of colliders) {
      if (c.c) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m) { const k = d < 1e-4 ? 1 : m / d; p.x = c.x + dx * k; p.z = c.z + dz * k; }
      } else {
        const nx = Math.max(c.x0, Math.min(c.x1, p.x)), nz = Math.max(c.z0, Math.min(c.z1, p.z));
        const dx = p.x - nx, dz = p.z - nz, d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-4) {
            const dl = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z]; const m = Math.min(...dl);
            if (m === dl[0]) p.x = c.x0 - r; else if (m === dl[1]) p.x = c.x1 + r; else if (m === dl[2]) p.z = c.z0 - r; else p.z = c.z1 + r;
          } else { p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r; }
        }
      }
    }
  }

  // ---------------- animação do cenário ----------------
  let flick = 1;
  function update(dt, t, playerPos) {
    const f = Math.sin(t * 2.1) > 0.995 || Math.floor(t * 11) % 53 === 0 ? 0.35 : 1;
    flick += (f - flick) * Math.min(1, dt * 30);
    neonMat.color.setScalar((0.75 + 0.25 * flick) * 2.3);
    neonLight.intensity = 14 * flick;
    redLight.intensity = 10 + Math.sin(t * 13) * Math.sin(t * 7.1) * 1.4;
    jbLight.color.setHSL((t * 0.12) % 1, 0.9, 0.55);
    jbStripes.forEach((s, i) => { s.material.color.setHSL(((t * 0.3) + i * 0.17) % 1, 0.95, 0.55); });
    npc.update(dt);
    npc.root.position.y = Math.sin(t * 1.4) * 0.005;
    puffs.forEach((s) => {
      const u = s.userData; u.t += dt;
      if (u.t > 4) u.t = 0;
      const k = u.t / 4;
      s.position.set(BAR.npcPos.x + 0.35 + Math.sin(t + u.t) * 0.12 + k * 0.4, 1.55 + k * 1.1, BAR.npcPos.z - 0.12 + Math.cos(u.t) * 0.08);
      s.scale.setScalar(0.12 + k * 0.6);
      s.material.opacity = Math.sin(k * Math.PI) * 0.22;
    });
  }

  function setShadows(on) {
    lampSpots.forEach((s, i) => { s.castShadow = on && i < 5; });
  }

  return { scene, colliders, collide, update, npc, drawPoster, lampSpots, setShadows, rootGroup: root };
}
