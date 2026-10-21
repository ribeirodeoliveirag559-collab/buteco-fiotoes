// Painel lateral do guarda-roupa: abas (Corpo / Roupa / Acessórios), miniaturas, nome e botão de entrar.
const FT = window.FT;
const S = FT.sprites;
const $ = (id) => document.getElementById(id);

const CROPS = { head: [4, 0, 32, 30], torso: [2, 26, 36, 24], legs: [6, 44, 28, 22], feet: [8, 52, 24, 14] };
const TABS = [
  {
    id: 'corpo', label: 'CORPO', icon: 'user', sections: [
      { key: 'body', label: 'Tipo de corpo', list: S.BODIES, crop: 'torso', region: 'full' },
      { key: 'hair', label: 'Cabelo', list: S.HAIRS, crop: 'head', noHat: true },
      { key: 'hairColor', label: 'Cor do cabelo', list: S.HAIRCOLORS, swatch: true },
      { key: 'eyes', label: 'Olhos', list: S.EYES, crop: 'head', noHat: true },
      { key: 'mouth', label: 'Boca', list: S.MOUTHS, crop: 'head', noHat: true },
      { key: 'skin', label: 'Pele', list: S.SKINS, swatch: true },
    ],
  },
  {
    id: 'roupa', label: 'ROUPA', icon: 'shirt', sections: [
      { key: 'shirt', label: 'Camisa', list: S.SHIRTS, crop: 'torso' },
      { key: 'pants', label: 'Calça / Bermuda', list: S.PANTS, crop: 'legs' },
      { key: 'shoes', label: 'Calçado', list: S.SHOES, crop: 'feet' },
    ],
  },
  {
    id: 'acess', label: 'ACESSÓRIOS', icon: 'glasses', sections: [
      { key: 'hat', label: 'Chapéu / Boné', list: S.HATS, crop: 'head' },
      { key: 'glasses', label: 'Óculos', list: S.GLASSES, crop: 'head', noHat: true },
    ],
  },
];

export const cleanName = (v) => String(v || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

export function initWardrobeUI(h) {
  let look = Object.assign({}, S.DEFAULT_LOOK);
  let tab = TABS[0].id;
  const thumbs = [];

  function buildTabs() {
    const nav = $('tabs'); nav.innerHTML = '';
    for (const t of TABS) {
      const b = document.createElement('button');
      b.innerHTML = `<svg class="ic" aria-hidden="true"><use href="#i-${t.icon}"></use></svg>${t.label}`;
      b.className = t.id === tab ? 'on' : '';
      b.onclick = () => { tab = t.id; buildTabs(); buildPanel(); };
      nav.appendChild(b);
    }
  }
  function buildPanel() {
    const panel = $('panel'); panel.innerHTML = ''; thumbs.length = 0;
    const t = TABS.find((x) => x.id === tab);
    for (const sec of t.sections) {
      const wrap = document.createElement('div'); wrap.className = 'sec';
      wrap.innerHTML = `<h3>${sec.label}</h3>`;
      const box = document.createElement('div'); box.className = 'opts';
      for (const opt of sec.list) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'opt' + (sec.swatch ? ' swatch' : '');
        b.dataset.key = sec.key; b.dataset.id = opt.id; b.title = opt.label;
        if (sec.swatch) b.innerHTML = `<i style="background:${opt.c}"></i><span>${opt.label}</span>`;
        else {
          const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; b.appendChild(cv);
          const sp = document.createElement('span'); sp.textContent = opt.label; b.appendChild(sp);
          thumbs.push({ cv, sec, opt });
        }
        b.onclick = () => { look[sec.key] = opt.id; refresh(sec.key === 'skin' || sec.key === 'hairColor' || sec.key === 'hair'); h.onLook(look); FT.audio && FT.audio.blip(); };
        box.appendChild(b);
      }
      wrap.appendChild(box); panel.appendChild(wrap);
    }
    thumbs.forEach(drawThumb); refresh(true);
  }
  function drawThumb({ cv, sec, opt }) {
    const l = Object.assign({}, look, { [sec.key]: opt.id });
    if (sec.noHat) l.hat = 'nenhum';
    if (sec.key === 'hair' || sec.key === 'eyes' || sec.key === 'mouth') l.glasses = 'nenhum';
    const spr = S.get(l, {});
    const [sx, sy, sw, sh] = CROPS[sec.crop];
    const Z = cv.width, c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, Z, Z);
    const k = Math.min(Z * 0.94 / sw, Z * 0.94 / sh);
    c.drawImage(spr, sx, sy, sw, sh, (Z - sw * k) / 2, (Z - sh * k) / 2, sw * k, sh * k);
  }
  // miniaturas 3D (mesmo modelo do jogo). Mostra o desenho de pixels na hora e troca pelo 3D em seguida, uma por vez.
  const REGION = { head: 'head', torso: 'torso', legs: 'legs', feet: 'feet' };
  let thumbGen = 0;
  function renderThumbs() {
    if (!h.thumb) return;
    const gen = ++thumbGen, list = thumbs.slice();
    (function next() {
      if (gen !== thumbGen || !list.length) return;
      const t = list.shift(), { sec, opt, cv } = t;
      const base = Object.assign({}, S.DEFAULT_LOOK, { skin: look.skin, hairColor: look.hairColor, hair: look.hair, body: look.body });
      const lk = Object.assign(base, { [sec.key]: opt.id });
      if (sec.noHat) lk.hat = 'nenhum';
      if (sec.key !== 'glasses' && sec.key !== 'hat') lk.glasses = 'nenhum';
      if (sec.key === 'hat') lk.hair = look.hair;
      h.thumb(S.sanitizeLook(lk), sec.key === 'hat' ? 'hat' : (sec.region || REGION[sec.crop] || 'torso'), cv);
      setTimeout(next, 8);
    })();
  }
  function refresh(rethumb) {
    document.querySelectorAll('#panel .opt').forEach((b) => b.classList.toggle('on', look[b.dataset.key] === b.dataset.id));
    if (rethumb) renderThumbs();
  }
  function checkName() { $('btn-enter').disabled = $('btn-enter-float').disabled = cleanName($('name').value).length < 2; }

  $('name').addEventListener('input', checkName);
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-enter').click(); });
  $('btn-random').onclick = () => { look = S.randomLook(); refresh(true); h.onLook(look); FT.audio && FT.audio.pop(); };
  $('btn-spin').onclick = () => h.onTurn();
  document.querySelectorAll('#poses button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#poses button').forEach((x) => x.classList.toggle('on', x === b));
      h.onPose(b.dataset.pose);
    };
  });
  $('btn-enter').onclick = () => {
    const name = cleanName($('name').value);
    if (name.length < 2) return;
    h.onEnter({ name, look: S.sanitizeLook(look) });
  };
  $('btn-logout').onclick = () => h.onLogout && h.onLogout();
  $('drawer-toggle').onclick = () => { $('drawer').classList.toggle('open'); h.onDrawer && h.onDrawer(); };
  $('drawer-head').onclick = () => { if (matchMedia('(max-aspect-ratio: 1/1)').matches) { $('drawer').classList.remove('open'); h.onDrawer && h.onDrawer(); } };
  $('btn-enter-float').onclick = () => $('btn-enter').click();

  return {
    show(profile) {
      look = S.sanitizeLook((profile && profile.look) || S.randomLook());
      $('name').value = (profile && profile.name) || '';
      $('drawer-head').firstChild.textContent = 'GUARDA-ROUPA' + (profile && profile.name ? ' · ' + profile.name.toUpperCase() : '');
      buildTabs(); buildPanel(); checkName();
      h.onLook(look);
    },
    get look() { return look; },
  };
}
