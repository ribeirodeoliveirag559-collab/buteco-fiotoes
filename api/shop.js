import { db, readJson, send, auth, stateOf, POD_COST, VAPE_USES } from './_db.js';

// Loja da balconista: um pod custa 20 pontos (gasta da carteira, não mexe no placar do dia) e dá 20 usos de vape.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const me = await auth(sql, body);
    if (!me) return send(res, 401, { error: 'auth' });
    if (body.item !== 'pod') return send(res, 400, { error: 'item' });

    const st = await stateOf(sql, me.pid);
    if (st.points < POD_COST) return send(res, 200, { ok: false, reason: 'pontos', ...st });

    // desconta só se ainda houver saldo (evita corrida entre dois cliques)
    const upd = await sql`
      update players set spent = spent + ${POD_COST}, vape = vape + ${VAPE_USES}
      where pid = ${me.pid}
        and (coalesce((select sum(beers) from scores where pid = ${me.pid}), 0) - spent) >= ${POD_COST}
      returning pid`;
    if (!upd.length) return send(res, 200, { ok: false, reason: 'pontos', ...(await stateOf(sql, me.pid)) });
    send(res, 200, { ok: true, ...(await stateOf(sql, me.pid)) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
