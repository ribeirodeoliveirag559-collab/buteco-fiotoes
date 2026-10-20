// Gera public/icons.svg (sprite de <symbol>) com os ícones Lucide usados no jogo (licença ISC).
// Também gera public/js/icon-paths.js (caminhos SVG para desenhar ícones em canvas, ex.: o placar).
import { readFileSync, writeFileSync } from 'node:fs';

const NAMES = [
  'users', 'trophy', 'music', 'volume-2', 'volume-x', 'shirt', 'beer', 'beer-off', 'bottle-wine', 'cigarette', 'wind',
  'hand', 'message-circle', 'send', 'eye', 'dices', 'rotate-ccw', 'lock', 'lock-open', 'star', 'crown', 'sparkles',
  'log-out', 'x', 'play', 'square', 'minimize-2', 'party-popper', 'smartphone', 'rotate-cw', 'user', 'glasses',
  'heart', 'zap', 'cloud', 'flame', 'circle-alert', 'check', 'wifi', 'wifi-off', 'flask-conical', 'skull', 'smile',
  'laugh', 'coins', 'shopping-bag', 'moon-star', 'info', 'hand-heart', 'cloud-fog', 'glass-water',
];
const dir = 'node_modules/lucide-static/icons/';
let sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n<!-- Lucide icons (https://lucide.dev) — ISC License -->\n';
const paths = {};
for (const n of NAMES) {
  const svg = readFileSync(dir + n + '.svg', 'utf8');
  const inner = svg.replace(/<!--[\s\S]*?-->/, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  sprite += `<symbol id="i-${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner.replace(/\s+/g, ' ')}</symbol>\n`;
  paths[n] = inner.replace(/\s+/g, ' ');
}
sprite += '</svg>\n';
writeFileSync('public/icons.svg', sprite);
writeFileSync('public/js/icon-paths.js', '// gerado por scripts/icons.mjs (Lucide, ISC)\nexport const ICON_SVG = ' + JSON.stringify(paths) + ';\n');
console.log('ícones:', NAMES.length);
