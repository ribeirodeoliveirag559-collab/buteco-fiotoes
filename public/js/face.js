// Rosto e cabelo pintados em alta resolução (vetor em canvas): olhos e bocas redondos, pele com
// sombreado, nariz, bochechas, sobrancelhas, barba e cabelo com mechas. Substitui o rosto em pixel.
const R = 256; // resolução de cada face da cabeça

const shadeHex = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + a));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = R; return c; };

function skinBase(g, skin, seed) {
  g.fillStyle = skin; g.fillRect(0, 0, R, R);
  const gr = g.createRadialGradient(R / 2, R * 0.45, R * 0.1, R / 2, R * 0.5, R * 0.75);
  gr.addColorStop(0, 'rgba(255,255,255,.10)'); gr.addColorStop(1, 'rgba(0,0,0,.22)');
  g.fillStyle = gr; g.fillRect(0, 0, R, R);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(80,30,20,.05)'; g.fillRect(r() * R, r() * R, 1.5, 1.5); }
}

// mechas de cabelo dentro de um caminho (clip)
function strands(g, hair, seed, dirX = 0, dirY = 1, len = 60, count = 420) {
  const r = rng(seed);
  g.fillStyle = hair; g.fillRect(0, 0, R, R);
  for (let i = 0; i < count; i++) {
    const x = r() * R, y = r() * R, l = len * (0.5 + r());
    g.strokeStyle = r() > 0.5 ? rgba('#ffffff', 0.06 + r() * 0.08) : rgba('#000000', 0.08 + r() * 0.12);
    g.lineWidth = 1 + r() * 1.8;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + dirX * l * 0.5 + (r() - 0.5) * 14, y + dirY * l * 0.5, x + dirX * l, y + dirY * l);
    g.stroke();
  }
  const sh = g.createLinearGradient(0, 0, 0, R); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(1, 'rgba(0,0,0,.18)');
  g.fillStyle = sh; g.fillRect(0, 0, R, R);
}
function withClip(g, path, fn) { g.save(); g.beginPath(); path(g); g.clip(); fn(); g.restore(); }

function irisColor(look) {
  if (look.hairColor === 'loiro' || look.hairColor === 'platinado') return '#3f7fc4';
  if (look.hairColor === 'ruivo') return '#4f8a3a';
  if (look.hairColor === 'grisalho') return '#6a7e8e';
  return '#5a3618';
}

function eye(g, cx, cy, o) {
  const { rx = 27, ry = 20, iris = '#5a3618', red = false, lid = 0, lash = false, liner = false } = o;
  // branco do olho
  g.save();
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = red ? '#f2a0a4' : '#fbfbf7'; g.fill();
  g.clip();
  if (red) { g.strokeStyle = 'rgba(200,20,30,.55)'; g.lineWidth = 1.2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(cx - rx + i * 2, cy - 4 + i * 2); g.quadraticCurveTo(cx - rx * 0.4, cy + (i - 3) * 3, cx - rx * 0.35, cy); g.stroke(); } }
  // íris, pupila, brilho
  const ir = ry * 0.78;
  const ig = g.createRadialGradient(cx, cy, ir * 0.2, cx, cy, ir);
  ig.addColorStop(0, shadeHex(iris, 40)); ig.addColorStop(1, shadeHex(iris, -30));
  g.beginPath(); g.arc(cx, cy + 1, ir, 0, Math.PI * 2); g.fillStyle = ig; g.fill();
  g.beginPath(); g.arc(cx, cy + 1, ir * 0.45, 0, Math.PI * 2); g.fillStyle = '#0d0a0a'; g.fill();
  g.beginPath(); g.arc(cx - ir * 0.35, cy - ir * 0.35, ir * 0.22, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
  // pálpebra (olho meio fechado)
  if (lid > 0) { g.fillStyle = o.skin; g.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 * lid + 2); }
  // sombra de cima
  const sg = g.createLinearGradient(0, cy - ry, 0, cy); sg.addColorStop(0, 'rgba(0,0,0,.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sg; g.fillRect(cx - rx, cy - ry, rx * 2, ry);
  g.restore();
  // contorno / cílios
  g.strokeStyle = '#2a1a14'; g.lineWidth = lash ? 4.5 : 3.2; g.lineCap = 'round';
  const top = cy - ry + (lid > 0 ? ry * 2 * lid : 0);
  g.beginPath(); g.ellipse(cx, lid > 0 ? top + ry * 0.0 : cy, rx, lid > 0 ? ry * (1 - lid) : ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(60,30,20,.45)'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  if (lash || liner) { g.lineWidth = 3.5; g.strokeStyle = '#1a0f0c'; const side = cx < R / 2 ? -1 : 1; g.beginPath(); g.moveTo(cx + side * rx * 0.95, top + 4); g.lineTo(cx + side * (rx + 9), top - 5); g.stroke(); }
}
function closedEye(g, cx, cy, rx) {
  g.strokeStyle = '#2a1a14'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy - 8, rx, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
}
function heartEye(g, cx, cy, s, red) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(-14, -4, -8, -16, 0, -8); g.bezierCurveTo(8, -16, 14, -4, 0, 6); g.closePath();
  g.fillStyle = red ? '#c0102a' : '#ff3a6e'; g.fill();
  g.beginPath(); g.arc(-4, -8, 2.2, 0, 7); g.fillStyle = '#ffd0dc'; g.fill();
  g.restore();
}
function brow(g, cx, cy, hair, angle, w = 36) {
  g.save(); g.translate(cx, cy); g.rotate(angle);
  g.strokeStyle = shadeHex(hair, -15); g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-w / 2, 3); g.quadraticCurveTo(0, -5, w / 2, 2); g.stroke();
  g.restore();
}

function mouth(g, type, hair, skin, seed) {
  const cx = R / 2, cy = 188;
  const lipC = shadeHex(skin, -55);
  g.lineCap = 'round'; g.lineJoin = 'round';
  switch (type) {
    case 'serio':
      g.strokeStyle = '#6b2a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 20, cy); g.quadraticCurveTo(cx, cy + 2, cx + 20, cy); g.stroke();
      g.strokeStyle = rgba('#ffffff', 0.15); g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 12, cy + 7); g.lineTo(cx + 12, cy + 7); g.stroke();
      break;
    case 'risada': {
      g.beginPath(); g.moveTo(cx - 30, cy - 8); g.quadraticCurveTo(cx, cy - 2, cx + 30, cy - 8); g.quadraticCurveTo(cx + 26, cy + 30, cx, cy + 32); g.quadraticCurveTo(cx - 26, cy + 30, cx - 30, cy - 8); g.closePath();
      g.fillStyle = '#4a1414'; g.fill();
      g.save(); g.clip();
      g.fillStyle = '#fbfbf2'; g.fillRect(cx - 32, cy - 10, 64, 11);
      g.beginPath(); g.ellipse(cx, cy + 28, 18, 10, 0, 0, 7); g.fillStyle = '#e8607a'; g.fill();
      g.restore();
      g.strokeStyle = lipC; g.lineWidth = 3; g.stroke();
      break;
    }
    case 'lingua':
      g.strokeStyle = '#6b2a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 24, cy - 6); g.quadraticCurveTo(cx, cy + 14, cx + 24, cy - 6); g.stroke();
      g.beginPath(); g.moveTo(cx - 4, cy + 4); g.quadraticCurveTo(cx + 2, cy + 30, cx + 14, cy + 6); g.closePath(); g.fillStyle = '#e8607a'; g.fill();
      g.strokeStyle = '#c24a64'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 5, cy + 8); g.lineTo(cx + 6, cy + 18); g.stroke();
      break;
    case 'batom':
      g.beginPath(); g.moveTo(cx - 26, cy); g.quadraticCurveTo(cx - 14, cy - 12, cx, cy - 6); g.quadraticCurveTo(cx + 14, cy - 12, cx + 26, cy); g.quadraticCurveTo(cx, cy + 20, cx - 26, cy); g.closePath();
      g.fillStyle = '#c8143c'; g.fill();
      g.strokeStyle = '#8a0c28'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - 24, cy + 1); g.quadraticCurveTo(cx, cy + 5, cx + 24, cy + 1); g.stroke();
      g.beginPath(); g.ellipse(cx - 6, cy + 7, 7, 2.5, -0.2, 0, 7); g.fillStyle = 'rgba(255,255,255,.55)'; g.fill();
      break;
    case 'bigode':
      g.strokeStyle = '#6b2a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 14, cy + 6); g.quadraticCurveTo(cx, cy + 12, cx + 14, cy + 6); g.stroke();
      g.beginPath(); g.moveTo(cx, cy - 10);
      g.bezierCurveTo(cx - 20, cy - 22, cx - 44, cy - 10, cx - 46, cy + 6); g.bezierCurveTo(cx - 30, cy - 2, cx - 14, cy + 2, cx, cy - 4);
      g.bezierCurveTo(cx + 14, cy + 2, cx + 30, cy - 2, cx + 46, cy + 6); g.bezierCurveTo(cx + 44, cy - 10, cx + 20, cy - 22, cx, cy - 10);
      g.fillStyle = hair; g.fill();
      g.strokeStyle = rgba('#000000', 0.25); g.lineWidth = 1.5; for (let i = -40; i < 42; i += 5) { g.beginPath(); g.moveTo(cx + i, cy - 10 + Math.abs(i) * 0.15); g.lineTo(cx + i * 1.05, cy + 2 + Math.abs(i) * 0.1); g.stroke(); }
      break;
    case 'barba': {
      const path = (c) => { c.moveTo(18, 120); c.quadraticCurveTo(24, 230, R / 2, 252); c.quadraticCurveTo(R - 24, 230, R - 18, 120); c.lineTo(R - 34, 125); c.quadraticCurveTo(R - 50, 168, R / 2 + 30, 170); c.quadraticCurveTo(R / 2, 162, R / 2 - 30, 170); c.quadraticCurveTo(50, 168, 34, 125); c.closePath(); };
      withClip(g, path, () => { g.globalAlpha = 0.96; strands(g, hair, seed + 5, 0, 1, 26, 900); g.globalAlpha = 1; });
      g.beginPath(); g.ellipse(cx, cy + 4, 18, 7, 0, 0, 7); g.fillStyle = '#5a1e1e'; g.fill();
      g.strokeStyle = shadeHex(skin, -60); g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 16, cy + 2); g.quadraticCurveTo(cx, cy + 6, cx + 16, cy + 2); g.stroke();
      break;
    }
    default: // sorriso
      g.strokeStyle = '#6b2a2a'; g.lineWidth = 5.5; g.beginPath(); g.moveTo(cx - 26, cy - 6); g.quadraticCurveTo(cx, cy + 16, cx + 26, cy - 6); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(cx, cy + 12, 10, 3, 0, 0, 7); g.fill();
  }
}

function fringe(g, hairId, hair, seed) {
  const clip = {
    curto: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, 46); c.quadraticCurveTo(R * 0.75, 58, R / 2, 52); c.quadraticCurveTo(R * 0.25, 58, 0, 46); c.closePath(); },
    mullet: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, 46); c.quadraticCurveTo(R / 2, 62, 0, 46); c.closePath(); c.rect(0, 0, 18, R); c.rect(R - 18, 0, 18, R); },
    degrade: (c) => { c.moveTo(20, 0); c.lineTo(R - 20, 0); c.lineTo(R - 30, 34); c.quadraticCurveTo(R / 2, 42, 30, 34); c.closePath(); },
    oldmoney: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, 30); c.quadraticCurveTo(R / 2, 22, 0, 32); c.closePath(); },
    topete: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, 40); c.quadraticCurveTo(R * 0.6, 30, R * 0.35, 52); c.quadraticCurveTo(R * 0.2, 40, 0, 44); c.closePath(); },
    ondulado: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, 150); c.lineTo(R - 26, 150); for (let x = R - 26; x > 26; x -= 34) c.quadraticCurveTo(x - 17, 78, x - 34, 58); c.lineTo(26, 150); c.lineTo(0, 150); c.closePath(); },
    longo: (c) => { c.moveTo(0, 0); c.lineTo(R, 0); c.lineTo(R, R); c.lineTo(R - 28, R); c.quadraticCurveTo(R - 24, 90, R * 0.42, 50); c.quadraticCurveTo(70, 70, 30, 120); c.lineTo(28, R); c.lineTo(0, R); c.closePath(); },
  }[hairId];
  if (!clip) return;
  withClip(g, clip, () => strands(g, hair, seed, hairId === 'oldmoney' ? 0 : 0.15, hairId === 'oldmoney' ? -1 : 1, hairId === 'longo' ? 90 : 40, 650));
  // sombra embaixo da franja
  g.save(); g.beginPath(); clip(g); g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.18)'; g.stroke(); g.restore();
}

function glasses(g, type) {
  if (type === 'grau') {
    g.strokeStyle = '#2b2b30'; g.lineWidth = 6;
    for (const x of [84, 172]) { g.beginPath(); g.arc(x, 120, 30, 0, Math.PI * 2); g.fillStyle = 'rgba(190,225,255,.18)'; g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x - 18, 102, 10, 4); }
    g.beginPath(); g.moveTo(114, 116); g.quadraticCurveTo(128, 106, 142, 116); g.stroke();
    g.beginPath(); g.moveTo(54, 116); g.lineTo(0, 110); g.moveTo(202, 116); g.lineTo(R, 110); g.stroke();
  } else if (type === 'sol') {
    g.fillStyle = 'rgba(10,10,16,.93)'; g.strokeStyle = '#08080b'; g.lineWidth = 6;
    for (const x of [84, 172]) { g.beginPath(); if (g.roundRect) g.roundRect(x - 36, 96, 72, 48, 10); else g.rect(x - 36, 96, 72, 48); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x - 26, 104); g.lineTo(x - 10, 104); g.lineTo(x - 24, 120); g.closePath(); g.fill(); g.fillStyle = 'rgba(10,10,16,.93)'; }
    g.beginPath(); g.moveTo(120, 112); g.lineTo(136, 112); g.stroke();
    g.beginPath(); g.moveTo(48, 112); g.lineTo(0, 108); g.moveTo(208, 112); g.lineTo(R, 108); g.stroke();
  }
}

// ---------------- faces da cabeça ----------------
export function paintFace(look, skin, hair, opts = {}) {
  const c = canvas(), g = c.getContext('2d');
  const seed = (look.skin + look.hair + look.eyes).length * 97;
  skinBase(g, skin, seed);
  // bochechas e nariz
  for (const x of [62, 194]) { const bg = g.createRadialGradient(x, 160, 2, x, 160, 26); bg.addColorStop(0, 'rgba(235,90,100,.22)'); bg.addColorStop(1, 'rgba(235,90,100,0)'); g.fillStyle = bg; g.fillRect(x - 30, 130, 60, 60); }
  const ng = g.createRadialGradient(R / 2, 160, 2, R / 2, 154, 22); ng.addColorStop(0, 'rgba(0,0,0,.0)'); ng.addColorStop(1, 'rgba(0,0,0,.0)');
  g.strokeStyle = shadeHex(skin, -55); g.lineWidth = 4.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(R / 2 - 3, 128); g.quadraticCurveTo(R / 2 - 9, 152, R / 2 - 12, 158); g.quadraticCurveTo(R / 2, 166, R / 2 + 12, 158); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(R / 2 + 2, 146, 4, 9, 0, 0, 7); g.fill();

  const iris = irisColor(look), red = !!opts.red;
  const eyesType = opts.wink ? 'piscadinha' : look.eyes;
  const hc = hair;
  switch (eyesType) {
    case 'redondo': eye(g, 84, 118, { rx: 30, ry: 27, iris, red, skin }); eye(g, 172, 118, { rx: 30, ry: 27, iris, red, skin }); brow(g, 84, 86, hc, -0.08); brow(g, 172, 86, hc, 0.08); break;
    case 'sonolento': eye(g, 84, 120, { iris, red, skin, lid: 0.45 }); eye(g, 172, 120, { iris, red, skin, lid: 0.45 }); brow(g, 84, 94, hc, 0.06); brow(g, 172, 94, hc, -0.06); break;
    case 'bravo': eye(g, 84, 120, { iris, red, skin, ry: 16 }); eye(g, 172, 120, { iris, red, skin, ry: 16 }); brow(g, 86, 96, hc, 0.38); brow(g, 170, 96, hc, -0.38); break;
    case 'piscadinha': eye(g, 84, 118, { iris, red, skin }); closedEye(g, 172, 126, 20); brow(g, 84, 90, hc, -0.06); brow(g, 172, 92, hc, 0.12); break;
    case 'coracao': heartEye(g, 84, 120, 2.0, red); heartEye(g, 172, 120, 2.0, red); brow(g, 84, 86, hc, -0.1); brow(g, 172, 86, hc, 0.1); break;
    case 'sedutor': eye(g, 84, 120, { iris, red, skin, lid: 0.3, lash: true, liner: true }); eye(g, 172, 120, { iris, red, skin, lid: 0.3, lash: true, liner: true }); brow(g, 84, 90, hc, -0.14, 30); brow(g, 172, 90, hc, 0.14, 30); break;
    default: eye(g, 84, 118, { iris, red, skin }); eye(g, 172, 118, { iris, red, skin }); brow(g, 84, 90, hc, -0.06); brow(g, 172, 90, hc, 0.06);
  }
  if (look.mouth === 'barba') mouth(g, look.mouth, hair, skin, seed);
  else { g.save(); g.translate(R / 2, 188); g.scale(1.35, 1.35); g.translate(-R / 2, -188); mouth(g, look.mouth, hair, skin, seed); g.restore(); }
  if (look.hair === 'careca') { g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(R * 0.4, 18, 34, 10, -0.2, 0, 7); g.fill(); }
  else if (!opts.underHat || ['longo', 'ondulado', 'mullet'].includes(look.hair)) fringe(g, look.hair, hair, seed);
  glasses(g, look.glasses);
  return c;
}

const SIDE_HAIR = { careca: 0, curto: 0.32, degrade: 0.26, oldmoney: 0.3, topete: 0.32, ondulado: 0.78, mullet: 1, longo: 1 };
export function paintSide(look, skin, hair, back = false) {
  const c = canvas(), g = c.getContext('2d');
  skinBase(g, skin, 11);
  const cover = SIDE_HAIR[look.hair] ?? 0.3;
  if (!back) { // orelha
    g.fillStyle = shadeHex(skin, -18); g.beginPath(); g.ellipse(R * 0.52, 130, 22, 34, 0, 0, 7); g.fill();
    g.strokeStyle = shadeHex(skin, -50); g.lineWidth = 4; g.beginPath(); g.ellipse(R * 0.52, 130, 13, 24, 0, -1.2, 2.6); g.stroke();
  }
  if (cover > 0) {
    const hY = R * (back ? Math.max(cover, 0.62) : cover);
    const path = (p) => { p.moveTo(0, 0); p.lineTo(R, 0); p.lineTo(R, hY); for (let x = R; x > 0; x -= 32) p.quadraticCurveTo(x - 16, hY + 10, x - 32, hY); p.closePath(); };
    withClip(g, path, () => strands(g, hair, back ? 31 : 21, 0.1, 1, cover > 0.6 ? 80 : 30, 700));
    if (look.hair === 'degrade') { const fg = g.createLinearGradient(0, hY, 0, hY + 50); fg.addColorStop(0, rgba(hair.startsWith('#') ? hair : '#333333', 0.6)); fg.addColorStop(1, rgba(hair.startsWith('#') ? hair : '#333333', 0)); g.fillStyle = fg; g.fillRect(0, hY, R, 50); }
  }
  return c;
}
export function paintTop(look, skin, hair) {
  const c = canvas(), g = c.getContext('2d');
  if (look.hair === 'careca') { skinBase(g, skin, 7); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(R * 0.45, R * 0.4, 60, 40, 0, 0, 7); g.fill(); }
  else strands(g, hair, 41, look.hair === 'oldmoney' ? 0 : 0.2, look.hair === 'oldmoney' ? -1 : 1, 70, 800);
  return c;
}
export function hairTexture(hair, seed = 51) {
  const c = canvas(), g = c.getContext('2d');
  strands(g, hair, seed, 0.12, 1, 80, 900);
  return c;
}
