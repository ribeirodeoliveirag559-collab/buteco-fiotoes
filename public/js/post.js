// Pós-processamento: brilho do neon, rastro psicodélico e o efeito de bebedeira/baseado.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const DrunkShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDrunk: { value: 0 },
    uPsy: { value: 0 },
    uLid: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uDrunk, uPsy, uLid, uAspect;
    varying vec2 vUv;

    vec3 hueShift(vec3 c, float h) {
      const vec3 k = vec3(0.57735);
      float ca = cos(h), sa = sin(h);
      return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
    }

    void main() {
      vec2 uv = vUv;
      float d = uDrunk, p = uPsy;

      // ondulação (a sala "respira")
      float w = d * 0.010 + p * 0.012;
      uv += vec2(sin(uv.y * 9.0 + uTime * 1.7), cos(uv.x * 7.0 + uTime * 1.3)) * w;

      // espiral psicodélica
      vec2 c = uv - 0.5;
      float r = length(c * vec2(uAspect, 1.0));
      float a = p * 0.5 * sin(uTime * 0.6) * (0.7 - r);
      c = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
      uv = c + 0.5;

      // desfoque (8 amostras em disco) + visão dupla
      float bl = d * 0.007 + p * 0.0025;
      vec2 off = vec2(sin(uTime * 0.9), cos(uTime * 0.7)) * 0.022 * d;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float ang = float(i) * 0.785398 + uTime * 0.3;
        vec2 o = vec2(cos(ang), sin(ang) * uAspect) * bl;
        col += texture2D(tDiffuse, uv + o).rgb;
      }
      col /= 8.0;
      vec3 ghost = texture2D(tDiffuse, uv + off).rgb;
      col = mix(col, ghost, 0.38 * d);

      // aberração cromática
      float ca2 = (d * 0.004 + p * 0.007);
      col.r = mix(col.r, texture2D(tDiffuse, uv + vec2(ca2, 0.0)).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, uv - vec2(ca2, 0.0)).b, 0.7);

      // cores do baseado
      if (p > 0.001) {
        col = hueShift(col, uTime * 0.8 * p + r * 6.0 * p);
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, 1.0 + p * 1.6);
        col += p * 0.10 * vec3(0.5 + 0.5 * sin(uTime + uv.x * 6.0), 0.5 + 0.5 * sin(uTime * 1.3 + uv.y * 5.0), 0.5 + 0.5 * sin(uTime * 0.7));
      }

      // vinheta + pálpebras pesadas
      float vig = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.0, 1.0)));
      col *= mix(1.0, vig, min(1.0, d * 0.9));
      float lid = smoothstep(uLid, uLid - 0.12, abs(vUv.y - 0.5) * 2.0);
      if (uLid > 0.001) col *= 1.0 - smoothstep(1.0 - uLid, 1.0 - uLid + 0.1, abs(vUv.y - 0.5) * 2.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPost(renderer, scene, camera, quality) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  let bloom = null;
  if (quality === 'high') {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.4, 0.4, 1.1);
    composer.addPass(bloom);
  }
  const after = new AfterimagePass(0.85);
  after.enabled = false;
  composer.addPass(after);
  const drunk = new ShaderPass(DrunkShader);
  composer.addPass(drunk);
  composer.addPass(new OutputPass());

  return {
    composer, renderPass, bloom, after, drunk,
    setScene(s, c) { renderPass.scene = s; renderPass.camera = c; },
    setSize(w, h, dpr) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); composer.setPixelRatio(dpr); composer.setSize(w, h); drunk.uniforms.uAspect.value = w / h; },
    setEffects(t, drunkAmt, psy, lid) {
      const u = drunk.uniforms;
      u.uTime.value = t; u.uDrunk.value = drunkAmt; u.uPsy.value = psy; u.uLid.value = lid;
      after.enabled = psy > 0.04;
      after.uniforms['damp'].value = 0.55 + 0.35 * psy;
    },
    render(dt) { composer.render(dt); },
  };
}
