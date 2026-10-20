import { db, readJson, send, auth, beersToday } from './_db.js';

// Anti-trapaça: o servidor mede o tempo de cada cerveja.
//   start  -> marca o início
//   finish -> só conta se passaram >= MIN_MS desde o início
const MIN_MS = 4400;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const me = await auth(sql, body);
    if (!me) return send(res, 401, { error: 'auth' });

    if (body.action === 'start') {
      await sql`update players set drink_started_at = now(), last_seen = now() where pid = ${me.pid}`;
      return send(res, 200, { ok: true });
    }

    if (body.action === 'finish') {
      const next = !!body.next;
      const rows = await sql`
        select (extract(epoch from (now() - drink_started_at)) * 1000)::int as ms
        from players where pid = ${me.pid} and drink_started_at is not null`;
      const ms = rows[0] ? rows[0].ms : null;
      if (ms == null || ms < MIN_MS) {
        return send(res, 200, { ok: false, reason: 'rapido', beers: await beersToday(sql, me.pid) });
      }
      await sql`
        insert into scores (day, pid, beers, last_beer_at)
        values ((now() at time zone 'America/Sao_Paulo')::date, ${me.pid}, 1, now())
        on conflict (day, pid) do update set beers = scores.beers + 1, last_beer_at = now()`;
      await sql`
        update players set drink_started_at = case when ${next} then now() else null end, last_seen = now()
        where pid = ${me.pid}`;
      return send(res, 200, { ok: true, beers: await beersToday(sql, me.pid) });
    }

    send(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
