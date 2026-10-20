import { randomBytes } from 'node:crypto';
import { db, readJson, send, cleanName, cleanLook, stateOf, resolveWinners } from './_db.js';

// Cria ou atualiza o jogador (nome + visual). Devolve pid/token, o estado (copos, pontos, vape...)
// e um aviso se ele foi campeão de algum dia que já fechou.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const name = cleanName(body.name);
    const look = cleanLook(body.look);
    if (name.length < 2) return send(res, 400, { error: 'nome' });

    await resolveWinners(sql);

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

    const won = await sql`
      update daily_winners set seen = true where pid = ${pid} and seen = false
      returning to_char(day, 'DD/MM') as day, beers`;
    const notice = won.length ? { type: 'winner', day: won[0].day, beers: won[0].beers, count: won.length } : null;

    send(res, 200, { pid, token, name, notice, ...(await stateOf(sql, pid)) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
