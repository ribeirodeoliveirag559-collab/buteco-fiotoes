// Patrocinadores do Buteco FIOTÕES. As logos são as imagens originais de cada marca (public/sponsors/),
// usadas só como imagem: nada aqui é redesenhado. Pra adicionar um patrocinador, ponha o arquivo na pasta
// e inclua uma linha aqui — o painel do salão e a janela de patrocinadores se atualizam sozinhos.
import { esc } from './ui-icons.js';

export const SPONSORS = [
  { id: 'primetek', name: 'Primetek', img: '/sponsors/primetek.png', w: 374, h: 91 },
  { id: 'cybertech', name: 'Cyber Tech', img: '/sponsors/cybertech.png', w: 630, h: 900 },
  { id: 'dsil', name: 'DSIL', img: '/sponsors/dsil.png', w: 900, h: 350 },
  { id: 'ph-informatica', name: 'PH Informática', img: '/sponsors/ph-informatica.png', w: 824, h: 920 },
  { id: 'mylamaq', name: 'Mylamaq', img: '/sponsors/mylamaq.png', w: 330, h: 287 },
  { id: 'classic', name: 'Classic Construtora e Imobiliária', img: '/sponsors/classic.png', w: 788, h: 779 },
  { id: 'jesuino', name: 'Agropecuária Jesuíno', img: '/sponsors/jesuino.jpg', w: 876, h: 900 },
];

// janela "Patrocinadores" (HTML): abre por qualquer botão com [data-open-sponsors]
export function initSponsors({ onOpen, onClose } = {}) {
  const box = document.getElementById('sponsors');
  if (!box) return { open() {}, close() {} };
  const grid = box.querySelector('.sp-grid');
  grid.innerHTML = SPONSORS.map((s) => `<figure class="sp-card"><div class="sp-logo"><img src="${esc(s.img)}" alt="Logo ${esc(s.name)}" width="${s.w}" height="${s.h}" decoding="async"></div><figcaption>${esc(s.name)}</figcaption></figure>`).join('');
  const open = () => { box.hidden = false; onOpen && onOpen(); };
  const close = () => { if (box.hidden) return; box.hidden = true; onClose && onClose(); };
  document.querySelectorAll('[data-open-sponsors]').forEach((b) => b.addEventListener('click', open));
  box.querySelector('.sp-close').addEventListener('click', close);
  box.addEventListener('pointerdown', (e) => { if (e.target === box) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open, close, get isOpen() { return !box.hidden; } };
}
