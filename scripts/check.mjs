// Checagem rápida (roda no CI e antes de abrir PR): sintaxe de todo o JS do jogo e da API.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = [];
for (const dir of ['api', 'public/js', 'scripts']) for (const f of readdirSync(dir)) if (/\.m?js$/.test(f)) files.push(`${dir}/${f}`);
files.push('server.js');
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(`✗ ${f}\n${r.stderr}`); }
}
console.log(bad ? `${bad} arquivo(s) com erro` : `ok: ${files.length} arquivos`);
process.exit(bad ? 1 : 0);
