// Copia o Three.js do node_modules para public/vendor (o site é estático, sem build).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const out = 'public/vendor/three';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/addons', { recursive: true });
cpSync('node_modules/three/build/three.module.js', out + '/three.module.js');
for (const d of ['postprocessing', 'shaders', 'math', 'utils', 'objects', 'geometries']) {
  cpSync('node_modules/three/examples/jsm/' + d, out + '/addons/' + d, { recursive: true });
}
console.log('three vendorizado em', out);
