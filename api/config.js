import { send } from './_db.js';

// Valores públicos do canal de tempo real (Supabase Realtime). A anon key é pública por natureza.
export default function handler(req, res) {
  send(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    room: process.env.REALTIME_ROOM || 'buteco-fiotoes-v2',
  });
}
