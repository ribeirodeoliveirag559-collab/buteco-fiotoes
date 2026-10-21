// Geometria do crânio oval compartilhada pela cabeça (head3d.js) e pelo cabelo (hair3d.js). Frente = +z.
import * as THREE from 'three';

export const RX = 0.172, RY = 0.222, RZ = 0.192;
export const PI = Math.PI, TAU = PI * 2;
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ponto da superfície do crânio na direção (nx,ny,nz): oval, queixo mais estreito, nuca um pouco cheia
export function headPoint(nx, ny, nz, grow = 0, out = new THREE.Vector3()) {
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const k = ny < 0 ? 1 - 0.2 * Math.pow(-ny, 1.7) : 1 - 0.04 * ny * ny;
  const kz = (nz < 0 ? 1.03 : 1) * (ny < 0 ? 1 - 0.1 * Math.pow(-ny, 1.7) : 1);
  return out.set(nx * (RX * k + grow), ny * (RY + grow), nz * (RZ * kz + grow));
}
export const dirOf = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
export const surf = (az, el, grow = 0) => { const d = dirOf(az, el); return headPoint(d[0], d[1], d[2], grow); };
export function normalAt(az, el) {
  const e = 0.01, p = surf(az, el), a = surf(az + e, el).sub(p), b = surf(az, el + e).sub(p);
  return a.cross(b).normalize();
}
export function fixSeam(g, nu, nv) { // normais iguais nas duas pontas da costura
  const n = g.attributes.normal, w = nu + 1;
  for (let j = 0; j <= nv; j++) {
    const a = j * w, b = j * w + nu;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}
// malha em grade (i = coluna, j = linha) a partir de fn(i,j) -> [x,y,z,u,v]
export function grid(nu, nv, fn, closeU) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i, j); pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if (closeU) fixSeam(g, nu, nv);
  return g;
}
