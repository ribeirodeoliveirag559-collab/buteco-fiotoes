import { send } from './_db.js';

// Valores públicos do canal de tempo real (Supabase Realtime). A anon key é pública por natureza.
export default function handler(req, res) {
  send(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    room: process.env.REALTIME_ROOM || 'buteco-fiotoes-v2',
    // Chat de voz: servidor TURN opcional (TURN_URLS="turn:host:443?transport=tcp,turns:host:443", TURN_USERNAME, TURN_CREDENTIAL)
    turn: process.env.TURN_URLS ? { urls: process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean), username: process.env.TURN_USERNAME || '', credential: process.env.TURN_CREDENTIAL || '' } : null,
  });
}
