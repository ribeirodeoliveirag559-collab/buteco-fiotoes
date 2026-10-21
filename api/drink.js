import { db, readJson, send, auth, stateOf, BOTTLE_SERVINGS, WHISKY_SHOTS } from './_db.js';

// Cerveja não é infinita. O caminho é:
//   order  -> a garçonete entrega uma garrafa               (bottle = 5 copos)
//   pour   -> clicar na garrafa e servir um copo            (bottle -= 1, glass = 1)
//   start/finish -> beber o copo (>= MIN_MS)                (glass = 0, +1 ponto)
// Whisky (pego em cima do balcão): action 'whisky' -> bottle = -5 doses; cada dose é um "copo" de 3 s.
const MIN_MS = 4400;      // cerveja: 5 s no cliente
const MIN_MS_SHOT = 2500; // dose de whisky: 3 s no cliente

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const me = await auth(sql, body);
    if (!me) return send(res, 401, { error: 'auth' });
    const reply = async (ok, reason) => send(res, 200, { ok, reason, ...(await stateOf(sql, me.pid)) });

    switch (body.action) {
      case 'grab': // cerveja grátis deixada nas mesas
      case 'order':
      case 'whisky': { // whisky em cima do balcão
        if (me.bottle || me.glass) return reply(false, me.glass ? 'copo-cheio' : 'ja-tem-garrafa');
        const start = body.action === 'whisky' ? -WHISKY_SHOTS : BOTTLE_SERVINGS;
        await sql`update players set bottle = ${start}, last_seen = now() where pid = ${me.pid}`;
        return reply(true);
      }

      case 'pour': {
        if (!me.bottle) return reply(false, 'sem-garrafa');
        if (me.glass) return reply(false, 'copo-cheio');
        // atômico: só serve se ainda tem bebida na garrafa e o copo está vazio
        const poured = me.bottle < 0
          ? await sql`
            update players set bottle = bottle + 1, glass = 2, last_seen = now()
            where pid = ${me.pid} and bottle < 0 and glass = 0 returning bottle`
          : await sql`
            update players set bottle = bottle - 1, glass = 1, last_seen = now()
            where pid = ${me.pid} and bottle > 0 and glass = 0 returning bottle`;
        return poured.length ? reply(true) : reply(false, 'sem-garrafa');
      }

      case 'start':
        if (!me.glass) return reply(false, 'sem-copo');
        await sql`update players set drink_started_at = now(), last_seen = now() where pid = ${me.pid}`;
        return reply(true);

      case 'finish': {
        if (!me.glass) return reply(false, 'sem-copo');
        const rows = await sql`
          select (extract(epoch from (now() - drink_started_at)) * 1000)::int as ms
          from players where pid = ${me.pid} and drink_started_at is not null`;
        const ms = rows[0] ? rows[0].ms : null;
        if (ms == null || ms < (me.glass === 2 ? MIN_MS_SHOT : MIN_MS)) return reply(false, 'rapido');
        await sql`
          insert into scores (day, pid, beers, last_beer_at)
          values ((now() at time zone 'America/Sao_Paulo')::date, ${me.pid}, 1, now())
          on conflict (day, pid) do update set beers = scores.beers + 1, last_beer_at = now()`;
        await sql`update players set glass = 0, drink_started_at = null, last_seen = now() where pid = ${me.pid}`;
        return reply(true);
      }
    }
    send(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
