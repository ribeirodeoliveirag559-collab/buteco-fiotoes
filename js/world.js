// Cenário do bar FIOTÕES: desenho do fundo, objetos e colisões.
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});
  const W = 640, H = 360;

  const TABLES = [
    { x: 150, y: 238 }, { x: 300, y: 300 }, { x: 455, y: 232 }, { x: 548, y: 318 }, { x: 268, y: 190 },
  ];
  const HOMEM = { x: 46, y: 322 };
  const POSTER = { x: 372, y: 8, w: 240, h: 112 };
  const BOUNDS = { x0: 20, x1: 620, y0: 152, y1: 352 };
  const CRATES = { x: 14, y: 240, w: 58, h: 22 };
  const PLANT = { x: 98, y: 262 };

  const SOLIDS = [
    ...TABLES.map((t) => ({ c: 1, x: t.x, y: t.y + 4, r: 24 })),
    { c: 1, x: PLANT.x, y: PLANT.y, r: 9 },
    { r: 1, x: CRATES.x, y: CRATES.y, w: CRATES.w, h: CRATES.h },
    { c: 1, x: HOMEM.x, y: HOMEM.y, r: 9 },
  ];

  function resolve(p, rad) {
    rad = rad || 6;
    p.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, p.x));
    p.y = Math.max(BOUNDS.y0, Math.min(BOUNDS.y1, p.y));
    for (const s of SOLIDS) {
      if (s.c) {
        const dx = p.x - s.x, dy = (p.y - s.y) * 1.4; // elipse: chão é "achatado" na perspectiva
        const d = Math.hypot(dx, dy), m = s.r + rad;
        if (d < m) {
          const k = d < 0.001 ? 1 : m / d;
          p.x = s.x + dx * k;
          p.y = s.y + (dy * k) / 1.4;
        }
      } else {
        const nx = Math.max(s.x, Math.min(s.x + s.w, p.x)), ny = Math.max(s.y, Math.min(s.y + s.h, p.y));
        const dx = p.x - nx, dy = p.y - ny;
        const d = Math.hypot(dx, dy);
        if (d < rad) {
          if (d < 0.001) { p.y = s.y + s.h + rad; } else { p.x = nx + (dx / d) * rad; p.y = ny + (dy / d) * rad; }
        }
      }
    }
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

  function drawMugSmall(c, x, y) {
    R(c, x, y, 6, 2, '#fff8e6'); R(c, x, y + 2, 6, 5, '#f2b01e');
    R(c, x - 1, y + 1, 1, 6, 'rgba(230,245,255,.7)'); R(c, x + 6, y + 1, 1, 6, 'rgba(230,245,255,.7)');
    R(c, x + 7, y + 2, 2, 1, 'rgba(230,245,255,.8)'); R(c, x + 8, y + 2, 1, 3, 'rgba(230,245,255,.8)'); R(c, x + 7, y + 4, 2, 1, 'rgba(230,245,255,.8)');
  }

  // ---------- Fundo estático ----------
  function renderBg() {
    const cv = mk(W, H), c = cv.getContext('2d');
    const rand = rng(1234);

    // parede de tijolos
    R(c, 0, 0, W, 130, '#3b1c18');
    for (let row = 0, y = 0; y < 96; row++, y += 6) {
      const off = row % 2 ? 7 : 0;
      for (let x = -14 + off; x < W; x += 14) {
        const v = Math.floor(rand() * 28) - 10;
        R(c, x + 1, y + 1, 13, 5, `rgb(${96 + v},${44 + (v >> 1)},${36 + (v >> 1)})`);
      }
    }
    // faixa de madeira (lambri)
    R(c, 0, 92, W, 3, '#6b4026'); R(c, 0, 95, W, 2, '#2a170d');
    R(c, 0, 97, W, 33, '#3a2315');
    for (let x = 0; x < W; x += 10) { R(c, x, 97, 1, 33, '#2a170d'); R(c, x + 1, 97, 1, 33, '#4a2e1c'); }
    R(c, 0, 126, W, 4, '#26150b');

    // piso
    R(c, 0, 130, W, H - 130, '#6a4427');
    for (let y = 130, row = 0; y < H; y += 11, row++) {
      R(c, 0, y, W, 1, '#3f2814');
      const base = row % 2 ? '#6f492a' : '#654124';
      R(c, 0, y + 1, W, 10, base);
      for (let x = (row * 37) % 60; x < W; x += 54 + Math.floor(rand() * 30)) R(c, x, y + 1, 1, 10, '#3f2814');
      for (let i = 0; i < 6; i++) {
        const gx = Math.floor(rand() * W);
        R(c, gx, y + 2 + Math.floor(rand() * 7), 8 + Math.floor(rand() * 14), 1, rand() > 0.5 ? '#7a5230' : '#5a381e');
      }
    }
    R(c, 0, 130, W, 5, '#2a170d');

    // tapete do cantinho escondido
    R(c, 6, 266, 120, 88, '#2a1020');
    R(c, 9, 269, 114, 82, '#3b1730');
    for (let i = 0; i < 114; i += 6) R(c, 9 + i, 269, 2, 82, '#4a1d3a');

    // prateleiras com garrafas atrás do balcão
    for (const sy of [58, 82]) {
      R(c, 28, sy, 326, 3, '#2a170d'); R(c, 28, sy + 3, 326, 1, '#120804');
      for (let x = 34; x < 346; x += 7) {
        const hh = 11 + Math.floor(rand() * 6), hue = Math.floor(rand() * 5);
        const col = ['#2f8a3c', '#a86a1e', '#d9d2b8', '#7a1f1f', '#1f5fa8'][hue];
        R(c, x, sy - hh, 4, hh, col); R(c, x + 1, sy - hh - 3, 2, 3, col); R(c, x + 1, sy - hh + 3, 2, 3, 'rgba(255,255,255,.3)');
        R(c, x, sy - 1, 4, 1, 'rgba(0,0,0,.35)');
      }
    }
    // balcão
    R(c, 20, 104, 340, 7, '#b27a41'); R(c, 20, 104, 340, 2, '#d49a5c'); R(c, 20, 110, 340, 1, '#6b4320');
    R(c, 22, 111, 336, 26, '#4a2916');
    for (let x = 28; x < 356; x += 42) { R(c, x, 115, 36, 18, '#5b3520'); R(c, x + 1, 116, 34, 1, '#7a4a2c'); R(c, x, 132, 36, 1, '#2f180c'); }
    R(c, 22, 135, 336, 3, '#c9a24a'); R(c, 22, 138, 336, 1, '#6b5420');
    // torneiras
    for (let i = 0; i < 4; i++) {
      const x = 70 + i * 34;
      R(c, x, 96, 6, 9, '#c9a24a'); R(c, x + 1, 96, 1, 9, '#f0d78a'); R(c, x - 2, 92, 10, 4, '#b08a2e');
      R(c, x + 2, 82, 2, 10, ['#d33', '#37a', '#3a4', '#da3'][i]);
      R(c, x + 6, 100, 4, 2, '#c9a24a');
    }
    drawMugSmall(c, 40, 97); drawMugSmall(c, 220, 97); drawMugSmall(c, 250, 97); drawMugSmall(c, 320, 97);
    // banquetas
    for (let i = 0; i < 6; i++) {
      const x = 56 + i * 54, y = 146;
      R(c, x - 1, y + 4, 2, 10, '#222'); R(c, x - 5, y + 14, 10, 2, '#333');
      c.fillStyle = '#7a2424'; c.beginPath(); c.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#a13838'; c.beginPath(); c.ellipse(x, y + 1, 8, 3, 0, 0, Math.PI * 2); c.fill();
      R(c, x - 5, y + 4, 10, 2, '#5a1818');
    }

    // quadro do placar (texto é dinâmico)
    R(c, POSTER.x - 4, POSTER.y - 4, POSTER.w + 8, POSTER.h + 8, '#24130a');
    R(c, POSTER.x - 2, POSTER.y - 2, POSTER.w + 4, POSTER.h + 4, '#5b3a22');
    R(c, POSTER.x, POSTER.y, POSTER.w, POSTER.h, '#eadcb2');
    for (let i = 0; i < 160; i++) R(c, POSTER.x + Math.floor(rand() * POSTER.w), POSTER.y + Math.floor(rand() * POSTER.h), 2, 1, 'rgba(120,90,40,.12)');
    R(c, POSTER.x + 10, POSTER.y - 7, 22, 8, 'rgba(240,230,170,.85)'); R(c, POSTER.x + POSTER.w - 32, POSTER.y - 7, 22, 8, 'rgba(240,230,170,.85)');

    // jukebox
    {
      const x = 590, y = 72;
      R(c, x, y + 14, 38, 66, '#6a1d2e'); R(c, x + 2, y + 6, 34, 10, '#8a2840'); R(c, x + 5, y, 28, 8, '#a8344f');
      R(c, x + 6, y + 18, 26, 26, '#14102a');
      for (let i = 0; i < 5; i++) R(c, x + 8, y + 21 + i * 5, 22, 3, ['#e33', '#ea3', '#3b4', '#3ae', '#c4c'][i]);
      R(c, x + 6, y + 48, 26, 4, '#d8b24a');
      R(c, x + 9, y + 56, 20, 10, '#2a0e16'); R(c, x + 4, y + 70, 30, 10, '#4a1220');
      R(c, x + 3, y + 14, 2, 66, '#d8b24a'); R(c, x + 33, y + 14, 2, 66, '#d8b24a');
    }
    // sombra do rodapé
    const g = c.createLinearGradient(0, 130, 0, 150);
    g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 130, W, 20);
    return cv;
  }

  // ---------- Objetos ordenáveis por profundidade ----------
  function tableSprite() {
    const cv = mk(80, 52), c = cv.getContext('2d');
    for (const sx of [14, 66]) { // banquinhos
      R(c, sx - 1, 36, 2, 12, '#222'); R(c, sx - 5, 46, 10, 2, '#333');
      c.fillStyle = '#7a2424'; c.beginPath(); c.ellipse(sx, 36, 9, 4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#a13838'; c.beginPath(); c.ellipse(sx, 35, 8, 3, 0, 0, Math.PI * 2); c.fill();
    }
    R(c, 37, 32, 6, 16, '#3d2412'); R(c, 30, 46, 20, 3, '#2a170d');
    c.fillStyle = '#5a3920'; c.beginPath(); c.ellipse(40, 30, 25, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8f5d30'; c.beginPath(); c.ellipse(40, 27, 25, 10, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a56f3b'; c.beginPath(); c.ellipse(40, 26, 22, 8, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(70,40,15,.45)'; c.beginPath(); c.ellipse(40, 26, 14, 5, 0, 0, Math.PI * 2); c.stroke();
    drawMugSmall(c, 27, 17); drawMugSmall(c, 46, 20);
    R(c, 38, 21, 3, 3, '#e8d9a8'); R(c, 39, 19, 1, 2, '#ffb02e'); // vela
    return cv;
  }
  function cratesSprite() {
    const cv = mk(70, 44), c = cv.getContext('2d');
    const crate = (x, y) => {
      R(c, x, y, 26, 20, '#8a5a2b'); R(c, x, y, 26, 2, '#b07a40'); R(c, x, y + 18, 26, 2, '#5c3a1c');
      R(c, x + 12, y, 2, 20, '#5c3a1c'); R(c, x, y + 9, 26, 2, '#5c3a1c');
      for (let i = 0; i < 4; i++) R(c, x + 2 + i * 6, y - 2, 3, 3, ['#2f8a3c', '#a86a1e', '#7a1f1f', '#d9d2b8'][i]);
      R(c, x + 3, y + 3, 8, 5, '#f0c020'); R(c, x + 4, y + 4, 6, 1, '#a07810');
    };
    crate(3, 22); crate(31, 22); crate(17, 4);
    return cv;
  }
  function plantSprite() {
    const cv = mk(30, 44), c = cv.getContext('2d');
    R(c, 8, 30, 14, 12, '#7a3b22'); R(c, 6, 28, 18, 4, '#9a4c2c'); R(c, 9, 38, 12, 3, '#5a2a18');
    const leaf = (x, y, w, h, col) => R(c, x, y, w, h, col);
    leaf(14, 6, 3, 22, '#2d7a3a'); leaf(8, 12, 4, 14, '#38963f'); leaf(18, 10, 4, 16, '#38963f');
    leaf(5, 18, 4, 9, '#2d7a3a'); leaf(21, 16, 4, 11, '#2d7a3a'); leaf(12, 2, 6, 8, '#46ad4d');
    return cv;
  }

  const LIGHTS = [
    { x: 190, y: 112, r: 200, a: 0.95 },
    { x: 490, y: 70, r: 170, a: 0.9 },
    ...TABLES.map((t) => ({ x: t.x, y: t.y - 20, r: 115, a: 0.85 })),
    { x: 610, y: 120, r: 80, a: 0.75 },
    { x: 330, y: 150, r: 130, a: 0.5 },
  ];

  FT.world = {
    W, H, TABLES, HOMEM, POSTER, BOUNDS, CRATES, PLANT, SOLIDS, LIGHTS,
    resolve, renderBg,
    sprites: null,
    buildSprites() {
      this.sprites = { table: tableSprite(), crates: cratesSprite(), plant: plantSprite() };
    },
  };
})();
