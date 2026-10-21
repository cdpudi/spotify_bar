import { config } from '../config.js';
import { q1, q } from '../db.js';
import { cifrar, decifrar } from '../lib/seguranca.js';
import { spotifyMock } from './mock.js';
import { spotifyReal } from './real.js';
import { ErroSpotify, type Credenciais, type SpotifyProvider } from './tipos.js';

export const spotify: SpotifyProvider = config.spotify.modo === 'real' ? spotifyReal : spotifyMock;
export { ErroSpotify };

/** Credenciais do app da conta; contas antigas (sem app) usam as do ambiente. */
export async function credenciaisDoApp(appId: string | null): Promise<Credenciais> {
  if (appId) {
    const app = await q1<{ client_id: string; client_secret_enc: string }>('select client_id, client_secret_enc from spotify_apps where id=$1', [appId]);
    if (!app) throw new ErroSpotify(404, 'Aplicativo Spotify da conta não encontrado');
    return { clientId: app.client_id, clientSecret: decifrar(app.client_secret_enc) };
  }
  return { clientId: config.spotify.clientId, clientSecret: config.spotify.clientSecret };
}

/** Devolve um access_token válido da conta, renovando (e gravando) quando está para expirar. */
export async function tokenDaConta(contaId: string): Promise<string> {
  const c = await q1<{ access_token_enc: string; refresh_token_enc: string; expira_em: Date; app_id: string | null }>(
    'select access_token_enc, refresh_token_enc, expira_em, app_id from spotify_contas where id=$1',
    [contaId],
  );
  if (!c) throw new ErroSpotify(404, 'Conta Spotify não encontrada');
  if (new Date(c.expira_em).getTime() - Date.now() > 60_000) return decifrar(c.access_token_enc);

  const novo = await spotify.renovar(decifrar(c.refresh_token_enc), await credenciaisDoApp(c.app_id));
  await q(
    `update spotify_contas set access_token_enc=$2, refresh_token_enc=coalesce($3, refresh_token_enc), expira_em=now() + make_interval(secs => $4) where id=$1`,
    [contaId, cifrar(novo.access_token), novo.refresh_token ? cifrar(novo.refresh_token) : null, novo.expires_in],
  );
  return novo.access_token;
}
