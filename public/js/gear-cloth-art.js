// Arte das roupas em alta resolução (canvas): estampas desenhadas como vetor (não pixel), tecidos com trama,
// dobras e costuras. Cada camisa e cada calça tem desenho e acabamento próprios.
import { fabric, cv, rng, hash, stitch, shade, mix, hex2rgb } from './gear-tex.js';

const TAU = Math.PI * 2;
export const TORSO_A = 0.262;           // meia-largura usada pra projetar o desenho plano no cilindro do tronco
const cache = new Map();
const memo = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// ---------- utilidades ----------
// sobrepõe a trama do tecido (cinza médio) com 'overlay': mantém a cor do desenho e acrescenta fios
function weave(g, W, H, kind, o = {}) {
  const f = fabric('#808080', kind, { thread: o.thread || 3, size: 256 });
  const pat = g.createPattern(f.map, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(o.scale || 0.6));
  g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = pat; g.globalAlpha = o.alpha ?? 0.95; g.fillRect(0, 0, W, H); g.restore();
}
// dobras suaves (faixas diagonais claras/escuras)
function folds(g, W, H, seed, n = 14, strength = 0.12, vertical = false) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, len = (0.25 + r() * 0.55) * H, wid = 14 + r() * 46, ang = (vertical ? 1.5708 : 1.2 + r() * 0.5) + (r() - 0.5) * 0.5;
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, -wid, 0, wid);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, `rgba(255,255,255,${strength * 0.7})`); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(0.65, `rgba(0,0,0,${strength})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-len / 2, -wid, len, wid * 2); g.restore();
  }
}
// sombra mais forte perto da barra e das axilas
function vignetteV(g, W, H, bottom = 0.22, top = 0.12) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, `rgba(0,0,0,${top})`); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${bottom})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function noisy(g, W, H, seed, n, a = 0.05) { const r = rng(seed); for (let i = 0; i < n; i++) { g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.3})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); } }

// projeta o desenho plano da frente (1000 px/m, origem no centro) para o cilindro do tronco (u = 0,5 + t/2π)
function projectFront(dst, plane, planeCenterX, a = TORSO_A) {
  const g = dst.getContext('2d'), W = dst.width, H = dst.height;
  for (let x = 0; x < W; x++) {
    const t = (x / W - 0.5) * TAU; if (Math.abs(t) >= Math.PI / 2 - 0.02) continue;
    const m = a * Math.sin(t), sx = planeCenterX + m * 1000;
    g.drawImage(plane, Math.max(0, sx), 0, 1, plane.height, x, 0, 1, H);
  }
}

// ---------- desenhos de estampa (vetor) ----------
function leafPath(g, cx, cy, s) {
  g.beginPath(); g.moveTo(cx, cy - s * 0.95);
  const pts = [[0.2, -0.62], [0.42, -0.76], [0.36, -0.42], [0.78, -0.62], [0.56, -0.2], [0.98, -0.26], [0.66, 0.06], [0.88, 0.2], [0.42, 0.26], [0.28, 0.58], [0.1, 0.3], [0, 0.62]];
  pts.forEach(([x, y]) => g.lineTo(cx + x * s, cy + y * s));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0] * s, cy + pts[i][1] * s);
  g.closePath();
}
function drawLeaf(g, cx, cy, s) {
  leafPath(g, cx, cy, s);
  const gr = g.createLinearGradient(cx - s, cy - s, cx + s, cy + s); gr.addColorStop(0, '#79e05a'); gr.addColorStop(0.5, '#2fae3a'); gr.addColorStop(1, '#1b6d2a');
  g.fillStyle = gr; g.fill(); g.lineWidth = s * 0.05; g.strokeStyle = '#0f4a1c'; g.stroke();
  g.strokeStyle = 'rgba(210,255,190,.7)'; g.lineWidth = s * 0.025;   // nervuras
  for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx, cy + s * 0.55); g.lineTo(cx + k * s * 0.72, cy - s * 0.12 - Math.abs(k) * s * 0.0); g.stroke(); }
  g.beginPath(); g.moveTo(cx, cy + s * 0.7); g.lineTo(cx, cy - s * 0.85); g.stroke();
  g.strokeStyle = '#1f7a2a'; g.lineWidth = s * 0.09; g.beginPath(); g.moveTo(cx, cy + s * 0.58); g.lineTo(cx, cy + s * 1.0); g.stroke();
}
// estampa craquelada (serigrafia desgastada)
function crack(g, W, H, seed, amt = 0.35) {
  const r = rng(seed); g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900 * amt; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.45})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 1.2); }
  for (let i = 0; i < 40 * amt; i++) { g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8 + r(); g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 24; g.lineTo(x, y); } g.stroke(); }
  g.restore();
}

// ---------- CAMISAS ----------
// cada uma devolve { front(plane 520x640), back?: fn, sleeve: cor/padrão, fabric: tipo, ... }
const SHIRTS = {
  cowboy: { fabric: 'cotton', thread: 3, base: '#8e2a2f', long: true, tucked: true, collar: 'western', cuff: true, pockets: 'flap', snaps: '#f4efe0', trim: '#f1e3c0' },
  branca: { fabric: 'cotton', thread: 2, base: '#f2f2ef', long: true, tucked: true, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#e2e2de', trim: '#d6d6d0', stripe: true },
  maconha: { fabric: 'jersey', thread: 3, base: '#16161a', long: false, tucked: false, collar: 'crew', cuff: false, heather: true },
  aura: { fabric: 'jersey', thread: 3, base: '#15151c', long: false, tucked: false, collar: 'crew', cuff: false, heather: true },
  babydow: { fabric: 'jersey', thread: 3, base: '#f6bcd6', long: false, tucked: false, collar: 'crew', cuff: false, short: true },
  bolsonaro: { fabric: 'mesh', thread: 3, base: '#1f9d46', long: false, tucked: false, collar: 'vneck', cuff: true, trim: '#ffd91a' },
  'xadrez-vermelho': { fabric: 'flannel', thread: 3, base: '#c0392b', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#f1f1ec', plaid: { kind: 'buffalo', c2: '#161214', cell: 120 } },
  'xadrez-azul': { fabric: 'flannel', thread: 3, base: '#2f6fd0', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#f1f1ec', plaid: { kind: 'window', c2: '#f4f6fb', cell: 96 } },
  'xadrez-verde': { fabric: 'flannel', thread: 3, base: '#2e8b57', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#f1f1ec', plaid: { kind: 'tartan', c2: '#12281c', c3: '#e9d36b', cell: 110 } },
  'xadrez-amarelo': { fabric: 'cotton', thread: 2, base: '#d8aa1c', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#fff', plaid: { kind: 'gingham', c2: '#fff7d6', cell: 52 } },
  'xadrez-roxo': { fabric: 'flannel', thread: 3, base: '#7d3fa8', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#f1f1ec', plaid: { kind: 'madras', c2: '#e6c3ff', c3: '#2b1240', cell: 100 } },
  'xadrez-laranja': { fabric: 'flannel', thread: 3, base: '#e07a1f', long: true, tucked: false, collar: 'oxford', cuff: true, pockets: 'patch', snaps: '#f1f1ec', plaid: { kind: 'overcheck', c2: '#fff0d0', c3: '#7a3206', cell: 140 } },
};
export const SHIRT_IDS = Object.keys(SHIRTS);
export const shirtSpec = (id) => SHIRTS[id];

// padrões xadrez (desenhados num canvas "tecido" cell x cell e repetidos)
function plaidFill(g, W, H, base, p, seed) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const C = p.cell, c2 = p.c2, c3 = p.c3;
  g.save();
  if (p.kind === 'buffalo') {            // búfalo: quadrados escuros alternados
    g.fillStyle = c2; for (let y = 0; y * C < H + C; y++) for (let x = 0; x * C < W + C; x++) if ((x + y) % 2 === 0) g.fillRect(x * C, y * C, C, C);
    g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < W; x += C) g.fillRect(x, 0, 3, H);
  } else if (p.kind === 'window') {      // janela: linhas finas claras + faixas escuras
    g.fillStyle = shade(base, -45); for (let x = 0; x < W; x += C) g.fillRect(x - C * 0.12, 0, C * 0.24, H); for (let y = 0; y < H; y += C) g.fillRect(0, y - C * 0.12, W, C * 0.24);
    g.fillStyle = c2; for (let x = 0; x < W; x += C) g.fillRect(x + C * 0.5 - 1.5, 0, 3, H); for (let y = 0; y < H; y += C) g.fillRect(0, y + C * 0.5 - 1.5, W, 3);
  } else if (p.kind === 'tartan') {      // tartan: faixas largas de escuro e fio amarelo
    g.globalAlpha = 0.85; g.fillStyle = c2; for (let x = 0; x < W; x += C) g.fillRect(x, 0, C * 0.32, H); for (let y = 0; y < H; y += C) g.fillRect(0, y, W, C * 0.32);
    g.globalAlpha = 1; g.fillStyle = c3; for (let x = 0; x < W; x += C) { g.fillRect(x + C * 0.5, 0, 3, H); g.fillRect(x + C * 0.7, 0, 1.6, H); } for (let y = 0; y < H; y += C) { g.fillRect(0, y + C * 0.5, W, 3); g.fillRect(0, y + C * 0.7, W, 1.6); }
    g.fillStyle = 'rgba(0,0,0,.28)'; for (let x = 0; x < W; x += C) for (let y = 0; y < H; y += C) g.fillRect(x, y, C * 0.32, C * 0.32);
  } else if (p.kind === 'gingham') {     // guingão: dois tons, cruzamento mais escuro
    g.fillStyle = c2; for (let x = 0; x * C < W + C; x++) if (x % 2 === 0) g.fillRect(x * C, 0, C, H);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = mix(c2, base, 0.5); for (let y = 0; y * C < H + C; y++) if (y % 2 === 0) g.fillRect(0, y * C, W, C);
  } else if (p.kind === 'madras') {      // madras: irregular, faixas de larguras variadas
    const r = rng(seed); const cols = [c2, c3, shade(base, 40)]; g.globalAlpha = 0.8;
    for (let x = 0; x < W; x += 28 + r() * 70) { g.fillStyle = cols[Math.floor(r() * 3)]; g.fillRect(x, 0, 6 + r() * 26, H); }
    for (let y = 0; y < H; y += 28 + r() * 70) { g.fillStyle = cols[Math.floor(r() * 3)]; g.fillRect(0, y, W, 6 + r() * 26); }
  } else if (p.kind === 'overcheck') {   // xadrez grande com linha fina por cima
    g.fillStyle = c3; g.globalAlpha = 0.55; for (let x = 0; x < W; x += C) g.fillRect(x, 0, C * 0.28, H); for (let y = 0; y < H; y += C) g.fillRect(0, y, W, C * 0.28);
    g.globalAlpha = 1; g.fillStyle = c2; for (let x = 0; x < W; x += C) g.fillRect(x + C * 0.62, 0, 2.5, H); for (let y = 0; y < H; y += C) g.fillRect(0, y + C * 0.62, W, 2.5);
  }
  g.restore();
}

// ---- tronco: devolve canvas circular (u = 0,5 frente) ----
export function shirtTorsoTexture(id) {
  return memo('torso|' + id, () => {
    const S = SHIRTS[id], W = 1024, H = 640, ring = cv(W, H), g = ring.getContext('2d');
    const seed = hash(id);
    // 1) base (cor ou xadrez) na circunferência toda
    if (S.plaid) plaidFill(g, W, H, S.base, S.plaid, seed); else { g.fillStyle = S.base; g.fillRect(0, 0, W, H); }
    if (S.stripe) { g.fillStyle = 'rgba(40,60,110,.10)'; for (let x = 0; x < W; x += 12) g.fillRect(x, 0, 1.6, H); }  // risca de giz bem fina
    // 2) desenho da frente num plano (1000 px/m): 520 x 640, centro em x = 260
    const plane = cv(520, 640), p = plane.getContext('2d');
    // copia a base do centro do anel pro plano (mantém xadrez contínuo) e desenha por cima
    for (let x = 0; x < 520; x++) { const m = (x - 260) / 1000, t = Math.asin(Math.max(-1, Math.min(1, m / TORSO_A))), sx = (0.5 + t / TAU) * W; p.drawImage(ring, sx, 0, 1, H, x, 0, 1, 640); }
    FRONT[id] && FRONT[id](p, 520, 640, S);
    projectFront(ring, plane, 260);
    // 3) acabamento: trama, dobras, costuras laterais, barra
    weave(g, W, H, S.fabric, { thread: S.thread, scale: S.fabric === 'jersey' ? 0.5 : 0.62 });
    if (S.heather) { const r = rng(seed); for (let i = 0; i < 60; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); } }
    folds(g, W, H, seed, 18, 0.11);
    vignetteV(g, W, H, 0.26, 0.10);
    // costuras laterais (u = 0,25 e 0,75) e da barra
    for (const u of [0.25, 0.75]) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(u * W - 1.5, 0, 3, H); stitch(g, [[u * W + 4, 0], [u * W + 4, H]], 'rgba(255,255,255,.22)', 6, 4, 1.2); }
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, H - 14, W, 14); stitch(g, [[0, H - 22], [W, H - 22]], 'rgba(255,255,255,.28)', 8, 5, 1.4);
    noisy(g, W, H, seed, 2600, 0.04);
    return ring;
  });
}

// ---- desenhos da FRENTE de cada camisa (plano em px: origem x=260 no centro, y=0 em cima = pescoço) ----
function placket(p, x, y0, y1, w, col, edge) { p.fillStyle = col; p.fillRect(x - w / 2, y0, w, y1 - y0); p.fillStyle = edge; p.fillRect(x - w / 2, y0, 2, y1 - y0); p.fillRect(x + w / 2 - 2, y0, 2, y1 - y0); }
function pocketFlap(p, cx, cy, w, h, base, edge, snap, curve) {
  p.fillStyle = 'rgba(0,0,0,.14)'; p.fillRect(cx - w / 2 + 3, cy - h / 2 + 4, w, h);
  p.fillStyle = base; p.beginPath(); p.roundRect(cx - w / 2, cy - h / 2, w, h, 6); p.fill();
  p.strokeStyle = edge; p.lineWidth = 3; p.beginPath(); p.roundRect(cx - w / 2, cy - h / 2, w, h, 6); p.stroke();
  stitch(p, [[cx - w / 2 + 8, cy - h / 2 + 8], [cx + w / 2 - 8, cy - h / 2 + 8], [cx + w / 2 - 8, cy + h / 2 - 8], [cx - w / 2 + 8, cy + h / 2 - 8], [cx - w / 2 + 8, cy - h / 2 + 8]], 'rgba(255,255,255,.35)', 6, 4, 1.4);
  if (snap) { p.fillStyle = snap; p.beginPath(); p.arc(cx, cy - h / 2 + 18, 7, 0, 6.28); p.fill(); p.fillStyle = 'rgba(255,255,255,.8)'; p.beginPath(); p.arc(cx - 2, cy - h / 2 + 16, 2.5, 0, 6.28); p.fill(); }
}
const FRONT = {
  cowboy(p, W, H, S) {
    const cx = W / 2;
    // pala western (yoke) em V com vivo creme
    p.fillStyle = shade(S.base, 8); p.beginPath(); p.moveTo(cx - 255, 0); p.lineTo(cx + 255, 0); p.lineTo(cx + 255, 70); p.lineTo(cx, 168); p.lineTo(cx - 255, 70); p.closePath(); p.fill();
    p.strokeStyle = S.trim; p.lineWidth = 6; p.lineJoin = 'round'; p.beginPath(); p.moveTo(cx - 255, 70); p.lineTo(cx, 168); p.lineTo(cx + 255, 70); p.stroke();
    stitch(p, [[cx - 255, 82], [cx, 180], [cx + 255, 82]], 'rgba(255,255,255,.4)', 7, 4, 1.6);
    // casa de botões (pestana) e botões de pérola
    placket(p, cx, 150, H, 46, shade(S.base, -14), 'rgba(0,0,0,.25)');
    for (let y = 175; y < H - 20; y += 62) { p.fillStyle = S.snaps; p.beginPath(); p.arc(cx, y, 9, 0, 6.28); p.fill(); p.fillStyle = 'rgba(255,255,255,.9)'; p.beginPath(); p.arc(cx - 2.5, y - 3, 3.5, 0, 6.28); p.fill(); p.strokeStyle = 'rgba(0,0,0,.4)'; p.lineWidth = 1.5; p.beginPath(); p.arc(cx, y, 9, 0, 6.28); p.stroke(); }
    // bolsos com aba e botão de pressão
    for (const sx of [-1, 1]) {
      pocketFlap(p, cx + sx * 125, 250, 96, 100, shade(S.base, 6), S.trim, S.snaps);
      p.fillStyle = S.trim; p.beginPath(); p.moveTo(cx + sx * 125 - 48, 215); p.lineTo(cx + sx * 125, 238); p.lineTo(cx + sx * 125 + 48, 215); p.lineTo(cx + sx * 125 + 48, 224); p.lineTo(cx + sx * 125, 247); p.lineTo(cx + sx * 125 - 48, 224); p.closePath(); p.globalAlpha = 0.8; p.fill(); p.globalAlpha = 1;
    }
    // bordado de arabesco creme no peito
    p.strokeStyle = S.trim; p.lineWidth = 2.6; p.globalAlpha = 0.75;
    for (const sx of [-1, 1]) { p.beginPath(); p.moveTo(cx + sx * 40, 190); p.bezierCurveTo(cx + sx * 100, 150, cx + sx * 190, 175, cx + sx * 200, 120); p.stroke(); p.beginPath(); p.arc(cx + sx * 200, 110, 8, 0, 6.28); p.stroke(); }
    p.globalAlpha = 1;
  },
  branca(p, W, H, S) {
    const cx = W / 2; placket(p, cx, 0, H, 44, 'rgba(0,0,0,.05)', 'rgba(0,0,0,.14)');
    for (let y = 120; y < H - 20; y += 72) { p.fillStyle = '#dedcd4'; p.beginPath(); p.arc(cx, y, 8, 0, 6.28); p.fill(); p.fillStyle = 'rgba(0,0,0,.28)'; for (const [dx, dy] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { p.beginPath(); p.arc(cx + dx, y + dy, 1.2, 0, 6.28); p.fill(); } p.strokeStyle = 'rgba(0,0,0,.25)'; p.lineWidth = 1.2; p.beginPath(); p.arc(cx, y, 8, 0, 6.28); p.stroke(); }
    // bolso de peito remendado com monograma bordado
    p.fillStyle = 'rgba(0,0,0,.08)'; p.fillRect(cx + 70 + 3, 205 + 3, 100, 116);
    p.fillStyle = '#f6f6f3'; p.beginPath(); p.moveTo(cx + 70, 205); p.lineTo(cx + 170, 205); p.lineTo(cx + 170, 300); p.lineTo(cx + 120, 322); p.lineTo(cx + 70, 300); p.closePath(); p.fill();
    p.strokeStyle = 'rgba(0,0,0,.2)'; p.lineWidth = 2; p.stroke(); stitch(p, [[cx + 78, 214], [cx + 162, 214], [cx + 162, 296], [cx + 120, 314], [cx + 78, 296], [cx + 78, 214]], 'rgba(0,0,0,.22)', 5, 4, 1.2);
    p.fillStyle = '#2c3c63'; p.font = '700 26px Georgia, serif'; p.textAlign = 'center'; p.fillText('FT', cx + 120, 265);
  },
  maconha(p, W, H, S) {
    const L = cv(W, H), l = L.getContext('2d');
    drawLeaf(l, W / 2, 250, 120);
    l.fillStyle = '#d8ffd0'; l.font = '800 22px Arial'; l.textAlign = 'center'; l.fillText('· 4 : 2 0 ·', W / 2, 410);
    crack(l, W, H, 5, 0.5);
    p.drawImage(L, 0, 0);
  },
  aura(p, W, H, S) {
    const L = cv(W, H), l = L.getContext('2d'), cx = W / 2; l.textAlign = 'center'; l.textBaseline = 'middle';
    l.save(); l.shadowColor = '#8a4dff'; l.shadowBlur = 38; l.font = '900 128px Impact, "Arial Black", sans-serif'; l.fillStyle = '#c9a8ff'; for (let i = 0; i < 3; i++) l.fillText('AURA', cx, 250); l.restore();
    l.lineWidth = 6; l.strokeStyle = '#5b2fd6'; l.font = '900 128px Impact, "Arial Black", sans-serif'; l.strokeText('AURA', cx, 250);
    const gr = l.createLinearGradient(0, 190, 0, 310); gr.addColorStop(0, '#f2e8ff'); gr.addColorStop(1, '#a77bff'); l.fillStyle = gr; l.fillText('AURA', cx, 250);
    l.fillStyle = '#7b4dff'; l.fillRect(cx - 160, 328, 320, 6); l.fillStyle = '#d9c4ff'; l.fillRect(cx - 160, 338, 150, 3);
    l.font = '700 20px Arial'; l.fillStyle = '#9c7bff'; l.fillText('· · ·  GOOD VIBES ONLY  · · ·', cx, 372);
    crack(l, W, H, 9, 0.25);
    p.drawImage(L, 0, 0);
  },
  babydow(p, W, H, S) {
    const cx = W / 2; p.textAlign = 'center'; p.textBaseline = 'middle'; p.lineJoin = 'round';
    p.font = '900 120px "Arial Rounded MT Bold", Arial, sans-serif';
    for (const [t, y, rot] of [['BABY', 215, -0.06], ['DOW', 335, 0.05]]) {
      p.save(); p.translate(cx, y); p.rotate(rot);
      p.lineWidth = 28; p.strokeStyle = '#fff'; p.strokeText(t, 0, 0);
      p.lineWidth = 14; p.strokeStyle = '#c51d6c'; p.strokeText(t, 0, 0);
      const gr = p.createLinearGradient(0, -50, 0, 50); gr.addColorStop(0, '#ff69b0'); gr.addColorStop(1, '#e0227a'); p.fillStyle = gr; p.fillText(t, 0, 0);
      p.fillStyle = 'rgba(255,255,255,.55)'; p.fillRect(-120, -44, 240, 8);
      p.restore();
    }
    p.fillStyle = '#fff'; for (const [x, y, r] of [[140, 150, 11], [380, 160, 9], [120, 400, 8], [400, 390, 12], [380, 250, 6]]) { p.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } p.closePath(); p.fill(); }
  },
  bolsonaro(p, W, H, S) {
    const cx = W / 2; p.textAlign = 'center'; p.textBaseline = 'middle'; p.lineJoin = 'round';
    p.font = '900 104px Impact, "Arial Black", sans-serif';
    for (const [t, y] of [['BOLSO', 222], ['NARO', 332]]) { p.lineWidth = 16; p.strokeStyle = '#0d5a25'; p.strokeText(t, cx, y); p.fillStyle = S.trim; p.fillText(t, cx, y); p.fillStyle = 'rgba(255,255,255,.35)'; p.fillRect(cx - 150, y - 44, 300, 6); }
    // faixas amarelas de camisa de time nas laterais e escudo
    p.fillStyle = S.trim; p.fillRect(40, 0, 10, H); p.fillRect(W - 50, 0, 10, H); p.fillRect(cx - 100, 0, 6, 80); p.fillRect(cx + 94, 0, 6, 80);
    p.fillStyle = '#0d5a25'; p.beginPath(); p.moveTo(cx + 115, 150); p.lineTo(cx + 175, 150); p.lineTo(cx + 175, 195); p.quadraticCurveTo(cx + 145, 225, cx + 115, 195); p.closePath(); p.fill(); p.fillStyle = S.trim; p.beginPath(); p.arc(cx + 145, 175, 12, 0, 6.28); p.fill();
  },
};
// xadrez: botões, pala e bolso (os 6 usam o mesmo "molde", mudando só o padrão e acabamento)
for (const id of Object.keys(SHIRTS)) if (id.startsWith('xadrez')) FRONT[id] = function (p, W, H, S) {
  const cx = W / 2;
  placket(p, cx, 0, H, 44, 'rgba(0,0,0,.10)', 'rgba(0,0,0,.28)');
  for (let y = 110; y < H - 20; y += 72) { p.fillStyle = S.snaps; p.beginPath(); p.arc(cx, y, 8, 0, 6.28); p.fill(); p.fillStyle = 'rgba(0,0,0,.28)'; p.beginPath(); p.arc(cx - 2.2, y - 2.2, 1.3, 0, 6.28); p.arc(cx + 2.2, y - 2.2, 1.3, 0, 6.28); p.arc(cx - 2.2, y + 2.2, 1.3, 0, 6.28); p.arc(cx + 2.2, y + 2.2, 1.3, 0, 6.28); p.fill(); p.strokeStyle = 'rgba(0,0,0,.35)'; p.lineWidth = 1.3; p.beginPath(); p.arc(cx, y, 8, 0, 6.28); p.stroke(); }
  // bolso de peito cortado na diagonal (xadrez fica diferente na direção, como costurado de verdade)
  const px = cx + 86, py = 235, pw = 100, ph = 112;
  p.save(); p.fillStyle = 'rgba(0,0,0,.18)'; p.fillRect(px + 4, py + 4, pw, ph);
  p.beginPath(); p.rect(px, py, pw, ph); p.clip();
  p.translate(px + pw / 2, py + ph / 2); p.rotate(Math.PI / 4); p.translate(-(pw + ph), -(pw + ph));
  plaidFill(p, (pw + ph) * 2, (pw + ph) * 2, S.base, S.plaid, 7); p.restore();
  p.strokeStyle = 'rgba(0,0,0,.4)'; p.lineWidth = 2.4; p.strokeRect(px, py, pw, ph); stitch(p, [[px + 7, py + 7], [px + pw - 7, py + 7], [px + pw - 7, py + ph - 7], [px + 7, py + ph - 7], [px + 7, py + 7]], 'rgba(255,255,255,.4)', 5, 4, 1.2);
  p.fillStyle = 'rgba(0,0,0,.25)'; p.fillRect(px, py, pw, 10);
};

// ---- manga: tecido liso/xadrez com punho ----
export function sleeveTexture(id) {
  return memo('sleeve|' + id, () => {
    const S = SHIRTS[id], W = 256, H = 512, c = cv(W, H), g = c.getContext('2d'), seed = hash(id + 's');
    if (S.plaid) plaidFill(g, W, H, S.base, { ...S.plaid, cell: S.plaid.cell * 0.9 }, seed); else { g.fillStyle = S.base; g.fillRect(0, 0, W, H); }
    weave(g, W, H, S.fabric, { thread: S.thread, scale: 0.55 });
    folds(g, W, H, seed, 10, 0.12, true);
    vignetteV(g, W, H, 0.18, 0.08);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(W * 0.5 - 1.5, 0, 3, H); stitch(g, [[W * 0.5 + 4, 0], [W * 0.5 + 4, H]], 'rgba(255,255,255,.2)', 6, 4, 1.1);
    if (id === 'bolsonaro') { g.fillStyle = S.trim; g.fillRect(0, H - 70, W, 22); }
    return c;
  });
}

// ---------- CALÇAS ----------
const PANTS = {
  'jeans-azul': { kind: 'denim', base: '#2a4a8c', wash: 0.35, stitch: 'rgba(235,190,90,.95)', pockets: true, belt: { c: '#3a2416', buckle: '#d8b24a' }, long: true, flare: 0.012, rivet: '#c98a4a', fade: 'knees' },
  'preta': { kind: 'twill', base: '#1b1b20', wash: 0.0, stitch: 'rgba(110,110,125,.9)', pockets: true, belt: { c: '#0e0e10', buckle: '#b8bcc4' }, long: true, flare: -0.012, rivet: '#9aa0aa', zip: true, slim: true },
  'jeans-claro': { kind: 'denim', base: '#7aa3d8', wash: 0.7, stitch: 'rgba(250,236,170,.95)', pockets: true, belt: { c: '#6b4a2a', buckle: '#d8d0b8' }, long: true, flare: 0.0, rivet: '#d8d0b8', fade: 'heavy', rip: true, cuff: true },
  'bermuda-rosa': { kind: 'cotton', base: '#ef6aa7', wash: 0.0, stitch: 'rgba(255,255,255,.85)', pockets: 'cargo', belt: null, drawstring: '#ffe3f1', long: false, len: 0.41 },
  'bermuda-grife': { kind: 'satin', base: '#1f4fb0', wash: 0.0, stitch: 'rgba(241,210,122,.95)', pockets: false, belt: null, long: false, len: 0.42, monogram: true, piping: '#f1d27a' },
  'short-jeans': { kind: 'denim', base: '#5b86c4', wash: 0.55, stitch: 'rgba(250,240,190,.95)', pockets: true, belt: null, long: false, len: 0.25, frayed: true, rivet: '#d8d0b8' },
  'short-preto': { kind: 'twill', base: '#16161a', wash: 0.0, stitch: 'rgba(201,162,74,.95)', pockets: false, belt: null, long: false, len: 0.25, piping: '#c9a24a' },
  'short-dourado': { kind: 'satin', base: '#d8a830', wash: 0.0, stitch: 'rgba(255,240,160,.9)', pockets: false, belt: null, long: false, len: 0.25, shine: true },
};
export const pantSpec = (id) => PANTS[id];

function denimBase(g, W, H, base, wash, seed, kind) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const r = rng(seed);
  if (kind === 'denim') {
    // fios de índigo (urdidura mais escura) + fios claros (trama): efeito de brim
    for (let x = 0; x < W; x += 3) { g.fillStyle = `rgba(0,0,30,${0.08 + r() * 0.08})`; g.fillRect(x, 0, 1.4, H); }
    for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`; g.fillRect(0, y, W, 1); }
    g.save(); g.globalCompositeOperation = 'overlay'; weave(g, W, H, 'twill', { thread: 3, scale: 0.55, alpha: 1 }); g.restore();
    // lavagem desbotada (manchas claras irregulares)
    for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * H, rad = 20 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,255,255,${wash * 0.22 * (0.4 + r())})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  } else if (kind === 'satin') {
    const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(0.5, 'rgba(0,0,0,.14)'); gr.addColorStop(1, 'rgba(255,255,255,.12)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    weave(g, W, H, 'cotton', { thread: 2, scale: 0.4, alpha: 0.6 });
  } else { weave(g, W, H, kind === 'twill' ? 'twill' : 'cotton', { thread: 3, scale: 0.55 }); }
}

// canvas da perna: u = t/2π com t = 0 na frente => emenda na frente; costas no meio (u = 0,5)
export function legTexture(id) {
  return memo('leg|' + id, () => {
    const P = PANTS[id], W = 512, H = Math.round((P.len || 0.66) * 1160), c = cv(W, H), g = c.getContext('2d'), seed = hash(id);
    denimBase(g, W, H, P.base, P.wash, seed, P.kind);
    folds(g, W, H, seed, 12, 0.13, true);
    // joelho desbotado / bigodes nas coxas
    if (P.fade) {
      const r = rng(seed + 3);
      for (const [cx, cy, rw, rh, a] of [[W * 0.18, H * 0.5, 80, 70, 0.30], [W * 0.82, H * 0.5, 80, 70, 0.30], [W * 0.5, H * 0.5, 90, 80, 0.28]]) { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rw); gr.addColorStop(0, `rgba(255,255,255,${a * (P.fade === 'heavy' ? 1.5 : 1)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(cx - rw, cy - rh, rw * 2, rh * 2); }
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; for (let i = 0; i < 18; i++) { const x = W * (0.08 + r() * 0.2), y = H * (0.05 + r() * 0.1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60 + r() * 40, y + 24 + r() * 16); g.stroke(); }
    }
    // costuras laterais com fio contrastante (u = 0,25 e 0,75)
    for (const u of [0.25, 0.75]) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(u * W - 2, 0, 4, H); stitch(g, [[u * W - 6, 0], [u * W - 6, H]], P.stitch, 9, 5, 2.4); stitch(g, [[u * W + 6, 0], [u * W + 6, H]], P.stitch, 9, 5, 2.4); }
    // bolsos traseiros (centro u = 0,5) com costura em arco e rebite
    if (P.pockets === true) {
      for (const dx of [-0.065, 0.065]) {
        const cx = W * (0.5 + dx), cy = H * 0.15, w = 78, h = 92;
        g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.moveTo(cx - w / 2 + 3, cy - h / 2 + 3); g.lineTo(cx + w / 2 + 3, cy - h / 2 + 3); g.lineTo(cx + w / 2 + 3, cy + h * 0.2 + 3); g.lineTo(cx + 3, cy + h / 2 + 3); g.lineTo(cx - w / 2 + 3, cy + h * 0.2 + 3); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy - h / 2); g.lineTo(cx + w / 2, cy + h * 0.2); g.lineTo(cx, cy + h / 2); g.lineTo(cx - w / 2, cy + h * 0.2); g.closePath(); g.stroke();
        stitch(g, [[cx - w / 2 + 6, cy - h / 2 + 8], [cx + w / 2 - 6, cy - h / 2 + 8]], P.stitch, 7, 4, 2); stitch(g, [[cx - w * 0.28, cy - 4], [cx, cy + h * 0.3], [cx + w * 0.28, cy - 4]], P.stitch, 7, 4, 2.2);
        g.fillStyle = P.rivet || '#c98a4a'; for (const [rx, ry] of [[cx - w / 2 + 3, cy - h / 2 + 3], [cx + w / 2 - 3, cy - h / 2 + 3]]) { g.beginPath(); g.arc(rx, ry, 3.6, 0, 6.28); g.fill(); }
      }
    }
    // bolsos frontais diagonais (nas bordas da emenda: u ~ 0,92 e 0,08)
    if (P.pockets === true || P.pockets === 'cargo') {
      for (const u of [0.07, 0.93]) {
        const x = u * W, y = H * 0.06, s = u < 0.5 ? 1 : -1;
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - s * 40, y); g.quadraticCurveTo(x + s * 20, y + 60, x + s * 6, y + 130); g.stroke();
        stitch(g, [[x - s * 40, y + 6], [x + s * 16, y + 62], [x + s * 2, y + 130]], P.stitch, 7, 4, 2);
      }
    }
    if (P.pockets === 'cargo') { // bolso cargo na lateral (u = 0,25 e 0,75)
      for (const u of [0.25, 0.75]) { const x = u * W - 40, y = H * 0.28; g.fillStyle = shade(P.base, 8); g.fillRect(x, y, 80, 130); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2.4; g.strokeRect(x, y, 80, 130); g.fillStyle = shade(P.base, -18); g.fillRect(x, y, 80, 36); stitch(g, [[x + 6, y + 44], [x + 74, y + 44], [x + 74, y + 124], [x + 6, y + 124], [x + 6, y + 44]], P.stitch, 6, 4, 1.8); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 40, y + 28, 7, 0, 6.28); g.fill(); }
    }
    if (P.piping) { for (const u of [0.25, 0.75]) { g.fillStyle = P.piping; g.fillRect(u * W - 24, 0, 8, H); g.fillRect(u * W + 16, 0, 8, H); } }
    if (P.monogram) { // monograma em losangos (como grife)
      g.save(); g.globalAlpha = 0.5; for (let y = 10; y < H - 20; y += 34) for (let x = ((y / 34) % 2) * 17; x < W; x += 34) { g.fillStyle = '#f4dc8c'; g.font = '700 16px Georgia'; g.textAlign = 'center'; g.fillText('F', x + 10, y + 14); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y + 20); g.lineTo(x + 17, y + 2); g.lineTo(x + 34, y + 20); g.stroke(); } g.restore();
    }
    if (P.shine) { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(0.7, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    if (P.rip) { // rasgo no joelho com fiozinhos brancos
      const x = W * 0.12, y = H * 0.52; g.fillStyle = '#d7e4f4'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70, y + 4); g.lineTo(x + 72, y + 34); g.lineTo(x + 2, y + 30); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.2; for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(x + 4 + i * 4.2, y + 2); g.lineTo(x + 4 + i * 4.2 + (i % 3 - 1) * 3, y + 32); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, y - 3, 72, 3); g.fillRect(x, y + 34, 72, 3);
    }
    // barra: costura dupla, desfiado nas bermudas jeans
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, H - 30, W, 30); stitch(g, [[0, H - 40], [W, H - 40]], P.stitch, 9, 5, 2.4);
    if (P.frayed) { const r = rng(seed + 9); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.3; for (let x = 0; x < W; x += 3) { g.beginPath(); g.moveTo(x, H - 18); g.lineTo(x + (r() - 0.5) * 6, H - 2 - r() * 10); g.stroke(); } }
    vignetteV(g, W, H, 0.24, 0.14);
    noisy(g, W, H, seed, 2600, 0.04);
    return c;
  });
}

// quadril/cintura: cós + cinto (ou elástico) e braguilha (u = 0,5 frente)
export function pelvisTexture(id) {
  return memo('pelvis|' + id, () => {
    const P = PANTS[id], W = 1024, H = 256, c = cv(W, H), g = c.getContext('2d'), seed = hash(id + 'p');
    denimBase(g, W, H, P.base, P.wash * 0.6, seed, P.kind);
    folds(g, W, H, seed, 6, 0.1);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(W * 0.25 - 2, 0, 4, H); g.fillRect(W * 0.75 - 2, 0, 4, H);
    // braguilha em J com costura e botão (frente em u = 0,5)
    const fx = W / 2; stitch(g, [[fx + 6, 56], [fx + 6, 150], [fx - 20, 190], [fx - 48, 190]], P.stitch, 7, 4, 2.2);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(fx - 1, 56, 2, 130);
    if (P.belt) { // cinto de couro com passantes e fivela dourada
      const y0 = 4, y1 = 64; const lt = P.belt.c; g.fillStyle = lt; g.fillRect(0, y0, W, y1 - y0);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.02 + (i % 5) * 0.01})`; g.fillRect((i * 37) % W, y0 + (i * 13) % (y1 - y0), 14, 2); }
      stitch(g, [[0, y0 + 8], [W, y0 + 8]], 'rgba(235,205,140,.7)', 8, 5, 1.6); stitch(g, [[0, y1 - 8], [W, y1 - 8]], 'rgba(235,205,140,.7)', 8, 5, 1.6);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y1 - 3, W, 3);
      const bx = fx, by = (y0 + y1) / 2, bw = 74, bh = 54; // fivela
      const gr = g.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0); gr.addColorStop(0, shade(P.belt.buckle.startsWith('#') ? P.belt.buckle : '#d8b24a', 30)); gr.addColorStop(0.5, P.belt.buckle); gr.addColorStop(1, shade(P.belt.buckle.startsWith('#') ? P.belt.buckle : '#d8b24a', -40));
      g.strokeStyle = gr; g.lineWidth = 9; g.strokeRect(bx - bw / 2 + 4, by - bh / 2 + 4, bw - 8, bh - 8); g.fillStyle = gr; g.fillRect(bx - 4, by - bh / 2 + 4, 8, bh - 8);
      for (let k = 0; k < 7; k++) { const x = bx + 80 + k * 44; g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, by, 4, 0, 6.28); g.fill(); } // furos
      for (const x of [W * 0.22, W * 0.78]) { g.fillStyle = P.base; g.fillRect(x - 11, 0, 22, 90); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x - 11, 0, 3, 90); stitch(g, [[x - 5, 4], [x - 5, 84]], P.stitch, 6, 4, 1.4); } // passantes
    } else if (P.drawstring) { // elástico + cordão
      g.fillStyle = shade(P.base, -26); g.fillRect(0, 0, W, 56); for (let x = 0; x < W; x += 7) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 2, 56); }
      g.strokeStyle = P.drawstring; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(fx - 90, 48); g.quadraticCurveTo(fx - 30, 100, fx - 14, 130); g.moveTo(fx + 90, 48); g.quadraticCurveTo(fx + 30, 100, fx + 14, 140); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(fx - 20, 126, 12, 30); g.fillRect(fx + 8, 136, 12, 30);
    } else { g.fillStyle = P.piping || shade(P.base, -22); g.fillRect(0, 0, W, 40); stitch(g, [[0, 48], [W, 48]], P.stitch, 8, 5, 1.8); }
    vignetteV(g, W, H, 0.14, 0.14); noisy(g, W, H, seed, 1200, 0.04);
    return c;
  });
}
