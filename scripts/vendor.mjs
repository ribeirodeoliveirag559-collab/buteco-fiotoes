// Copia o Three.js do node_modules para public/vendor (o site é estático, sem build).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const out = 'public/vendor/three';
rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/addons', { recursive: true });
cpSync('node_modules/three/build/three.module.js', out + '/three.module.js');
for (const d of ['postprocessing', 'shaders', 'math', 'utils', 'objects', 'geometries', 'environments']) {
  cpSync('node_modules/three/examples/jsm/' + d, out + '/addons/' + d, { recursive: true });
}
console.log('three vendorizado em', out);
// Supabase Realtime (cliente UMD): versões antigas não conectam com as chaves novas (sb_publishable_...)
cpSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', 'public/vendor/supabase.js');
console.log('supabase vendorizado');
