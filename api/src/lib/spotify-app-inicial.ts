import { config } from '../config.js';
import { q, q1 } from '../db.js';
import { cifrar } from './seguranca.js';

/**
 * Registra o app configurado no ambiente (SPOTIFY_CLIENT_ID/SECRET) como "App principal" e vincula a ele as contas
 * que foram conectadas antes de existir o cadastro de apps. Idempotente.
 */
export async function garantirAppPadrao() {
  const { clientId, clientSecret, modo } = config.spotify;
  if (modo !== 'real' || !clientId || !clientSecret) return;
  let app = await q1('select id from spotify_apps where client_id=$1', [clientId]);
  if (!app) {
    app = await q1(
      `insert into spotify_apps (nome, client_id, client_secret_enc, limite_usuarios) values ('App principal', $1, $2, 5) returning id`,
      [clientId, cifrar(clientSecret)],
    );
    console.log('[spotify] app principal registrado a partir do ambiente');
  }
  const r = await q('update spotify_contas set app_id=$1 where app_id is null and spotify_user_id not like $2 returning id', [app.id, 'mock%']);
  if (r.length) console.log(`[spotify] ${r.length} conta(s) vinculada(s) ao app principal`);
}
