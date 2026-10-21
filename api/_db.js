import { neon } from '@neondatabase/serverless';

let _sql = null;
export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

export function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export const cleanName = (n) =>
  String(n ?? '').replace(/[<>&"\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

// o "look" é só um mapa de ids curtos (cabelo, camisa...). Valida formato, o cliente valida o catálogo.
export function cleanLook(l) {
  const out = {};
  if (!l || typeof l !== 'object') return out;
  for (const k of ['body', 'skin', 'hairColor', 'hair', 'eyes', 'mouth', 'shirt', 'pants', 'shoes', 'hat', 'glasses']) {
    const v = l[k];
    if (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v)) out[k] = v;
  }
  return out;
}

export const BOTTLE_SERVINGS = 5; // cada garrafa rende até 5 copos
export const VAPE_USES = 20;
export const POD_COST = 20;

export async function auth(sql, body) {
  const pid = String(body.pid ?? '').slice(0, 40);
  const token = String(body.token ?? '').slice(0, 80);
  if (!pid || !token) return null;
  const rows = await sql`
    select pid, name, drink_started_at, bottle, glass, vape, spent
    from players where pid = ${pid} and token = ${token}`;
  return rows[0] || null;
}

// estado que o cliente precisa: copos de hoje, pontos (carteira), vape, garrafa/copo
export async function stateOf(sql, pid) {
  const r = await sql`
    select p.bottle, p.glass, p.vape,
      coalesce((select beers from scores where pid = p.pid and day = (now() at time zone 'America/Sao_Paulo')::date), 0) as beers,
      coalesce((select sum(beers) from scores where pid = p.pid), 0)::int - p.spent as points
    from players p where p.pid = ${pid}`;
  const s = r[0] || { bottle: 0, glass: 0, vape: 0, beers: 0, points: 0 };
  return { beers: s.beers, points: s.points, vape: s.vape, bottle: s.bottle, glass: s.glass };
}

// Fecha os dias que já acabaram: o maior pontuador ganha um cigarro eletrônico (20 usos).
export async function resolveWinners(sql) {
  const fresh = await sql`
    insert into daily_winners (day, pid, beers)
    select distinct on (s.day) s.day, s.pid, s.beers
    from scores s
    where s.day < (now() at time zone 'America/Sao_Paulo')::date and s.beers > 0
      and not exists (select 1 from daily_winners w where w.day = s.day)
    order by s.day, s.beers desc, s.last_beer_at asc
    on conflict (day) do nothing
    returning day, pid`;
  for (const w of fresh) await sql`update players set vape = vape + ${VAPE_USES} where pid = ${w.pid}`;
  return fresh.length;
}
