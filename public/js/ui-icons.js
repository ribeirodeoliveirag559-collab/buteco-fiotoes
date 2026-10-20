// Ícones (sprite Lucide em icons.svg, injetado no começo da página) e utilidades de HTML seguro.
import { ICON_SVG } from './icon-paths.js';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export function setIcon(el, name) { const u = el && el.querySelector('use'); if (u) u.setAttribute('href', '#i-' + name); }

// desenha um ícone Lucide num canvas 2D (usado no placar da parede)
export function drawIcon(g, name, x, y, size, color, lineWidth = 2) {
  const inner = ICON_SVG[name];
  if (!inner) return;
  g.save();
  g.translate(x, y); g.scale(size / 24, size / 24);
  g.strokeStyle = color; g.lineWidth = lineWidth; g.lineCap = 'round'; g.lineJoin = 'round';
  const re = /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(inner))) {
    const a = {};
    m[2].replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; });
    const n = (k) => parseFloat(a[k] || 0);
    g.beginPath();
    if (m[1] === 'path') { g.stroke(new Path2D(a.d)); continue; }
    if (m[1] === 'circle') g.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
    else if (m[1] === 'ellipse') g.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
    else if (m[1] === 'rect') { if (g.roundRect) g.roundRect(n('x'), n('y'), n('width'), n('height'), n('rx')); else g.rect(n('x'), n('y'), n('width'), n('height')); }
    else if (m[1] === 'line') { g.moveTo(n('x1'), n('y1')); g.lineTo(n('x2'), n('y2')); }
    else {
      const pts = (a.points || '').trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i], pts[i + 1]);
      if (m[1] === 'polygon') g.closePath();
    }
    g.stroke();
  }
  g.restore();
}
