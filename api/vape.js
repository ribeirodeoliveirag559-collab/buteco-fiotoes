import { db, readJson, send, auth, stateOf } from './_db.js';

// Cada tragada gasta 1 uso do cigarro eletrônico.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = db();
    const body = await readJson(req);
    const me = await auth(sql, body);
    if (!me) return send(res, 401, { error: 'auth' });
    const upd = await sql`update players set vape = vape - 1 where pid = ${me.pid} and vape > 0 returning vape`;
    send(res, 200, { ok: upd.length > 0, ...(await stateOf(sql, me.pid)) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
}
