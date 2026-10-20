// Junta todas as peças de um grupo que usam o MESMO material numa malha só (menos "draw calls" = mais FPS no celular).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), keep = [];
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    if (Array.isArray(m.material)) { keep.push(m); continue; }
    m.updateWorldMatrix(true, false);
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    let g = m.geometry.clone();
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(rel);
    for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const k = m.material.uuid;
    if (!buckets.has(k)) buckets.set(k, { mat: m.material, geos: [] });
    buckets.get(k).geos.push(g);
    m.geometry.dispose();
  }
  // remove as peças originais e põe as fundidas
  for (const m of meshes) if (!keep.includes(m) && m.parent) m.parent.remove(m);
  for (const { mat, geos } of buckets.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) { geos.forEach((g) => { const o = new THREE.Mesh(g, mat); o.castShadow = true; group.add(o); }); continue; }
    const o = new THREE.Mesh(merged, mat); o.castShadow = true; group.add(o);
  }
  return group;
}
