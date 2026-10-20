// Formas arredondadas (estilo "low-poly fofinho"): caixas com cantos chanfrados em vez de quinas duras.
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function rbox(w, h, d, r) {
  const m = Math.min(w, h, d);
  const radius = Math.max(0.006, Math.min(r == null ? m * 0.28 : r, m / 2.2, 0.075));
  const seg = m < 0.09 ? 1 : 3;
  return new RoundedBoxGeometry(w, h, d, seg, radius);
}
