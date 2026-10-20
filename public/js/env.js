// Mapa de ambiente procedural (sala de estúdio): dá reflexo pros metais (torneiras, dourado) e uma luz
// ambiente suave. Sem ele, material metálico fica preto. Uma só textura, compartilhada entre as cenas.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let cached = null;
export function getEnv(renderer) {
  if (!cached) {
    const pm = new THREE.PMREMGenerator(renderer);
    cached = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return cached;
}

// aplica o ambiente na cena e controla o quanto cada material "recebe": metal reflete forte, o resto só um toque
export function applyEnv(scene, renderer, { diffuse = 0.3, metal = 1.0 } = {}) {
  scene.environment = getEnv(renderer);
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m.isMeshStandardMaterial) m.envMapIntensity = m.metalness > 0.5 ? metal : diffuse;
  });
}
