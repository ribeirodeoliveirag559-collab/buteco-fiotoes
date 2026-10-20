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
  for (const k of ['skin', 'hairColor', 'hair', 'eyes', 'mouth', 'shirt', 'pants', 'shoes', 'hat', 'glasses']) {
    const v = l[k];
    if (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v)) out[k] = v;
  }
  return out;
}

// dia do torneio no fuso de São Paulo
export const TODAY = "(now() at time zone 'America/Sao_Paulo')::date";

export async function auth(sql, body) {
  const pid = String(body.pid ?? '').slice(0, 40);
  const token = String(body.token ?? '').slice(0, 80);
  if (!pid || !token) return null;
  const rows = await sql`select pid, name, drink_started_at from players where pid = ${pid} and token = ${token}`;
  return rows[0] || null;
}

export async function beersToday(sql, pid) {
  const r = await sql`select beers from scores where pid = ${pid} and day = (now() at time zone 'America/Sao_Paulo')::date`;
  return r[0] ? r[0].beers : 0;
}
