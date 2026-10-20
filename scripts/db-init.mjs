// Cria as tabelas no SEU banco Neon:  npm run db:init   (usa DATABASE_URL do .env.local ou do ambiente)
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sem .env.local */ }

if (!process.env.DATABASE_URL) { console.error('Faltou DATABASE_URL (veja .env.example).'); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const stmts = readFileSync('db/schema.sql', 'utf8')
  .split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);
for (const s of stmts) await sql.query(s);
console.log(`ok: ${stmts.length} comandos aplicados (o schema é idempotente, pode rodar de novo).`);
