import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, readJson, send, cleanName } from './_db.js';

// Cadastro e login: só nome + senha (mínimo 3 caracteres, sem repetir).
// Conta antiga criada antes das senhas existirem: o primeiro login define a senha.
const hashPass = (pass, salt) => scryptSync(pass, salt, 32).toString('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const name = cleanName(body.name);
    const pass = String(body.pass ?? '');
    if (name.length < 2) return send(res, 400, { error: 'nome' });
    if (pass.length < 3 || pass.length > 40) return send(res, 400, { error: 'senha-curta' });
    const key = name.toLowerCase();

    if (body.action === 'register') {
      const pid = randomBytes(6).toString('hex'), token = randomBytes(18).toString('hex'), salt = randomBytes(16).toString('hex');
      const ins = await sql`
        insert into players (pid, token, name, name_key, pass_salt, pass_hash, look)
        values (${pid}, ${token}, ${name}, ${key}, ${salt}, ${hashPass(pass, salt)}, '{}'::jsonb)
        on conflict (name_key) where name_key is not null do nothing
        returning pid`;
      if (!ins.length) return send(res, 409, { error: 'nome-em-uso' });
      return send(res, 200, { pid, token, name, look: {}, isNew: true });
    }

    if (body.action === 'login') {
      const rows = await sql`select pid, token, name, look, pass_salt, pass_hash from players where name_key = ${key}`;
      const p = rows[0];
      if (!p) { await wait(300); return send(res, 404, { error: 'sem-conta' }); }
      if (!p.pass_hash) { // conta antiga: este login define a senha
        const salt = randomBytes(16).toString('hex');
        await sql`update players set pass_salt = ${salt}, pass_hash = ${hashPass(pass, salt)}, last_seen = now() where pid = ${p.pid}`;
        return send(res, 200, { pid: p.pid, token: p.token, name: p.name, look: p.look, claimed: true });
      }
      const ok = timingSafeEqual(Buffer.from(hashPass(pass, p.pass_salt), 'hex'), Buffer.from(p.pass_hash, 'hex'));
      if (!ok) { await wait(500); return send(res, 401, { error: 'senha-errada' }); }
      await sql`update players set last_seen = now() where pid = ${p.pid}`;
      return send(res, 200, { pid: p.pid, token: p.token, name: p.name, look: p.look });
    }

    send(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
