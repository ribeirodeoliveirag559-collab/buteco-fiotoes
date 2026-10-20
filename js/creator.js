// Tela de criação do personagem.
(function () {
  'use strict';
  const FT = (window.FT = window.FT || {});
  const S = FT.sprites;

  const CROPS = {
    head: [4, 0, 32, 30],
    torso: [2, 26, 36, 24],
    legs: [6, 44, 28, 22],
    feet: [8, 52, 24, 14],
  };
  const TABS = [
    {
      id: 'corpo', label: '🧍 CORPO', sections: [
        { key: 'hair', label: 'Cabelo', list: S.HAIRS, crop: 'head', noHat: true },
        { key: 'hairColor', label: 'Cor do cabelo', list: S.HAIRCOLORS, swatch: true },
        { key: 'eyes', label: 'Olhos', list: S.EYES, crop: 'head', noHat: true },
        { key: 'mouth', label: 'Boca', list: S.MOUTHS, crop: 'head', noHat: true },
        { key: 'skin', label: 'Pele', list: S.SKINS, swatch: true },
      ],
    },
    {
      id: 'roupa', label: '👕 ROUPA', sections: [
        { key: 'shirt', label: 'Camisa', list: S.SHIRTS, crop: 'torso' },
        { key: 'pants', label: 'Calça / Bermuda', list: S.PANTS, crop: 'legs' },
        { key: 'shoes', label: 'Calçado', list: S.SHOES, crop: 'feet' },
      ],
    },
    {
      id: 'acess', label: '🤠 ACESSÓRIOS', sections: [
        { key: 'hat', label: 'Chapéu / Boné', list: S.HATS, crop: 'head' },
        { key: 'glasses', label: 'Óculos', list: S.GLASSES, crop: 'head', noHat: true },
      ],
    },
  ];

  const $ = (id) => document.getElementById(id);
  let look = Object.assign({}, S.DEFAULT_LOOK);
  let tab = TABS[0].id;
  let dir = 'down', pose = 'idle';
  let onEnter = null, running = false;
  const thumbs = []; // {canvas, sec, opt}

  const cleanName = (v) => v.replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

  function buildTabs() {
    const nav = $('tabs');
    nav.innerHTML = '';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.textContent = t.label;
      b.className = t.id === tab ? 'on' : '';
      b.onclick = () => { tab = t.id; buildTabs(); buildPanel(); };
      nav.appendChild(b);
    }
  }

  function buildPanel() {
    const panel = $('panel');
    panel.innerHTML = '';
    thumbs.length = 0;
    const t = TABS.find((x) => x.id === tab);
    for (const sec of t.sections) {
      const wrap = document.createElement('div');
      wrap.className = 'sec';
      wrap.innerHTML = `<h3>${sec.label}</h3>`;
      const box = document.createElement('div');
      box.className = 'opts';
      for (const opt of sec.list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt' + (sec.swatch ? ' swatch' : '');
        b.dataset.key = sec.key; b.dataset.id = opt.id;
        b.title = opt.label;
        if (sec.swatch) {
          b.innerHTML = `<i style="background:${opt.c}"></i><span>${opt.label}</span>`;
        } else {
          const cv = document.createElement('canvas');
          cv.width = 64; cv.height = 64;
          b.appendChild(cv);
          const sp = document.createElement('span'); sp.textContent = opt.label; b.appendChild(sp);
          thumbs.push({ cv, sec, opt });
        }
        b.onclick = () => { look[sec.key] = opt.id; refresh(); save(); if (FT.audio) FT.audio.blip(); };
        box.appendChild(b);
      }
      wrap.appendChild(box);
      panel.appendChild(wrap);
    }
    refresh();
  }

  function drawThumb(th) {
    const { cv, sec, opt } = th;
    const l = Object.assign({}, look, { [sec.key]: opt.id });
    if (sec.noHat && sec.key !== 'hat') l.hat = 'nenhum';
    if (sec.key === 'hair' || sec.key === 'eyes' || sec.key === 'mouth') l.glasses = 'nenhum';
    const spr = S.get(l, {});
    const [sx, sy, sw, sh] = CROPS[sec.crop];
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 64, 64);
    const k = Math.min(60 / sw, 60 / sh);
    const dw = sw * k, dh = sh * k;
    c.drawImage(spr, sx, sy, sw, sh, (64 - dw) / 2, (64 - dh) / 2, dw, dh);
  }

  function refresh() {
    thumbs.forEach(drawThumb);
    document.querySelectorAll('#panel .opt').forEach((b) => b.classList.toggle('on', look[b.dataset.key] === b.dataset.id));
  }

  function save() { try { localStorage.setItem('fiotoes:draft', JSON.stringify(look)); } catch (e) { /* ok */ } }

  // ---------- preview animado ----------
  function loop(t) {
    if (!running) return;
    const cv = $('preview'), c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    let frame = 0, p = 'none';
    if (pose === 'walk') frame = [0, 1, 0, 2][Math.floor(t / 220) % 4];
    if (pose === 'mug') p = 'mug';
    if (pose === 'joint') p = 'joint';
    const spr = S.get(look, { dir, frame, pose: p, red: pose === 'joint' });
    const k = 8;
    const bob = pose === 'idle' ? Math.round(Math.sin(t / 380)) : 0;
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(cv.width / 2, 64 * k + 6, 15 * k, 3.4 * k, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(spr, 0, 0, S.W, S.H, 0, bob * 2 - 6, S.W * k, S.H * k);
    requestAnimationFrame(loop);
  }

  function checkName() {
    $('btn-enter').disabled = cleanName($('name').value).length < 2;
  }

  function init() {
    $('name').addEventListener('input', checkName);
    $('btn-random').onclick = () => { look = S.randomLook(); refresh(); save(); if (FT.audio) FT.audio.pop(); };
    $('btn-spin').onclick = () => { dir = dir === 'down' ? 'up' : 'down'; };
    document.querySelectorAll('#poses button').forEach((b) => {
      b.onclick = () => {
        pose = b.dataset.pose;
        document.querySelectorAll('#poses button').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    $('btn-enter').onclick = () => {
      const name = cleanName($('name').value);
      if (name.length < 2) return;
      if (FT.audio) FT.audio.init();
      running = false;
      onEnter({ name, look: S.sanitizeLook(look) });
    };
    $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-enter').click(); });
  }
  let inited = false;

  FT.creator = {
    show(profile, cb) {
      if (!inited) { init(); inited = true; }
      onEnter = cb;
      look = S.sanitizeLook((profile && profile.look) || S.randomLook());
      $('name').value = (profile && profile.name) || '';
      $('screen-create').hidden = false;
      $('screen-game').hidden = true;
      buildTabs(); buildPanel(); checkName();
      running = true;
      requestAnimationFrame(loop);
    },
  };
})();
