import { randomBytes } from 'node:crypto';
import { db, readJson, send, cleanName, cleanLook, beersToday } from './_db.js';

// Cria ou atualiza o jogador (nome + visual). Devolve pid/token e as cervejas de hoje.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const name = cleanName(body.name);
    const look = cleanLook(body.look);
    if (name.length < 2) return send(res, 400, { error: 'nome' });

    let pid = String(body.pid ?? '').slice(0, 40);
    let token = String(body.token ?? '').slice(0, 80);
    let updated = [];
    if (pid && token) {
      updated = await sql`
        update players set name = ${name}, look = ${JSON.stringify(look)}::jsonb, last_seen = now()
        where pid = ${pid} and token = ${token} returning pid`;
    }
    if (!updated.length) {
      pid = randomBytes(6).toString('hex');
      token = randomBytes(18).toString('hex');
      await sql`insert into players (pid, token, name, look) values (${pid}, ${token}, ${name}, ${JSON.stringify(look)}::jsonb)`;
    }
    const beers = await beersToday(sql, pid);
    send(res, 200, { pid, token, name, beers });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
