// Cena de abertura: o personagem na frente de um guarda-roupa velho. O painel lateral escolhe as roupas.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import * as TX from './textures.js';
import { createAvatar, hatMesh } from './avatar.js';

const FT = window.FT;
const S = FT.sprites;

export function createWardrobe(quality, look) {
  const hi = quality === 'high';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0710);
  scene.fog = new THREE.FogExp2(0x0b0710, 0.06);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 40);
  scene.add(camera);

  const M = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85 }, o));
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z);

  // ---- quarto ----
  const floorTex = TX.toTex(TX.floorWood(21), { repeat: [3, 2.2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), M(floorTex, { roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = 0.5; floor.receiveShadow = true; scene.add(floor);
  const wpTex = TX.toTex(TX.wallpaper(), { repeat: [3, 1.6] });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), M(wpTex)); back.position.set(0, 1.7, -2.46); back.receiveShadow = true; scene.add(back);
  const wpL = TX.toTex(TX.wallpaper(4), { repeat: [2.4, 1.6] });
  const left = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), M(wpL)); left.rotation.y = Math.PI / 2; left.position.set(-3.6, 1.7, 1.0); left.receiveShadow = true; scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), M(wpL)); right.rotation.y = -Math.PI / 2; right.position.set(3.6, 1.7, 1.0); right.receiveShadow = true; scene.add(right);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), M(TX.toTex(TX.woodDark([20, 30, 12], 3), { repeat: [3, 3] }))); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.4, 0.5); scene.add(ceil);
  const woodTex = TX.toTex(TX.woodDark([22, 40, 18], 17));
  const woodTex2 = TX.toTex(TX.woodDark([24, 36, 13], 19));
  box(9, 0.14, 0.06, M(woodTex), 0, 0.07, -2.43); // rodapé
  box(0.06, 0.14, 7, M(woodTex), -3.57, 0.07, 1.0); box(0.06, 0.14, 7, M(woodTex), 3.57, 0.07, 1.0);

  // janela com luar
  const winG = new THREE.Group(); winG.position.set(-3.58, 1.9, 0.6); winG.rotation.y = Math.PI / 2;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ color: 0x4a6cc0 })); winG.add(sky);
  for (const [w, h, x, y] of [[1.3, 0.07, 0, 0.75], [1.3, 0.07, 0, -0.75], [0.07, 1.6, -0.6, 0], [0.07, 1.6, 0.6, 0], [0.05, 1.5, 0, 0], [1.2, 0.05, 0, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), M(woodTex2)); b.position.set(x, y, 0.03); winG.add(b);
  }
  scene.add(winG);
  const moon = new THREE.SpotLight(0x7a97ff, hi ? 90 : 60, 14, 0.7, 0.8, 1.6);
  moon.position.set(-5.2, 3.0, 0.9); moon.target.position.set(0, 1.0, 0.3);
  moon.castShadow = hi; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0005;
  scene.add(moon, moon.target);

  // ---- o guarda-roupa velho ----
  const W = 2.4, H = 2.5, D = 0.78, WZ = -2.02;
  const wood = M(woodTex, { roughness: 0.75 });
  const woodDarkM = M(TX.toTex(TX.woodDark([16, 30, 8], 23)), { roughness: 0.95 });
  const wd = new THREE.Group(); scene.add(wd);
  const wb = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; wd.add(m); return m; };
  wb(W, H, 0.05, woodDarkM, 0, H / 2 + 0.2, WZ - D / 2 + 0.025);              // fundo
  wb(0.07, H, D, wood, -W / 2 + 0.035, H / 2 + 0.2, WZ);                       // lados
  wb(0.07, H, D, wood, W / 2 - 0.035, H / 2 + 0.2, WZ);
  wb(W + 0.1, 0.1, D + 0.06, wood, 0, H + 0.25, WZ);                          // tampo
  wb(W + 0.24, 0.1, D + 0.14, wood, 0, H + 0.35, WZ + 0.02);                  // cornija
  wb(W, 0.14, D, wood, 0, 0.27, WZ);                                           // fundo da caixa
  wb(0.05, H - 0.2, D - 0.05, wood, 0, H / 2 + 0.25, WZ);                     // divisória
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 10), wood); ft.position.set(sx * (W / 2 - 0.1), 0.1, WZ + sz * (D / 2 - 0.1)); ft.castShadow = true; wd.add(ft);
  }
  // prateleiras do lado direito (calças dobradas)
  for (const y of [1.0, 1.65]) wb(W / 2 - 0.1, 0.04, D - 0.1, wood, W / 4 + 0.02, y, WZ);
  S.PANTS.forEach((p, i) => {
    const col = new THREE.Color(p.c);
    for (let k = 0; k < 3; k++) wb(0.7, 0.07, 0.45, new THREE.MeshLambertMaterial({ color: col.clone().multiplyScalar(0.8 + k * 0.12) }), W / 4 + 0.02 + ((i % 2) - 0.5) * 0.12, (i < 3 ? 1.04 : 1.69) + k * 0.075, WZ + (i % 3 - 1) * 0.0).position.x += (i % 3 - 1) * 0.0;
  });
  // sapatos no chão
  S.SHOES.forEach((s, i) => {
    const cols = { americana: '#8b5a2b', 'bico-fino': '#3a2216', 'botina-amarela': '#e6b422', 'chinelo-couro': '#9b6a3c', 'sandalia-quadrada': '#2b2b2b' };
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.34), new THREE.MeshLambertMaterial({ color: cols[s.id] })); m.position.set(0.15 + i * 0.2, 0.42, WZ + 0.08); m.castShadow = true; wd.add(m);
  });
  // cabides com as camisas de verdade (texturas das camisas do jogo)
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, W / 2 - 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.9, roughness: 0.35 }));
  rail.rotation.z = Math.PI / 2; rail.position.set(-W / 4 - 0.02, 2.3, WZ); wd.add(rail);
  const shirts = S.SHIRTS;
  shirts.forEach((sh, i) => {
    const look2 = Object.assign({}, S.DEFAULT_LOOK, { shirt: sh.id, hat: 'nenhum' });
    const spr = S.get(look2, {});
    const c = document.createElement('canvas'); c.width = 30; c.height = 22;
    c.getContext('2d').drawImage(spr, 5, 28, 30, 22, 0, 0, 30, 22); // camisa com mangas
    const tex = TX.toTex(c, { nearest: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.31), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
    const x = -W / 2 + 0.2 + (i / (shirts.length - 1)) * (W / 2 - 0.4);
    m.position.set(x, 2.1, WZ + (i % 2 ? 0.1 : -0.12));
    m.rotation.y = (i % 2 ? 1 : -1) * 0.5;
    m.castShadow = true;
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.9, roughness: 0.4 }));
    hanger.position.set(x, 2.3, m.position.z);
    wd.add(m, hanger);
  });
  // chapéus em cima do guarda-roupa
  ['palha-branco', 'cowboy-preto', 'magnata', 'bone-vermelho', 'palha-amarelo'].forEach((id, i) => {
    const h = hatMesh(id); if (!h) return;
    h.scale.setScalar(1.1); h.position.set(-0.9 + i * 0.45, H + 0.4, WZ + 0.05); h.rotation.y = i; wd.add(h);
  });
  // portas abertas
  const doorMat = M(woodTex, { roughness: 0.7 });
  const mkDoor = (hingeX, dir, ang) => {
    const g = new THREE.Group(); g.position.set(hingeX, H / 2 + 0.25, WZ + D / 2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.04, H - 0.06, 0.05), doorMat); m.position.x = dir * (W / 4 - 0.02); m.castShadow = m.receiveShadow = true; g.add(m);
    const inset = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.4, H - 0.5, 0.02), woodDarkM); inset.position.set(dir * (W / 4 - 0.02), 0, 0.03); g.add(inset);
    const hdl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 })); hdl.position.set(dir * (W / 2 - 0.12), 0, 0.05); g.add(hdl);
    g.rotation.y = ang; wd.add(g); return g;
  };
  const doorL = mkDoor(-W / 2 + 0.02, 1, -2.0);
  const doorR = mkDoor(W / 2 - 0.02, -1, 1.85);

  // ---- espelho de pé ----
  if (hi) {
    const mirror = new Reflector(new THREE.PlaneGeometry(1.0, 2.1), { clipBias: 0.003, textureWidth: 768, textureHeight: 1024, color: 0xb8b0c8 });
    mirror.position.set(-3.1, 1.15, 1.0); mirror.rotation.y = Math.PI / 2;
    scene.add(mirror);
    box(0.08, 2.3, 1.2, woodDarkM, -3.16, 1.15, 1.0);
  } else {
    box(0.08, 2.1, 1.0, M(TX.toTex(TX.woodDark([30, 20, 30], 3))), -3.1, 1.15, 1.0);
  }

  // ---- decoração ----
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), M(TX.toTex(TX.fabric('#6a2a2a')), { roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 0.5); rug.receiveShadow = true; scene.add(rug);
  box(0.9, 0.38, 0.55, M(TX.toTex(TX.woodDark([28, 40, 22], 41))), 2.5, 0.19, -0.6);
  box(0.92, 0.04, 0.57, new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.4 }), 2.5, 0.4, -0.6);
  box(0.5, 0.3, 0.35, new THREE.MeshLambertMaterial({ color: 0x7a3b22 }), 2.35, 0.55, -0.6);

  // lâmpada pendurada
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.0, 5), new THREE.MeshLambertMaterial({ color: 0x111 })); cord.position.set(0, 3.35, 0.7); scene.add(cord);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe3a0).multiplyScalar(2.4) })); bulb.position.set(0, 2.85, 0.7); scene.add(bulb);
  const bulbLight = new THREE.PointLight(0xffd59a, hi ? 9 : 7, 9, 1.7);
  bulbLight.position.set(0, 2.8, 0.7); bulbLight.castShadow = hi; bulbLight.shadow.mapSize.set(1024, 1024); bulbLight.shadow.bias = -0.0006;
  scene.add(bulbLight);
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x2a1a10, 0.32));
  const wardLight = new THREE.PointLight(0xffb870, 4, 4, 2); wardLight.position.set(0, 1.6, -1.5); scene.add(wardLight);

  // poeira no ar
  const N = 90, dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { dp[i * 3] = (Math.random() - 0.5) * 5; dp[i * 3 + 1] = Math.random() * 3; dp[i * 3 + 2] = -1.5 + Math.random() * 4; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffeacc, size: 0.025, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(dust);

  // ---- personagem ----
  const avatar = createAvatar(look, { noName: true });
  avatar.root.position.set(0, 0, 0.55);
  avatar.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(avatar.root);
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2; shadowBlob.position.set(0, 0.02, 0.55); scene.add(shadowBlob);

  let panelPx = 0, spinTarget = 0, spin = 0, dragging = false, pose = 'idle', t = 0;
  const api = {
    scene, camera, avatar,
    setLook(l) { avatar.setLook(l); avatar.root.traverse((o) => { if (o.isMesh) o.castShadow = true; }); },
    setPose(p) {
      pose = p;
      avatar.setRed(p === 'joint');
      avatar.st.drink = p === 'mug' ? 1 : 0;
      avatar.st.smoke = p === 'joint' ? 1 : 0;
      avatar.st.speed = p === 'walk' ? 0.75 : 0;
    },
    turnAround() { spinTarget += Math.PI; },
    drag(dx) { spinTarget += dx * 0.012; dragging = true; },
    dragEnd() { dragging = false; },
    resize(w, h, panelWidth, panelHeight) {
      const aspect = w / h;
      camera.aspect = aspect;
      const portrait = aspect < 0.9;
      camera.fov = portrait ? 50 : 38;
      camera.position.set(0, portrait ? 1.6 : 1.5, portrait ? 5.9 + (1 / aspect - 1) * 1.3 : 5.0);
      camera.lookAt(0, portrait ? 1.05 : 1.2, 0);
      panelPx = portrait ? 0 : panelWidth;
      if (portrait && panelHeight) camera.setViewOffset(w, h, 0, panelHeight / 2 - h * 0.05, w, h);
      else if (panelPx) camera.setViewOffset(w, h, panelPx / 2, 0, w, h); else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
    update(dt, tt) {
      t = tt;
      spin += (spinTarget - spin) * Math.min(1, dt * 8);
      avatar.root.rotation.y = spin + (dragging ? 0 : Math.sin(t * 0.5) * 0.12);
      avatar.update(dt);
      bulbLight.intensity = (hi ? 9 : 7) * (0.96 + Math.sin(t * 17) * 0.02 + (Math.sin(t * 2.3) > 0.985 ? -0.3 : 0));
      const pos = dust.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        pos.array[i * 3 + 1] += dt * 0.03; pos.array[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.02;
        if (pos.array[i * 3 + 1] > 3) pos.array[i * 3 + 1] = 0;
      }
      pos.needsUpdate = true;
      doorL.rotation.y = -2.0 + Math.sin(t * 0.7) * 0.012; doorR.rotation.y = 1.85 + Math.sin(t * 0.6 + 1) * 0.012;
    },
  };
  api.setPose('idle');
  return api;
}
