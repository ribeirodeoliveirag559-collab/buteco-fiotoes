// Texturas procedurais (desenhadas em canvas) — o jogo não usa nenhuma imagem externa.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function toTex(c, { repeat, nearest = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

// ---- madeira em tábuas (piso) ----
export function floorWood(seed = 7) {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(seed);
  const rows = 8, rh = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let x = -r() * 200;
    while (x < 512) {
      const w = 150 + r() * 200;
      const l = 24 + r() * 10, h = 24 + r() * 6;
      g.fillStyle = hsl(h, 42, l); g.fillRect(x, i * rh, w, rh);
      for (let k = 0; k < 26; k++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '20,10,4' : '150,100,60'},${0.05 + r() * 0.12})`;
        g.fillRect(x + r() * w, i * rh + r() * rh, 20 + r() * 90, 1 + r() * 1.5);
      }
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, i * rh, 2, rh);
      x += w;
    }
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, i * rh, 512, 2);
  }
  return c;
}

// ---- tijolos ----
export function brick(seed = 3) {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#2a1512'; g.fillRect(0, 0, 512, 512);
  const bh = 32, bw = 80;
  for (let row = 0; row < 16; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < 512 + bw; x += bw) {
      const v = r();
      g.fillStyle = hsl(10 + v * 10, 38 + v * 12, 22 + r() * 12);
      g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(x + off + 4 + r() * (bw - 12), row * bh + 4 + r() * (bh - 10), 3 + r() * 10, 2); }
    }
  }
  return c;
}

// ---- lambri de madeira (vertical) ----
export function panel(seed = 11) {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rng(seed);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = hsl(22 + r() * 6, 38, 17 + r() * 6); g.fillRect(x, 0, 32, 256);
    for (let k = 0; k < 24; k++) { g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.1})`; g.fillRect(x + 2 + r() * 28, r() * 256, 1, 20 + r() * 120); }
    g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x, 0, 2, 256);
    g.fillStyle = 'rgba(255,200,140,.06)'; g.fillRect(x + 3, 0, 2, 256);
  }
  return c;
}

// ---- madeira escura genérica (balcão, guarda-roupa, mesas) ----
export function woodDark(base = [24, 40, 20], seed = 5, size = 256) {
  const c = canvas(size, size), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = hsl(base[0], base[1], base[2]); g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const y = r() * size, a = 0.04 + r() * 0.12;
    g.strokeStyle = r() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,190,120,${a * 0.7})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 14, size * 0.6, y + (r() - 0.5) * 14, size, y + (r() - 0.5) * 8);
    g.stroke();
  }
  for (let i = 0; i < 3; i++) { // nós
    const x = r() * size, y = r() * size;
    for (let k = 4; k > 0; k--) { g.strokeStyle = `rgba(0,0,0,${0.12})`; g.beginPath(); g.ellipse(x, y, k * 4, k * 2.2, 0, 0, 7); g.stroke(); }
  }
  return c;
}

// ---- papel de parede velho (quarto do guarda-roupa) ----
export function wallpaper(seed = 9) {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#7a6a4a'; g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) { g.fillStyle = 'rgba(60,45,25,.28)'; g.fillRect(x, 0, 28, 512); }
  for (let y = 16; y < 512; y += 64) for (let x = 14; x < 512; x += 64) {
    g.fillStyle = 'rgba(150,60,50,.4)'; g.beginPath(); g.arc(x + 32, y + 16, 6, 0, 7); g.fill();
    g.fillStyle = 'rgba(40,70,40,.35)'; g.fillRect(x + 31, y + 22, 2, 18);
  }
  for (let i = 0; i < 26; i++) { // manchas de umidade
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(30,20,8,.16)'); gr.addColorStop(1, 'rgba(30,20,8,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

// ---- tecido com trama ----
export function fabric(color, seed = 2) {
  const c = canvas(64, 64), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.06})`; g.fillRect(i, 0, 1, 64); g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.04})`; g.fillRect(0, i, 64, 1); }
  return c;
}

// ---- palha ----
export function straw(base = '#eadfbf', dark = '#b9a877') {
  const c = canvas(64, 64), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 8) {
    g.fillStyle = dark; g.fillRect(x + ((y / 4) % 2) * 4, y, 4, 1);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + ((y / 4) % 2) * 4, y + 1, 4, 1);
  }
  return c;
}

// ---- letreiro neon (com brilho) ----
export function neonSign(lines, { w = 1024, h = 256 } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((ln) => {
    g.font = `${ln.size}px Bungee, Impact, sans-serif`;
    g.shadowColor = ln.glow; g.shadowBlur = ln.size * 0.5;
    g.fillStyle = ln.color;
    for (let i = 0; i < 3; i++) g.fillText(ln.text, w / 2, ln.y);
    g.shadowBlur = 6; g.fillStyle = ln.core || '#fff'; g.fillText(ln.text, w / 2, ln.y);
  });
  return c;
}

// ---- cartazes de parede ----
export function wallPoster(title, sub, c1, c2, seed = 1) {
  const c = canvas(256, 380), g = c.getContext('2d'), r = rng(seed);
  const gr = g.createLinearGradient(0, 0, 0, 380); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 380);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(r() * 256, r() * 380, 2 + r() * 20, 2); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(0, 380); g.lineTo(60, 230); g.lineTo(120, 290); g.lineTo(180, 200); g.lineTo(256, 300); g.lineTo(256, 380); g.fill();
  g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '44px Bungee, Impact, sans-serif';
  g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
  const words = title.split(' ');
  words.forEach((w, i) => g.fillText(w, 128, 70 + i * 52));
  g.font = '800 20px Nunito, sans-serif'; g.fillText(sub, 128, 345);
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.strokeRect(10, 10, 236, 360);
  return c;
}

// ---- ruído (cabelo, chão) ----
export function noise(color, amt = 0.15, size = 32, seed = 4) {
  const c = canvas(size, size), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = color; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.5; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${r() * amt})`; g.fillRect(r() * size, r() * size, 1, 1); }
  return c;
}

// ---- piso xadrez preto e dourado (camarote) ----
export function checker(c1 = '#0c0a10', c2 = '#2a2230', gold = '#c9a24a') {
  const c = canvas(256, 256), g = c.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = (x + y) % 2 ? c1 : c2; g.fillRect(x * 64, y * 64, 64, 64);
    const gr = g.createLinearGradient(x * 64, y * 64, x * 64 + 64, y * 64 + 64);
    gr.addColorStop(0, 'rgba(255,255,255,.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x * 64, y * 64, 64, 64);
  }
  g.fillStyle = gold;
  for (let i = 0; i <= 4; i++) { g.fillRect(i * 64 - 1, 0, 2, 256); g.fillRect(0, i * 64 - 1, 256, 2); }
  return c;
}
