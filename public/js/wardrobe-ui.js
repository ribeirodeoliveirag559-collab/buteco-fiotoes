// Painel lateral do guarda-roupa: abas (Corpo / Roupa / Acessórios), miniaturas, nome e botão de entrar.
const FT = window.FT;
const S = FT.sprites;
const $ = (id) => document.getElementById(id);

const CROPS = { head: [4, 0, 32, 30], torso: [2, 26, 36, 24], legs: [6, 44, 28, 22], feet: [8, 52, 24, 14] };
const TABS = [
  {
    id: 'corpo', label: 'CORPO', icon: '🧍', sections: [
      { key: 'hair', label: 'Cabelo', list: S.HAIRS, crop: 'head', noHat: true },
      { key: 'hairColor', label: 'Cor do cabelo', list: S.HAIRCOLORS, swatch: true },
      { key: 'eyes', label: 'Olhos', list: S.EYES, crop: 'head', noHat: true },
      { key: 'mouth', label: 'Boca', list: S.MOUTHS, crop: 'head', noHat: true },
      { key: 'skin', label: 'Pele', list: S.SKINS, swatch: true },
    ],
  },
  {
    id: 'roupa', label: 'ROUPA', icon: '👕', sections: [
      { key: 'shirt', label: 'Camisa', list: S.SHIRTS, crop: 'torso' },
      { key: 'pants', label: 'Calça / Bermuda', list: S.PANTS, crop: 'legs' },
      { key: 'shoes', label: 'Calçado', list: S.SHOES, crop: 'feet' },
    ],
  },
  {
    id: 'acess', label: 'ACESSÓRIOS', icon: '🤠', sections: [
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
      b.innerHTML = `<i>${t.icon}</i>${t.label}`;
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
          const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; b.appendChild(cv);
          const sp = document.createElement('span'); sp.textContent = opt.label; b.appendChild(sp);
          thumbs.push({ cv, sec, opt });
        }
        b.onclick = () => { look[sec.key] = opt.id; refresh(); h.onLook(look); FT.audio && FT.audio.blip(); };
        box.appendChild(b);
      }
      wrap.appendChild(box); panel.appendChild(wrap);
    }
    refresh();
  }
  function drawThumb({ cv, sec, opt }) {
    const l = Object.assign({}, look, { [sec.key]: opt.id });
    if (sec.noHat) l.hat = 'nenhum';
    if (sec.key === 'hair' || sec.key === 'eyes' || sec.key === 'mouth') l.glasses = 'nenhum';
    const spr = S.get(l, {});
    const [sx, sy, sw, sh] = CROPS[sec.crop];
    const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.clearRect(0, 0, 64, 64);
    const k = Math.min(60 / sw, 60 / sh);
    c.drawImage(spr, sx, sy, sw, sh, (64 - sw * k) / 2, (64 - sh * k) / 2, sw * k, sh * k);
  }
  function refresh() {
    thumbs.forEach(drawThumb);
    document.querySelectorAll('#panel .opt').forEach((b) => b.classList.toggle('on', look[b.dataset.key] === b.dataset.id));
  }
  function checkName() { $('btn-enter').disabled = cleanName($('name').value).length < 2; }

  $('name').addEventListener('input', checkName);
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-enter').click(); });
  $('btn-random').onclick = () => { look = S.randomLook(); refresh(); h.onLook(look); FT.audio && FT.audio.pop(); };
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
  $('drawer-toggle').onclick = () => { $('drawer').classList.toggle('open'); h.onDrawer && h.onDrawer(); };
  $('drawer-head').onclick = () => { if (window.innerWidth <= 820) { $('drawer').classList.remove('open'); h.onDrawer && h.onDrawer(); } };

  return {
    show(profile) {
      look = S.sanitizeLook((profile && profile.look) || S.randomLook());
      $('name').value = (profile && profile.name) || '';
      buildTabs(); buildPanel(); checkName();
      h.onLook(look);
    },
    get look() { return look; },
  };
}
