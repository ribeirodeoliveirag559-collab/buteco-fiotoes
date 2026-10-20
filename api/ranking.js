import { db, send } from './_db.js';

// Placar do dia (fuso de São Paulo). Público.
export default async function handler(req, res) {
  try {
    const sql = db();
    const rows = await sql`
      select p.pid, p.name, s.beers
      from scores s join players p on p.pid = s.pid
      where s.day = (now() at time zone 'America/Sao_Paulo')::date and s.beers > 0
      order by s.beers desc, s.last_beer_at asc
      limit 20`;
    const day = (await sql`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM') as d`)[0].d;
    send(res, 200, { day, rows });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
