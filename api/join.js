import { db, readJson, send, cleanLook, stateOf, resolveWinners, auth } from './_db.js';

// Ao entrar no bar: confirma a sessão (pid + token), salva o visual escolhido no guarda-roupa,
// devolve o estado (copos, pontos, vape, garrafa/copo) e avisa se foi campeão de um dia que fechou.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const me = await auth(sql, body);
    if (!me) return send(res, 401, { error: 'auth' });
    const look = cleanLook(body.look);

    await resolveWinners(sql);
    await sql`update players set look = ${JSON.stringify(look)}::jsonb, last_seen = now() where pid = ${me.pid}`;

    const won = await sql`
      update daily_winners set seen = true where pid = ${me.pid} and seen = false
      returning to_char(day, 'DD/MM') as day, beers`;
    const notice = won.length ? { type: 'winner', day: won[0].day, beers: won[0].beers, count: won.length } : null;

    send(res, 200, { pid: me.pid, name: me.name, notice, ...(await stateOf(sql, me.pid)) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
