// Texturas procedurais de tecido, couro, palha, feltro e borracha (desenhadas em canvas, sem imagens externas).
// Cada função devolve { map, bump } (canvas) já prontos pra virar textura. Tudo é determinístico (semente) e fica em cache.
import * as THREE from 'three';

// Safari < 16 não tem roundRect no canvas: polyfill simples
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0), w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function hex2rgb(hx) { const n = parseInt(hx.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
export function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }
export function shade(hx, amt) { const [r, g, b] = hex2rgb(hx); const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// converte canvas em textura compartilhada (não é descartada junto com o avatar)
export function tex(c, { repeat, srgb = true, aniso = 6 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.userData = { shared: true };
  return t;
}

// ruído suave em baixa resolução, esticado (manchas grandes de tonalidade)
function blotches(g, w, h, r, count, rMin, rMax, light, dark, alpha) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const c = r() > 0.5 ? light : dark;
    gr.addColorStop(0, c.replace('A', String(alpha * (0.4 + r() * 0.6)))); gr.addColorStop(1, c.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// ---------------- COURO (grão, vincos, brilho) ----------------
// o: { grain: tamanho do grão, crease: 0..1, mottle: manchas, suede: true => camurça (sem brilho, fibra) }
export function leather(base, o = {}) {
  const key = 'leather|' + base + '|' + JSON.stringify(o);
  return memo(key, () => {
    const S = o.size || 256, r = rng(hash(key));
    const map = cv(S, S), g = map.getContext('2d');
    const bump = cv(S, S), b = bump.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
    // manchas de tonalidade (couro nunca é uniforme)
    blotches(g, S, S, r, o.mottle ?? 26, S * 0.05, S * 0.22, 'rgba(255,255,255,A)', 'rgba(0,0,0,A)', 0.16);
    if (o.suede) {
      // camurça / nubuck: fibrinhas curtas em todas as direções
      for (let i = 0; i < S * S * 0.5; i++) {
        const x = r() * S, y = r() * S, a = r() * 6.28, l = 1 + r() * 2.2;
        g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        if (i % 3 === 0) { b.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.18)'; b.lineWidth = 0.8; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke(); }
      }
    } else {
      // grão de couro: poros (pontinhos) + rede de pequenas "ilhas" (célula de Voronoi falsa)
      const cell = o.grain || 7, cols = Math.ceil(S / cell) + 2;
      const pts = [];
      for (let j = -1; j < cols; j++) for (let i = -1; i < cols; i++) pts.push([(i + 0.2 + r() * 0.6) * cell, (j + 0.2 + r() * 0.6) * cell]);
      g.lineWidth = 0.9; b.lineWidth = 1.2;
      for (let k = 0; k < pts.length; k++) {
        const [x, y] = pts[k];
        g.fillStyle = 'rgba(0,0,0,.20)'; g.beginPath(); g.arc(x, y, 0.9 + r() * 0.8, 0, 6.28); g.fill();
        b.fillStyle = 'rgba(0,0,0,.45)'; b.beginPath(); b.arc(x, y, 1.2, 0, 6.28); b.fill();
        // vinquinhos ligando poros vizinhos
        const [x2, y2] = pts[(k + 1 + Math.floor(r() * 3)) % pts.length];
        if (Math.hypot(x2 - x, y2 - y) < cell * 1.6) {
          g.strokeStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
          b.strokeStyle = 'rgba(0,0,0,.28)'; b.beginPath(); b.moveTo(x, y); b.lineTo(x2, y2); b.stroke();
        }
      }
    }
    // vincos de uso (dobras longas)
    const nCrease = Math.round((o.crease ?? 0.5) * 14);
    for (let i = 0; i < nCrease; i++) {
      const y = r() * S, amp = 2 + r() * 5, ph = r() * 6.28, len = S * (0.3 + r() * 0.7), x0 = r() * (S - len);
      for (const [ctx, dark, light, w] of [[g, 'rgba(0,0,0,.22)', 'rgba(255,255,255,.10)', 1.3], [b, 'rgba(0,0,0,.5)', 'rgba(255,255,255,.35)', 2.2]]) {
        ctx.strokeStyle = dark; ctx.lineWidth = w; ctx.beginPath();
        for (let x = 0; x <= len; x += 6) { const yy = y + Math.sin(ph + x * 0.05) * amp; x === 0 ? ctx.moveTo(x0 + x, yy) : ctx.lineTo(x0 + x, yy); }
        ctx.stroke();
        ctx.strokeStyle = light; ctx.lineWidth = w * 0.7; ctx.beginPath();
        for (let x = 0; x <= len; x += 6) { const yy = y + 1.8 + Math.sin(ph + x * 0.05) * amp; x === 0 ? ctx.moveTo(x0 + x, yy) : ctx.lineTo(x0 + x, yy); }
        ctx.stroke();
      }
    }
    return { map, bump };
  });
}

// ---------------- TECIDO TECIDO (trama) ----------------
// kind: 'cotton' (liso), 'twill' (sarja diagonal, jeans), 'jersey' (malha de camiseta), 'flannel' (flanela felpuda), 'mesh' (tela esportiva)
export function fabric(base, kind = 'cotton', o = {}) {
  const key = 'fabric|' + base + '|' + kind + '|' + JSON.stringify(o);
  return memo(key, () => {
    const S = o.size || 256, r = rng(hash(key)), t = o.thread || 3;
    const map = cv(S, S), g = map.getContext('2d');
    const bump = cv(S, S), b = bump.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
    const cells = S / t;
    if (kind === 'twill') {
      // sarja: fios diagonais; urdidura (vertical) mais escura, trama (horizontal) mais clara — jeans de verdade
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        const over = ((i + j) % 4) < 2;
        g.fillStyle = over ? `rgba(0,0,30,${0.10 + r() * 0.08})` : `rgba(255,255,255,${0.07 + r() * 0.08})`;
        g.fillRect(i * t, j * t, t, t);
        b.fillStyle = over ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.30)'; b.fillRect(i * t, j * t, t - 0.5, t - 0.5);
      }
      for (let x = 0; x < S; x += t * 4) { g.fillStyle = 'rgba(0,0,40,.07)'; g.fillRect(x, 0, 1, S); }
    } else if (kind === 'jersey') {
      // malha: carreirinhas de "V" minúsculos
      for (let j = 0; j < S; j += t) for (let i = 0; i < S; i += t) {
        g.strokeStyle = 'rgba(0,0,0,.10)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(i, j); g.lineTo(i + t / 2, j + t); g.lineTo(i + t, j); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(i, j + 1); g.lineTo(i + t / 2, j + t + 1); g.lineTo(i + t, j + 1); g.stroke();
        b.strokeStyle = 'rgba(255,255,255,.35)'; b.lineWidth = 1; b.beginPath(); b.moveTo(i, j); b.lineTo(i + t / 2, j + t); b.lineTo(i + t, j); b.stroke();
      }
    } else if (kind === 'mesh') {
      // tela esportiva: furinhos em losango
      for (let j = 0; j < S; j += t * 2) for (let i = 0; i < S; i += t * 2) {
        const ox = (j / (t * 2)) % 2 ? t : 0;
        g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.ellipse(i + ox + t / 2, j + t / 2, t * 0.45, t * 0.45, 0, 0, 6.28); g.fill();
        b.fillStyle = 'rgba(0,0,0,.55)'; b.beginPath(); b.ellipse(i + ox + t / 2, j + t / 2, t * 0.5, t * 0.5, 0, 0, 6.28); b.fill();
      }
    } else {
      // algodão / flanela: fios cruzados (tafetá)
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        const over = (i + j) % 2 === 0;
        g.fillStyle = over ? `rgba(255,255,255,${0.05 + r() * 0.05})` : `rgba(0,0,0,${0.06 + r() * 0.05})`;
        g.fillRect(i * t, j * t, t, t);
        b.fillStyle = over ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.24)'; b.fillRect(i * t, j * t, t - 0.4, t - 0.4);
      }
      if (kind === 'flannel') { // felpa: fibrinhas soltas
        for (let i = 0; i < S * S * 0.08; i++) { const x = r() * S, y = r() * S, a = r() * 6.28; g.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.10)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 2.5, y + Math.sin(a) * 2.5); g.stroke(); }
      }
    }
    if (o.heather) blotches(g, S, S, r, 40, S * 0.04, S * 0.16, 'rgba(255,255,255,A)', 'rgba(0,0,0,A)', 0.10);
    // fios soltos (fuzz)
    for (let i = 0; i < S * 0.5; i++) { const x = r() * S, y = r() * S, a = r() * 6.28; g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); g.stroke(); }
    return { map, bump };
  });
}

// ---------------- FELTRO (chapéu cowboy) ----------------
export function felt(base, o = {}) {
  return memo('felt|' + base + JSON.stringify(o), () => {
    const S = 256, r = rng(hash('felt' + base)), map = cv(S, S), g = map.getContext('2d'), bump = cv(S, S), b = bump.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S); b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
    blotches(g, S, S, r, 30, S * 0.06, S * 0.25, 'rgba(255,255,255,A)', 'rgba(0,0,0,A)', 0.10);
    for (let i = 0; i < S * S * 0.9; i++) { // fibras curtas entrelaçadas
      const x = r() * S, y = r() * S, a = r() * 6.28, l = 1.5 + r() * 3;
      g.strokeStyle = r() > 0.35 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.035)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      if (i % 4 === 0) { b.strokeStyle = r() > 0.5 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.16)'; b.lineWidth = 0.8; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke(); }
    }
    return { map, bump };
  });
}

// ---------------- PALHA TRANÇADA ----------------
export function strawWeave(base, dark, o = {}) {
  return memo('straw|' + base + dark + JSON.stringify(o), () => {
    const S = 256, r = rng(hash('straw' + base)), map = cv(S, S), g = map.getContext('2d'), bump = cv(S, S), b = bump.getContext('2d');
    g.fillStyle = dark; g.fillRect(0, 0, S, S); b.fillStyle = '#404040'; b.fillRect(0, 0, S, S);
    const wv = o.w || 12, hv = o.h || 5;
    for (let j = 0; j * hv < S; j++) {
      const off = (j % 2) * (wv / 2);
      for (let i = -1; i * wv < S + wv; i++) {
        const x = i * wv + off, y = j * hv;
        const lt = 0.85 + r() * 0.3;
        g.fillStyle = mix(base, '#ffffff', 0.05 + r() * 0.12 * lt);
        g.beginPath(); g.roundRect(x + 0.5, y + 0.5, wv - 1.2, hv - 1, 1.6); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 0.5, y + hv - 1.4, wv - 1.2, 0.8);
        g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x + 2, y + hv / 2); g.lineTo(x + wv - 2, y + hv / 2); g.stroke();
        b.fillStyle = '#d0d0d0'; b.beginPath(); b.roundRect(x + 0.5, y + 0.5, wv - 1.2, hv - 1, 1.6); b.fill();
      }
    }
    return { map, bump };
  });
}

// ---------------- BORRACHA (solado com frisos) ----------------
export function rubber(base, o = {}) {
  return memo('rubber|' + base + JSON.stringify(o), () => {
    const S = 128, r = rng(hash('rub' + base)), map = cv(S, S), g = map.getContext('2d'), bump = cv(S, S), b = bump.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S); b.fillStyle = '#808080'; b.fillRect(0, 0, S, S);
    for (let i = 0; i < S * S * 0.25; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(r() * S, r() * S, 1.2, 1.2); }
    if (o.tread) for (let y = 8; y < S; y += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, S, 5); b.fillStyle = 'rgba(0,0,0,.7)'; b.fillRect(0, y, S, 5); }
    return { map, bump };
  });
}

// ---------------- helpers de desenho reaproveitáveis ----------------
// costura tracejada ao longo de um caminho (pontos [x,y]); cor do fio e espaçamento configuráveis
export function stitch(g, pts, color = 'rgba(240,210,120,.9)', dash = 5, gap = 3.5, w = 1.6) {
  g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.setLineDash([dash, gap]);
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
}

// materiais compartilhados entre avatares (mesma chave = mesma instância; não são descartados com o avatar)
const MATS = new Map();
export function sharedMat(key, make) {
  let m = MATS.get(key);
  if (!m) { m = make(); m.userData = Object.assign(m.userData || {}, { shared: true }); MATS.set(key, m); }
  return m;
}
export function memoize(key, fn) { return memo(key, fn); }
