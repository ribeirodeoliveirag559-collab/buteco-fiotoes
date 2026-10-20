import { db, send, resolveWinners } from './_db.js';

// Placar do dia (fuso de São Paulo) + campeão do último dia fechado. Público.
export default async function handler(req, res) {
  try {
    const sql = db();
    await resolveWinners(sql);
    const rows = await sql`
      select p.pid, p.name, s.beers
      from scores s join players p on p.pid = s.pid
      where s.day = (now() at time zone 'America/Sao_Paulo')::date and s.beers > 0
      order by s.beers desc, s.last_beer_at asc
      limit 20`;
    const day = (await sql`select to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM') as d`)[0].d;
    const lw = await sql`
      select p.name, w.beers, to_char(w.day, 'DD/MM') as day
      from daily_winners w join players p on p.pid = w.pid
      order by w.day desc limit 1`;
    send(res, 200, { day, rows, lastWinner: lw[0] || null });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
