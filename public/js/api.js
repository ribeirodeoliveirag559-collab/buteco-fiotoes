// Cliente da API (Vercel + Neon). Devolve null se o servidor estiver fora do ar.
async function call(path, body) {
  try {
    const r = await fetch(path, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' });
    if (!r.ok) return { error: r.status };
    return await r.json();
  } catch (e) {
    return null;
  }
}

export const api = {
  config: () => call('/api/config'),
  join: (b) => call('/api/join', b),
  auth: (b) => call('/api/auth', b),
  drink: (b) => call('/api/drink', b),
  ranking: () => call('/api/ranking'),
  shop: (b) => call('/api/shop', b),
  vape: (b) => call('/api/vape', b),
};
