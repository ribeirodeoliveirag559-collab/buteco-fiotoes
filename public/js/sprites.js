// Personagens em pixel art desenhados por código (nenhuma imagem externa).
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});
  const W = 40, H = 66; // tamanho do sprite; pés na linha 64

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shade(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + a, 0, 255), g = clamp(((n >> 8) & 255) + a, 0, 255), b = clamp((n & 255) + a, 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- Fonte 3x5 (estampas das camisas) ----------
  const FONT = {
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
    B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'],
    L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    N: ['XXX', 'X.X', 'X.X', 'X.X', 'X.X'],
    O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
    R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
    S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
    U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
    W: ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X'],
    Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
  };
  function drawText(g, str, x, y, col, shadow) {
    for (const pass of shadow ? [shadow, col] : [col]) {
      const off = pass === shadow && shadow !== col ? 1 : 0;
      let cx = x;
      for (let i = 0; i < str.length; i++) {
        const gl = FONT[str[i]];
        if (!gl) continue;
        for (let r = 0; r < 5; r++) for (let c = 0; c < gl[r].length; c++) {
          if (gl[r][c] === 'X') g.px(cx + c + off, y + r + off, 1, 1, pass);
        }
        cx += gl[0].length + 1;
      }
    }
  }
  function drawBitmap(g, rows, x, y, map) {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const k = rows[r][c];
      if (k !== '.' && map[k]) g.px(x + c, y + r, 1, 1, map[k]);
    }
  }

  // ---------- Catálogo ----------
  const SKINS = [
    { id: 'clara', label: 'Clara', c: '#f6d3b3' },
    { id: 'bronze', label: 'Bronzeada', c: '#e5b184' },
    { id: 'morena', label: 'Morena', c: '#c68a5c' },
    { id: 'marrom', label: 'Marrom', c: '#98623b' },
    { id: 'escura', label: 'Escura', c: '#62392a' },
  ];
  const HAIRCOLORS = [
    { id: 'preto', label: 'Preto', c: '#1c1714' },
    { id: 'castanho', label: 'Castanho', c: '#4b2e1b' },
    { id: 'loiro', label: 'Loiro', c: '#d8b25a' },
    { id: 'ruivo', label: 'Ruivo', c: '#b5491f' },
    { id: 'grisalho', label: 'Grisalho', c: '#b8b8bd' },
    { id: 'platinado', label: 'Platinado', c: '#f0ead2' },
  ];
  const EYES = [
    { id: 'normal', label: 'Normal' },
    { id: 'redondo', label: 'Redondo' },
    { id: 'sonolento', label: 'Sonolento' },
    { id: 'bravo', label: 'Bravo' },
    { id: 'piscadinha', label: 'Piscadinha' },
    { id: 'coracao', label: 'Apaixonado' },
    { id: 'sedutor', label: 'Sedutor', hidden: true },
  ];
  const MOUTHS = [
    { id: 'sorriso', label: 'Sorriso' },
    { id: 'serio', label: 'Sério' },
    { id: 'risada', label: 'Gargalhada' },
    { id: 'lingua', label: 'Sapeca' },
    { id: 'bigode', label: 'Bigodão' },
    { id: 'barba', label: 'Barbudo' },
    { id: 'batom', label: 'Batom', hidden: true },
  ];
  const HAIRS = [
    { id: 'ondulado', label: 'Ondulado' },
    { id: 'careca', label: 'Careca' },
    { id: 'curto', label: 'Curto' },
    { id: 'topete', label: 'Topete' },
    { id: 'mullet', label: 'Mullet' },
    { id: 'degrade', label: 'Degradê' },
    { id: 'oldmoney', label: 'Old Money' },
    { id: 'longo', label: 'Longo', hidden: true },
  ];

  // ---------- Peças de desenho compartilhadas ----------
  function torso(g, color) {
    const { px, mx } = g;
    px(10, 28, 20, 17, color);
    mx(10, 28, 2, 17, shade(color, -16));
    px(16, 28, 8, 2, shade(color, -34)); // gola
    px(17, 28, 6, 1, g.neck);
  }
  function sleeves(g, color, len, cuff) {
    const { px } = g;
    const L = g.sl, R = g.sr;
    px(5, 28 + L, 5, len, color);
    px(5, 28 + L, 1, len, shade(color, -16));
    const rl = g.raised ? Math.min(len, 10) : len;
    px(30, 28 + R, 5, rl, color);
    px(34, 28 + R, 1, rl, shade(color, -16));
    if (cuff) {
      px(5, 28 + L + len - 2, 5, 2, cuff);
      if (!g.raised) px(30, 28 + R + len - 2, 5, 2, cuff);
    }
  }
  function collarV(g, col, edge) {
    const { px } = g;
    // colarinho aberto (camisa de botão)
    px(15, 28, 4, 3, col); px(21, 28, 4, 3, col);
    px(16, 31, 2, 1, col); px(22, 31, 2, 1, col);
    px(17, 28, 6, 2, g.neck);
    px(19, 30, 2, 1, g.neck);
    if (edge) { px(15, 31, 1, 1, edge); px(24, 31, 1, 1, edge); }
  }

  // ---------- CAMISAS ----------
  function teeShirt(color, opts) {
    opts = opts || {};
    return function (g) {
      torso(g, color);
      sleeves(g, opts.sleeve || color, 8, opts.cuff);
      if (opts.collar) g.px(16, 28, 8, 1, opts.collar);
      if (!g.back && opts.print) opts.print(g);
      return { sleeve: null };
    };
  }
  const LEAF = [
    '......X......',
    '.....XXX.....',
    '..X..XXX..X..',
    '..XX.XXX.XX..',
    'X.XXXXXXXXX.X',
    'XXXXXXXXXXXXX',
    '.XXXXXXXXXXX.',
    '..XXXXXXXXX..',
    '....XXXXX....',
    '.....XXX.....',
    '......S......',
    '......S......',
  ];

  function shirtCowboy(g) {
    const base = '#8e2a2f', cream = '#f1e3c0', dk = shade(base, -26);
    const { px, mx } = g;
    torso(g, base);
    sleeves(g, base, 17, dk);
    if (!g.back) {
      collarV(g, cream, dk);
      px(19, 31, 2, 14, shade(base, -14));
      for (let y = 33; y < 45; y += 3) px(19, y, 1, 1, '#fff');
      // pala western (V) e bolsos
      for (let i = 0; i < 6; i++) { px(11 + i, 30 + i, 1, 1, cream); px(28 - i, 30 + i, 1, 1, cream); }
      mx(12, 37, 5, 1, cream); mx(12, 37, 1, 4, cream); mx(16, 37, 1, 4, cream); mx(12, 40, 5, 1, cream);
    } else {
      px(10, 28, 20, 4, shade(base, 8));
      for (let i = 0; i < 8; i++) { px(11 + i, 31 + (i >> 1), 1, 1, cream); px(28 - i, 31 + (i >> 1), 1, 1, cream); }
    }
    return { sleeve: base, cuff: dk };
  }

  const MACONHA = teeShirt('#17171a', {
    print: (g) => drawBitmap(g, LEAF, 14, 31, { X: '#3fb33a', S: '#2c7a2a' }),
  });
  const AURA = teeShirt('#17171a', {
    print: (g) => {
      drawText(g, 'AURA', 13, 34, '#d9c4ff', '#6a3dc9');
      g.px(13, 41, 15, 1, '#6a3dc9');
    },
  });
  const BABYDOW = teeShirt('#f8c5dc', {
    print: (g) => {
      drawText(g, 'BABY', 13, 32, '#e0337e', '#fff');
      drawText(g, 'DOW', 14, 39, '#e0337e', '#fff');
    },
  });
  const BOLSONARO = teeShirt('#1f9d46', {
    collar: '#ffd91a', cuff: '#ffd91a',
    print: (g) => {
      drawText(g, 'BOLSO', 11, 32, '#ffd91a', '#0d5a25');
      drawText(g, 'NARO', 13, 39, '#ffd91a', '#0d5a25');
    },
  });
  const BRANCA = teeShirt('#f4f4f2', { collar: '#d9d9d6' });

  function xadrez(base) {
    const dk = shade(base, -45), mid = shade(base, -22), lt = shade(base, 30);
    return function (g) {
      const { px } = g;
      torso(g, base);
      sleeves(g, base, 9);
      // padrão xadrez
      const plaid = (x0, y0, w, h) => {
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
          const vx = x % 4 === 0, hy = y % 4 === 0;
          if (vx && hy) px(x, y, 1, 1, dk);
          else if (vx || hy) px(x, y, 1, 1, mid);
          else if ((x + y) % 7 === 0) px(x, y, 1, 1, lt);
        }
      };
      plaid(10, 30, 20, 15);
      plaid(5, 29, 5, 8);
      plaid(30, 29, 5, g.raised ? 8 : 8);
      if (!g.back) {
        collarV(g, shade(base, 18), dk);
        for (let y = 33; y < 45; y += 3) px(19, y, 1, 1, '#f1f1f1');
      }
      return { sleeve: null };
    };
  }

  function sobretudo(g) {
    const base = '#2c2824', dk = '#1b1815';
    const { px, mx } = g;
    torso(g, base);
    sleeves(g, base, 17, dk);
    px(10, 45, 20, 14, base); // aba do casaco por cima das pernas
    mx(10, 45, 2, 14, dk);
    px(19, 30, 2, 29, dk);
    if (!g.back) {
      mx(14, 28, 3, 8, '#3d3732');
      for (let y = 34; y < 56; y += 5) px(21, y, 1, 1, '#9a8f7e');
    }
    return { sleeve: base, cuff: dk };
  }

  function biquini(topColor, o) {
    o = o || {};
    return function (g) {
      const { px, mx } = g;
      const sk = g.skinC;
      px(10, 28, 20, 17, sk); mx(10, 28, 2, 17, shade(sk, -14));
      px(17, 28, 6, 1, g.neck);
      if (!g.back) {
        if (o.crop) { px(11, 30, 18, 7, topColor); mx(11, 36, 4, 1, topColor); px(15, 36, 10, 1, shade(topColor, -25)); px(19, 30, 2, 2, g.neck); }
        else { mx(13, 31, 6, 2, topColor); mx(14, 33, 4, 1, topColor); mx(15, 34, 2, 1, topColor); px(19, 32, 2, 1, topColor); }
        mx(15, 28, 1, 3, topColor);
        px(20, 41, 1, 1, shade(sk, -45));
        if (o.glitter) for (let i = 0; i < 9; i++) px(13 + ((i * 7) % 14), 31 + ((i * 3) % 5), 1, 1, '#fff6c8');
      } else { px(10, 32, 20, 1, topColor); px(17, 28, 1, 4, topColor); px(22, 28, 1, 4, topColor); if (o.crop) px(11, 30, 18, 6, topColor); }
      return { sleeve: null };
    };
  }
  function vestido(color, glitter) {
    return function (g) {
      const { px, mx } = g;
      const sk = g.skinC;
      px(10, 28, 20, 17, sk); mx(10, 28, 2, 17, shade(sk, -14)); px(17, 28, 6, 1, g.neck);
      px(11, 31, 18, 14, color); mx(11, 31, 2, 14, shade(color, -22));
      mx(14, 28, 2, 3, color);
      if (!g.back) { px(17, 31, 6, 1, sk); px(18, 32, 4, 1, sk); }
      px(10, 45, 20, 8, color); mx(10, 45, 2, 8, shade(color, -22));
      px(10, 52, 20, 1, shade(color, 40));
      if (glitter) for (let i = 0; i < 22; i++) px(11 + ((i * 11) % 18), 33 + ((i * 5) % 19), 1, 1, '#fff2b0');
      return { sleeve: null };
    };
  }
  const SHIRTS = [
    { id: 'cowboy', label: 'Cowboy comprida', draw: shirtCowboy },
    { id: 'branca', label: 'Camisa branca', draw: BRANCA },
    { id: 'maconha', label: 'Folha verde', draw: MACONHA },
    { id: 'aura', label: 'AURA', draw: AURA },
    { id: 'babydow', label: 'BABY DOW', draw: BABYDOW },
    { id: 'bolsonaro', label: 'BOLSONARO', draw: BOLSONARO },
    { id: 'xadrez-vermelho', label: 'Xadrez vermelha', draw: xadrez('#c0392b'), c: '#c0392b' },
    { id: 'xadrez-azul', label: 'Xadrez azul', draw: xadrez('#2f6fd0'), c: '#2f6fd0' },
    { id: 'xadrez-verde', label: 'Xadrez verde', draw: xadrez('#2e8b57'), c: '#2e8b57' },
    { id: 'xadrez-amarelo', label: 'Xadrez amarela', draw: xadrez('#d8aa1c'), c: '#d8aa1c' },
    { id: 'xadrez-roxo', label: 'Xadrez roxa', draw: xadrez('#7d3fa8'), c: '#7d3fa8' },
    { id: 'xadrez-laranja', label: 'Xadrez laranja', draw: xadrez('#e07a1f'), c: '#e07a1f' },
    { id: 'sobretudo', label: 'Sobretudo', draw: sobretudo, hidden: true },
    { id: 'biquini-rosa', label: 'Top', draw: biquini('#ff4f9d'), hidden: true },
    { id: 'biquini-azul', label: 'Top', draw: biquini('#38b6ff'), hidden: true },
    { id: 'biquini-amarelo', label: 'Top', draw: biquini('#ffd23a'), hidden: true },
    { id: 'top-preto', label: 'Top', draw: biquini('#17171c', { crop: true, glitter: true }), hidden: true },
    { id: 'top-neon', label: 'Top', draw: biquini('#7aff5a', { crop: true }), hidden: true },
    { id: 'vestido-vermelho', label: 'Vestido', draw: vestido('#d0142e', true), hidden: true },
    { id: 'vestido-dourado', label: 'Vestido', draw: vestido('#d9a52a', true), hidden: true },
  ];

  // ---------- CALÇAS ----------
  function pantsSolid(color, stitch) {
    return {
      long: true, c: color,
      hip(g) {
        const { px, mx } = g;
        px(11, 45, 18, 6, color);
        mx(11, 45, 2, 6, shade(color, -14));
        px(11, 45, 18, 2, '#3a2416'); px(19, 45, 2, 2, '#d8b24a');
        mx(14, 48, 4, 1, stitch); mx(14, 48, 1, 3, stitch);
        px(20, 49, 1, 3, shade(color, -22));
      },
      leg(g, x0, dy) {
        const { px } = g;
        px(x0, 51, 8, 7 + dy, color);
        px(x0 + (x0 < 20 ? 0 : 7), 51, 1, 7 + dy, shade(color, -16));
        px(x0, 57 + dy, 8, 1, shade(color, -26));
        px(x0 + 3, 54 + dy, 1, 2, shade(color, 10)); // vinco
      },
    };
  }
  function bermuda(color, hem, monogram, botY) {
    return {
      long: false, c: color,
      hip(g) {
        const { px, mx } = g;
        px(11, 45, 18, 6, color);
        mx(11, 45, 2, 6, shade(color, -14));
        px(11, 45, 18, 2, shade(color, -30));
        px(19, 45, 2, 2, '#d8b24a');
        px(20, 48, 1, 3, shade(color, -22));
        if (monogram) {
          for (let y = 47; y < 51; y++) for (let x = 12; x < 28; x++) {
            if ((x + (y % 2) * 2) % 4 === 0 && y % 2 === 1) g.px(x, y, 1, 1, '#f1d27a');
            else if ((x + (y % 2) * 2) % 4 === 2 && y % 2 === 0) g.px(x, y, 1, 1, '#ffffff');
          }
          g.px(12, 49, 3, 2, '#f1d27a'); g.px(13, 49, 1, 1, color);
        }
      },
      leg(g, x0, dy) {
        const { px } = g;
        const bot = (botY || 55) + dy;
        px(x0, 51, 8, bot - 51, color);
        px(x0 + (x0 < 20 ? 0 : 7), 51, 1, bot - 51, shade(color, -16));
        px(x0, bot - 1, 8, 1, hem);
        if (monogram) {
          for (let y = 52; y < bot - 1; y++) for (let x = x0; x < x0 + 8; x++) {
            if ((x + (y % 2) * 2) % 4 === 0 && y % 2 === 1) px(x, y, 1, 1, '#f1d27a');
            else if ((x + (y % 2) * 2) % 4 === 2 && y % 2 === 0) px(x, y, 1, 1, '#ffffff');
          }
        }
      },
    };
  }
  const PANTS = [
    Object.assign({ id: 'jeans-azul', label: 'Jeans azul' }, pantsSolid('#2c4f9e', '#e0b84c')),
    Object.assign({ id: 'preta', label: 'Preta escura' }, pantsSolid('#1d1d22', '#4a4a54')),
    Object.assign({ id: 'jeans-claro', label: 'Jeans clara' }, pantsSolid('#7aa3d8', '#f4e7a8')),
    Object.assign({ id: 'bermuda-rosa', label: 'Bermuda rosa' }, bermuda('#ef6aa7', '#ff9cc7', false)),
    Object.assign({ id: 'bermuda-grife', label: 'Bermuda de grife' }, bermuda('#1f4fb0', '#f1d27a', true)),
    Object.assign({ id: 'short-jeans', label: 'Short jeans', hidden: true }, bermuda('#5b86c4', '#b9d2ee', false, 53)),
    Object.assign({ id: 'short-preto', label: 'Short', hidden: true }, bermuda('#16161a', '#c9a24a', false, 53)),
    Object.assign({ id: 'short-dourado', label: 'Short', hidden: true }, bermuda('#d8a830', '#fff0a0', false, 53)),
  ];

  // ---------- CALÇADOS ----------
  const SHOES = [
    {
      id: 'americana', label: 'Bota americana',
      draw(g, x0, dy) {
        const { px } = g;
        const b = '#8b5a2b', d = '#5c3a1c', l = '#d4a566';
        px(x0, 56 + dy, 8, 5, b);
        px(x0 + (x0 < 20 ? 0 : 7), 56 + dy, 1, 5, d);
        px(x0 + 2, 57 + dy, 1, 1, l); px(x0 + 5, 57 + dy, 1, 1, l); px(x0 + 3, 58 + dy, 2, 1, l);
        px(x0 - 1, 60 + dy, 10, 3, b); // bico quadrado
        px(x0 - 1, 60 + dy, 10, 1, shade(b, 22));
        px(x0, 61 + dy, 8, 1, d);
        px(x0 - 1, 63 + dy, 10, 1, '#2a1a10');
      },
    },
    {
      id: 'bico-fino', label: 'Bota bico fino',
      draw(g, x0, dy) {
        const { px } = g;
        const b = '#3a2216', hl = '#7d5238';
        px(x0, 56 + dy, 8, 4, b);
        px(x0 + 1, 57 + dy, 1, 2, hl);
        px(x0, 60 + dy, 8, 1, b);
        px(x0 + 1, 61 + dy, 6, 1, b);
        px(x0 + 2, 62 + dy, 4, 1, b);
        px(x0 + 3, 63 + dy, 2, 1, '#1a0f09');
        px(x0 + 1, 60 + dy, 2, 1, hl);
        px(x0 + 2, 59 + dy, 1, 1, '#c9a26a'); px(x0 + 5, 59 + dy, 1, 1, '#c9a26a'); // bordado
      },
    },
    {
      id: 'botina-amarela', label: 'Botina amarela',
      draw(g, x0, dy) {
        const { px } = g;
        const y = '#e6b422', yd = '#b8860b';
        px(x0, 57 + dy, 8, 4, y);
        px(x0, 57 + dy, 8, 1, yd);
        px(x0 + 2, 58 + dy, 4, 1, '#fff'); px(x0 + 2, 60 + dy, 4, 1, '#fff'); px(x0 + 3, 59 + dy, 2, 1, '#7a5a08');
        px(x0 - 1, 60 + dy, 10, 3, y); // bico arredondado e gordinho
        px(x0 - 1, 60 + dy, 10, 1, shade(y, 24));
        px(x0 - 1, 62 + dy, 10, 1, yd);
        px(x0 - 1, 63 + dy, 10, 1, '#f1e6c8');
        px(x0 - 1, 64 + dy - 0, 0, 0, '#000');
      },
    },
    {
      id: 'chinelo-couro', label: 'Chinelo de couro',
      draw(g, x0, dy) {
        const { px } = g;
        const lea = '#9b6a3c', strap = '#5a3a20';
        px(x0 + 1, 57 + dy, 6, 6, g.skin);
        px(x0 + 1, 57 + dy, 1, 6, shade(g.skin, -14));
        px(x0 - 1, 62 + dy, 10, 2, lea); // sola
        px(x0 - 1, 63 + dy, 10, 1, shade(lea, -30));
        px(x0, 59 + dy, 8, 1, strap); // tira
        px(x0 + 3, 59 + dy, 2, 4, strap); // entre os dedos
        for (let i = 0; i < 4; i++) px(x0 + 1 + i * 2, 62 + dy, 1, 1, shade(g.skin, -26));
      },
    },
    {
      id: 'sandalia-quadrada', label: 'Sandália quadrada',
      draw(g, x0, dy) {
        const { px } = g;
        const sole = '#2b2b2b', tan = '#d8b27a';
        px(x0 + 1, 57 + dy, 6, 6, g.skin);
        px(x0 + 1, 57 + dy, 1, 6, shade(g.skin, -14));
        px(x0 - 1, 62 + dy, 10, 2, sole); // sola quadradona
        px(x0, 58 + dy, 8, 1, tan);       // tira do tornozelo
        px(x0 + 3, 58 + dy, 2, 1, '#e8c94a'); // fivela
        px(x0, 60 + dy, 8, 1, tan);       // tira quadrada do peito do pé
        px(x0, 60 + dy, 1, 3, tan); px(x0 + 7, 60 + dy, 1, 3, tan);
        for (let i = 0; i < 4; i++) px(x0 + 1 + i * 2, 62 + dy, 1, 1, shade(g.skin, -26));
      },
    },
  ];

  // ---------- CHAPÉUS / BONÉS ----------
  function strawHat(base, dark, band) {
    return function (g) {
      const { px, mx } = g;
      px(14, 1, 12, 1, base);
      px(13, 2, 14, 7, base);
      px(19, 1, 2, 3, dark); // vinco no topo
      mx(13, 2, 1, 7, dark);
      px(13, 7, 14, 2, band);
      px(5, 9, 30, 3, base); // aba
      mx(3, 8, 5, 2, base); // pontas viradas pra cima
      mx(2, 7, 2, 2, base);
      px(7, 12, 26, 1, dark);
      mx(3, 10, 3, 1, dark);
      for (let x = 14; x < 26; x += 2) { px(x, 3, 1, 1, dark); px(x + 1, 5, 1, 1, dark); }
      for (let x = 6; x < 34; x += 3) px(x, 10, 1, 1, dark);
      px(13, 13, 14, 1, 'rgba(0,0,0,.22)');
    };
  }
  function felt(base, dark, band, accent) {
    return function (g) {
      const { px, mx } = g;
      px(14, 1, 12, 1, base);
      px(13, 2, 14, 7, base);
      px(17, 1, 6, 2, dark);
      mx(13, 2, 1, 7, dark);
      px(19, 3, 2, 1, dark);
      px(13, 7, 14, 2, band);
      px(19, 7, 2, 2, accent);
      px(5, 9, 30, 3, base);
      mx(3, 8, 5, 2, base);
      mx(2, 7, 2, 2, base);
      px(7, 12, 26, 1, dark);
      px(13, 13, 14, 1, 'rgba(0,0,0,.28)');
      px(15, 3, 3, 1, shade(base, 28));
    };
  }
  function magnata(g) {
    const { px, mx } = g;
    const base = '#fbfaf4', sh = '#d8d5c6', gold = '#d9a92a';
    px(15, 0, 10, 1, base);
    px(13, 1, 14, 8, base);
    px(18, 0, 4, 3, sh); px(19, 3, 2, 1, sh);
    mx(13, 1, 1, 8, sh);
    px(13, 6, 14, 3, gold);
    px(13, 6, 14, 1, shade(gold, 30));
    px(18, 6, 4, 3, '#fff0a8'); px(19, 7, 2, 1, '#b5851a');
    px(4, 9, 32, 3, base);
    mx(2, 8, 5, 2, base);
    mx(1, 7, 2, 2, base);
    px(6, 12, 28, 1, gold);
    mx(2, 10, 4, 1, sh);
    px(13, 13, 14, 1, 'rgba(0,0,0,.22)');
  }
  function cap(color) {
    const d = shade(color, -38), l = shade(color, 26);
    return function (g) {
      const { px, mx } = g;
      px(15, 5, 10, 1, color);
      px(13, 6, 14, 1, color);
      px(12, 7, 16, 4, color);
      mx(12, 7, 1, 4, d);
      px(19, 5, 2, 1, d);
      px(14, 6, 3, 1, l);
      px(19, 6, 1, 5, d); // costura central
      if (!g.back) {
        px(18, 8, 4, 2, l);
        px(12, 11, 16, 1, d);
        px(9, 12, 22, 2, shade(color, -14)); // aba vista de frente
        px(10, 14, 20, 1, d);
        px(11, 15, 18, 1, 'rgba(0,0,0,.3)');
        px(10, 12, 3, 1, l);
      } else {
        px(12, 11, 16, 1, d);
        px(14, 11, 12, 1, d);
        px(18, 11, 4, 1, '#c8c8c8');
      }
    };
  }
  const CAPS = [
    ['vermelho', 'Boné vermelho', '#d93a3a'],
    ['azul', 'Boné azul', '#2f6fd0'],
    ['preto', 'Boné preto', '#26262b'],
    ['verde', 'Boné verde', '#2e9b57'],
    ['branco', 'Boné branco', '#eeeeee'],
    ['amarelo', 'Boné amarelo', '#f0c020'],
    ['rosa', 'Boné rosa', '#ee6fb0'],
  ];
  const HATS = [
    { id: 'nenhum', label: 'Nenhum', draw: null },
    { id: 'palha-branco', label: 'Palha branco', draw: strawHat('#f1ebd8', '#cdc3a4', '#6b4a2b') },
    { id: 'palha-amarelo', label: 'Palha amarelo', draw: strawHat('#e5c04a', '#b8962a', '#6b4a2b') },
    { id: 'cowboy-preto', label: 'Cowboy preto', draw: felt('#1b1b20', '#0d0d10', '#3b3b44', '#c9c9d0') },
    { id: 'magnata', label: 'Magnata branco', draw: magnata },
  ].concat(CAPS.map(([k, label, c]) => ({ id: 'bone-' + k, label, draw: cap(c), c })));

  // ---------- ÓCULOS ----------
  const GLASSES = [
    { id: 'nenhum', label: 'Nenhum', draw: null },
    {
      id: 'grau', label: 'Óculos de grau',
      draw(g) {
        const { px, mx } = g;
        const f = '#2b2b30';
        mx(13, 16, 6, 5, 'rgba(190,225,255,.28)');
        px(13, 16, 6, 1, f); px(13, 20, 6, 1, f); px(13, 16, 1, 5, f); px(18, 16, 1, 5, f);
        px(21, 16, 6, 1, f); px(21, 20, 6, 1, f); px(21, 16, 1, 5, f); px(26, 16, 1, 5, f);
        px(19, 17, 2, 1, f);
        mx(11, 17, 3, 1, f);
        px(14, 17, 1, 1, 'rgba(255,255,255,.7)'); px(22, 17, 1, 1, 'rgba(255,255,255,.7)');
      },
    },
    {
      id: 'sol', label: 'Óculos de sol quadrado',
      draw(g) {
        const { px, mx } = g;
        mx(13, 16, 6, 5, 'rgba(10,10,16,.9)');
        mx(13, 16, 6, 1, '#08080b');
        px(19, 17, 2, 1, '#08080b');
        mx(11, 17, 3, 1, '#08080b');
        px(14, 17, 2, 1, 'rgba(255,255,255,.4)'); px(22, 17, 2, 1, 'rgba(255,255,255,.4)');
      },
    },
  ];

  const byId = (arr) => Object.fromEntries(arr.map((o) => [o.id, o]));
  const IDX = {
    skin: byId(SKINS), hairColor: byId(HAIRCOLORS), eyes: byId(EYES), mouth: byId(MOUTHS), hair: byId(HAIRS),
    shirt: byId(SHIRTS), pants: byId(PANTS), shoes: byId(SHOES), hat: byId(HATS), glasses: byId(GLASSES),
  };

  // ---------- Cabelos ----------
  function hairFront(g, id) {
    const { px, mx } = g;
    const h = g.hair, hd = shade(h, -26), hl = shade(h, 30);
    switch (id) {
      case 'careca':
        px(16, 11, 3, 1, 'rgba(255,255,255,.35)');
        mx(12, 11, 1, 5, 'rgba(0,0,0,.14)');
        break;
      case 'curto':
        px(13, 8, 14, 1, h); px(11, 9, 18, 3, h); px(12, 12, 16, 1, h);
        mx(11, 12, 2, 7, h); px(13, 13, 3, 1, h); px(24, 13, 3, 1, h);
        px(15, 9, 4, 1, hl);
        break;
      case 'ondulado':
        px(12, 7, 16, 1, h); px(10, 8, 20, 5, h); px(11, 13, 18, 1, h);
        mx(9, 10, 3, 13, h);
        px(12, 13, 3, 2, h); px(17, 13, 2, 1, h); px(23, 13, 5, 2, h);
        px(13, 9, 4, 1, hl); px(20, 8, 5, 1, hl); px(15, 11, 3, 1, hd); px(23, 11, 3, 1, hd);
        mx(9, 15, 1, 1, hd); mx(10, 18, 1, 1, hd); mx(9, 21, 1, 1, hd);
        mx(10, 22, 2, 1, h);
        break;
      case 'topete':
        px(16, 2, 12, 1, h); px(14, 3, 15, 2, h); px(12, 5, 17, 6, h);
        px(12, 11, 16, 2, h); px(21, 13, 7, 1, h);
        mx(11, 11, 2, 3, h); mx(11, 14, 2, 3, hd);
        px(17, 3, 6, 1, hl); px(15, 6, 8, 1, hl); px(26, 4, 2, 1, hl);
        break;
      case 'mullet':
        px(13, 8, 14, 1, h); px(11, 9, 18, 3, h); px(12, 12, 16, 1, h);
        px(13, 13, 3, 1, h); px(24, 13, 3, 1, h);
        mx(10, 12, 2, 17, h);
        mx(9, 24, 2, 7, h);
        px(15, 9, 4, 1, hl);
        mx(10, 18, 1, 1, hd); mx(9, 27, 1, 1, hd);
        break;
      case 'degrade':
        px(14, 6, 12, 1, h); px(12, 7, 16, 5, h); px(12, 12, 16, 1, h);
        mx(12, 13, 2, 3, h);
        mx(12, 16, 2, 2, rgba(h, 0.6));
        mx(12, 18, 2, 2, rgba(h, 0.32));
        px(14, 13, 12, 1, rgba(h, 0.5));
        px(16, 8, 5, 1, hl);
        break;
      case 'longo':
        px(12, 7, 16, 1, h); px(10, 8, 20, 5, h); px(11, 13, 18, 1, h);
        mx(9, 10, 4, 25, h);
        px(12, 13, 9, 2, h); px(21, 13, 2, 1, h); px(24, 13, 4, 2, h);
        px(14, 9, 5, 1, hl); px(22, 8, 4, 1, hl); mx(10, 20, 1, 6, hd); mx(10, 30, 1, 4, hd);
        break;
      case 'oldmoney':
        px(13, 8, 14, 1, h); px(11, 9, 18, 3, h); px(12, 12, 16, 1, h);
        mx(11, 12, 2, 6, h);
        px(14, 9, 10, 1, hd); px(13, 11, 12, 1, hd); px(16, 9, 1, 3, hd);
        px(18, 10, 6, 1, hl);
        break;
    }
  }
  function hairBack(g, id) {
    const { px, mx } = g;
    const h = g.hair, hd = shade(h, -26), hl = shade(h, 30);
    switch (id) {
      case 'careca': px(15, 11, 4, 1, 'rgba(255,255,255,.3)'); break;
      case 'curto':
        px(13, 8, 14, 1, h); px(11, 9, 18, 12, h); px(13, 21, 14, 1, h); px(15, 10, 4, 1, hl);
        break;
      case 'ondulado':
        px(12, 7, 16, 1, h); px(10, 8, 20, 15, h);
        px(10, 23, 4, 1, h); px(16, 23, 3, 1, h); px(22, 23, 8, 1, h);
        px(13, 10, 4, 1, hl); px(20, 9, 5, 1, hl); px(14, 15, 4, 1, hd); px(22, 17, 5, 1, hd);
        break;
      case 'topete':
        px(15, 2, 13, 1, h); px(13, 3, 16, 3, h); px(11, 6, 18, 15, h); px(17, 4, 6, 1, hl);
        break;
      case 'mullet':
        px(13, 8, 14, 1, h); px(11, 9, 18, 12, h); px(10, 21, 20, 11, h);
        px(12, 32, 5, 1, h); px(21, 32, 6, 1, h); px(14, 15, 4, 1, hd); px(20, 25, 5, 1, hd);
        break;
      case 'degrade':
        px(12, 7, 16, 6, h); px(12, 13, 16, 3, h);
        px(12, 16, 16, 2, rgba(h, 0.6)); px(13, 18, 14, 2, rgba(h, 0.3)); px(16, 8, 5, 1, hl);
        break;
      case 'longo':
        px(12, 7, 16, 1, h); px(10, 8, 20, 29, h); px(14, 20, 4, 1, hd); px(22, 28, 5, 1, hd); px(13, 12, 5, 1, hl);
        break;
      case 'oldmoney':
        px(12, 8, 16, 9, h); px(13, 17, 14, 3, rgba(h, 0.6));
        px(14, 10, 12, 1, hd); px(14, 13, 12, 1, hd); px(15, 9, 8, 1, hl);
        break;
    }
  }

  // ---------- Rosto ----------
  function drawEyes(g, type) {
    const { px } = g;
    const white = g.red ? '#e5303f' : '#ffffff';
    const pup = '#1a1a22';
    const brow = shade(g.hair, -8);
    const eye = (x, y) => { px(x, y, 3, 3, white); px(x + 1, y, 1, 3, pup); };
    switch (type) {
      case 'redondo':
        for (const x of [14, 22]) {
          px(x, 16, 4, 4, white); px(x + 1, 17, 2, 3, pup);
          px(x + 1, 17, 1, 1, g.red ? '#ff9aa0' : '#fff');
        }
        break;
      case 'sedutor':
        for (const x of [15, 22]) {
          px(x, 17, 3, 1, '#2a1818');
          px(x, 18, 3, 1, white); px(x + 1, 18, 1, 1, '#2f7bd6');
          px(x, 19, 3, 1, 'rgba(120,60,60,.25)');
        }
        px(14, 16, 1, 1, '#2a1818'); px(25, 16, 1, 1, '#2a1818'); px(14, 17, 1, 1, '#2a1818'); px(25, 17, 1, 1, '#2a1818');
        px(15, 14, 2, 1, brow); px(23, 14, 2, 1, brow); px(14, 15, 1, 1, brow); px(25, 15, 1, 1, brow);
        break;
      case 'sonolento':
        for (const x of [15, 22]) {
          px(x, 17, 3, 1, shade(g.skinC, -70));
          px(x, 18, 3, 1, white); px(x + 1, 18, 1, 1, pup);
          px(x, 19, 3, 1, shade(g.skinC, -22));
        }
        break;
      case 'bravo':
        eye(15, 17); eye(22, 17);
        px(14, 15, 2, 1, brow); px(16, 16, 2, 1, brow);
        px(24, 15, 2, 1, brow); px(22, 16, 2, 1, brow);
        break;
      case 'piscadinha':
        eye(15, 17);
        px(22, 18, 3, 1, pup); px(25, 17, 1, 1, pup); px(22, 19, 1, 1, shade(g.skinC, -30));
        break;
      case 'coracao': {
        const hc = g.red ? '#c0102a' : '#ff3a6e';
        for (const x of [14, 21]) {
          px(x, 16, 2, 1, hc); px(x + 3, 16, 2, 1, hc);
          px(x, 17, 5, 1, hc); px(x + 1, 18, 3, 1, hc); px(x + 2, 19, 1, 1, hc);
          px(x + 1, 16, 1, 1, '#ffd0dc');
        }
        break;
      }
      default:
        eye(15, 17); eye(22, 17);
    }
  }
  function drawMouth(g, type) {
    const { px } = g;
    const dk = '#6b2a2a', h = g.hair;
    switch (type) {
      case 'serio': px(17, 23, 6, 1, dk); break;
      case 'batom':
        px(17, 22, 1, 1, '#a8183a'); px(22, 22, 1, 1, '#a8183a');
        px(18, 23, 4, 1, '#d4284c'); px(19, 24, 2, 1, '#b01a3a'); px(19, 23, 1, 1, '#ff9ab0');
        break;
      case 'risada':
        px(16, 22, 8, 3, '#5a1a1a'); px(16, 22, 8, 1, '#fff'); px(18, 24, 4, 1, '#e8607a');
        break;
      case 'lingua':
        px(17, 22, 1, 1, dk); px(22, 22, 1, 1, dk); px(18, 23, 4, 1, dk);
        px(19, 24, 3, 2, '#e8607a'); px(20, 24, 1, 1, '#c24a64');
        break;
      case 'bigode':
        px(15, 21, 10, 2, h); px(14, 22, 1, 2, h); px(25, 22, 1, 2, h);
        px(18, 24, 4, 1, dk);
        break;
      case 'barba':
        px(12, 20, 3, 4, h); px(25, 20, 3, 4, h);
        px(13, 24, 14, 2, h); px(14, 26, 12, 1, h); px(15, 27, 10, 1, h);
        px(14, 21, 12, 1, h); px(15, 22, 2, 2, h); px(23, 22, 2, 2, h);
        px(15, 24, 10, 1, h);
        px(17, 23, 6, 1, '#3a1818'); px(18, 24, 4, 1, '#3a1818');
        break;
      default: // sorriso
        px(17, 22, 1, 1, dk); px(22, 22, 1, 1, dk); px(18, 23, 4, 1, dk);
    }
  }

  // ---------- Canecas / baseado ----------
  function drawMug(g) {
    const { px } = g;
    px(22, 15, 9, 3, '#fff8e6');       // espuma
    px(21, 16, 1, 1, '#fff8e6'); px(31, 16, 1, 1, '#fff8e6');
    px(22, 18, 9, 10, '#f2b01e');      // cerveja
    px(22, 18, 1, 10, '#fad25a');
    px(30, 18, 1, 10, '#c98a0c');
    px(22, 24, 9, 1, '#d99a12');
    px(21, 17, 1, 11, 'rgba(230,245,255,.75)'); px(31, 17, 1, 11, 'rgba(230,245,255,.75)');
    px(21, 28, 11, 1, 'rgba(230,245,255,.85)');
    px(32, 19, 3, 1, 'rgba(230,245,255,.85)'); px(34, 19, 1, 6, 'rgba(230,245,255,.85)'); px(32, 24, 3, 1, 'rgba(230,245,255,.85)'); // alça
    px(24, 20, 1, 5, 'rgba(255,255,255,.55)');
  }
  function drawJoint(g) {
    const { px } = g;
    px(21, 22, 7, 1, '#f4f1e6');
    px(21, 23, 7, 1, '#cfc9b4');
    px(20, 22, 1, 2, '#ff7a1a'); px(19, 22, 1, 1, '#ffd24a');
  }

  // ---------- Montagem do sprite ----------
  function render(look, dir, frame, pose, red) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
    const mx = (x, y, w, h, col) => { px(x, y, w, h, col); px(W - x - w, y, w, h, col); };
    const skinC = (IDX.skin[look.skin] || SKINS[1]).c;
    const hairC = (IDX.hairColor[look.hairColor] || HAIRCOLORS[0]).c;
    const sl = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    const g = {
      c, px, mx, skinC, skin: skinC, neck: shade(skinC, -20), hair: hairC, red,
      back: dir === 'up', raised: pose !== 'none', sl, sr: -sl,
    };
    const pants = IDX.pants[look.pants] || PANTS[0];
    const shoe = IDX.shoes[look.shoes] || SHOES[0];
    const lift = [frame === 1 ? 2 : 0, frame === 2 ? 2 : 0];

    // pernas
    for (let s = 0; s < 2; s++) {
      const x0 = s ? 21 : 11, dy = -lift[s];
      if (pants.long) {
        px(x0 + 1, 56 + dy, 6, 6, skinC);
        shoe.draw(g, x0, dy);
        pants.leg(g, x0, dy);
      } else {
        px(x0 + 1, 52 + dy, 6, 10, skinC);
        px(x0 + 1, 52 + dy, 1, 10, shade(skinC, -14));
        pants.leg(g, x0, dy);
        shoe.draw(g, x0, dy);
      }
    }
    pants.hip(g);

    // corpo
    c.save();
    c.translate(0, frame ? -1 : 0);
    const shirt = IDX.shirt[look.shirt] || SHIRTS[0];

    // braços de pele
    px(5, 29 + g.sl, 5, 19, skinC);
    px(30, 29 + g.sr, 5, g.raised ? 10 : 19, skinC);
    px(5, 44 + g.sl, 5, 1, shade(skinC, -12));
    // pescoço
    px(17, 26, 6, 3, g.neck);
    const sh = shirt.draw(g) || {};

    // braço levantado (caneca / baseado)
    if (g.raised && !g.back) {
      px(29, 24, 5, 15, skinC);
      if (sh.sleeve) { px(29, 31, 5, 8, sh.sleeve); if (sh.cuff) px(29, 31, 5, 2, sh.cuff); }
      px(29, 24, 1, 8, shade(skinC, -14));
    }

    // cabeça
    px(14, 10, 12, 1, skinC); px(13, 11, 14, 1, skinC); px(12, 12, 16, 12, skinC);
    px(13, 24, 14, 1, skinC); px(14, 25, 12, 1, skinC);
    px(11, 17, 1, 4, skinC); px(28, 17, 1, 4, skinC); // orelhas
    px(11, 18, 1, 2, shade(skinC, -26)); px(28, 18, 1, 2, shade(skinC, -26));
    mx(12, 12, 1, 12, shade(skinC, -10));

    if (dir === 'down') {
      px(13, 21, 2, 1, 'rgba(230,90,110,.28)'); px(25, 21, 2, 1, 'rgba(230,90,110,.28)');
      drawEyes(g, look.eyes);
      drawMouth(g, look.mouth);
      hairFront(g, look.hair);
    } else {
      hairBack(g, look.hair);
    }

    const gl = IDX.glasses[look.glasses];
    if (gl && gl.draw) { if (dir === 'down') gl.draw(g); else g.mx(11, 17, 2, 1, '#2b2b30'); }
    const hat = IDX.hat[look.hat];
    if (hat && hat.draw) hat.draw(g);

    // item na mão
    if (pose === 'mug' || pose === 'joint') {
      if (dir === 'down') {
        if (pose === 'mug') drawMug(g); else drawJoint(g);
        // mão
        px(pose === 'mug' ? 27 : 26, pose === 'mug' ? 22 : 21, pose === 'mug' ? 6 : 5, 5, skinC);
        px(pose === 'mug' ? 27 : 26, pose === 'mug' ? 26 : 25, pose === 'mug' ? 6 : 5, 1, shade(skinC, -16));
      } else {
        px(28, 28, 5, 4, skinC);
      }
    }
    c.restore();
    return cv;
  }

  const cache = new Map();
  function getSprite(look, o) {
    o = o || {};
    const dir = o.dir || 'down', frame = o.frame || 0, pose = o.pose || 'none', red = !!o.red;
    const key = [look.skin, look.hairColor, look.hair, look.eyes, look.mouth, look.shirt, look.pants, look.shoes, look.hat, look.glasses, dir, frame, pose, red ? 1 : 0].join('|');
    let s = cache.get(key);
    if (!s) { s = render(look, dir, frame, pose, red); cache.set(key, s); if (cache.size > 900) cache.clear(); }
    return s;
  }

  // ---------- Look: padrão, aleatório, validação ----------
  const visible = (arr) => arr.filter((o) => !o.hidden);
  const DEFAULT_LOOK = {
    skin: 'bronze', hairColor: 'castanho', hair: 'curto', eyes: 'normal', mouth: 'sorriso',
    shirt: 'xadrez-vermelho', pants: 'jeans-azul', shoes: 'americana', hat: 'palha-branco', glasses: 'nenhum',
  };
  function sanitizeLook(l) {
    const out = {};
    for (const k of Object.keys(DEFAULT_LOOK)) {
      const o = l && IDX[k][l[k]];
      out[k] = o && !o.hidden ? l[k] : DEFAULT_LOOK[k];
    }
    return out;
  }
  function randomLook() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)].id;
    return {
      skin: pick(SKINS), hairColor: pick(HAIRCOLORS), hair: pick(visible(HAIRS)), eyes: pick(visible(EYES)), mouth: pick(visible(MOUTHS)),
      shirt: pick(visible(SHIRTS)), pants: pick(visible(PANTS)), shoes: pick(SHOES), hat: pick(HATS), glasses: pick(GLASSES),
    };
  }

  FT.sprites = {
    W, H, get: getSprite, shade,
    SKINS, HAIRCOLORS, EYES: visible(EYES), MOUTHS: visible(MOUTHS), HAIRS: visible(HAIRS), SHIRTS: visible(SHIRTS), PANTS: visible(PANTS), SHOES, HATS, GLASSES,
    DEFAULT_LOOK, sanitizeLook, randomLook,
    BARMAID_LOOK: {
      skin: 'clara', hairColor: 'loiro', hair: 'longo', eyes: 'sedutor', mouth: 'batom',
      shirt: 'biquini-rosa', pants: 'short-jeans', shoes: 'sandalia-quadrada', hat: 'nenhum', glasses: 'nenhum',
    },
    DANCER_LOOKS: [
      { skin: 'morena', hairColor: 'preto', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'top-preto', pants: 'short-dourado', shoes: 'sandalia-quadrada', hat: 'nenhum', glasses: 'nenhum' },
      { skin: 'clara', hairColor: 'ruivo', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'vestido-vermelho', pants: 'short-preto', shoes: 'bico-fino', hat: 'nenhum', glasses: 'nenhum' },
      { skin: 'marrom', hairColor: 'castanho', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'top-neon', pants: 'short-jeans', shoes: 'sandalia-quadrada', hat: 'nenhum', glasses: 'sol' },
      { skin: 'bronze', hairColor: 'platinado', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'vestido-dourado', pants: 'short-preto', shoes: 'bico-fino', hat: 'nenhum', glasses: 'nenhum' },
      { skin: 'escura', hairColor: 'preto', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'biquini-azul', pants: 'short-jeans', shoes: 'sandalia-quadrada', hat: 'nenhum', glasses: 'nenhum' },
      { skin: 'morena', hairColor: 'loiro', hair: 'longo', eyes: 'sedutor', mouth: 'batom', shirt: 'biquini-amarelo', pants: 'short-dourado', shoes: 'sandalia-quadrada', hat: 'nenhum', glasses: 'nenhum' },
    ],
    HOMEM_LOOK: {
      skin: 'morena', hairColor: 'preto', hair: 'curto', eyes: 'bravo', mouth: 'barba',
      shirt: 'sobretudo', pants: 'preta', shoes: 'bico-fino', hat: 'cowboy-preto', glasses: 'sol',
    },
  };
})();
