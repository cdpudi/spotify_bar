import { config } from '../config.js';
import { ErroSpotify, type Credenciais, type Dispositivo, type Faixa, type PerfilSpotify, type Reproducao, type SpotifyProvider } from './tipos.js';

const API = 'https://api.spotify.com/v1';
const CONTAS = 'https://accounts.spotify.com';
const ESCOPOS = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-private',
  'user-read-email',
].join(' ');

const redirectUri = () => `${config.urlApi}/api/spotify/callback`;

async function chamar(token: string, metodo: string, caminho: string, corpo?: unknown): Promise<any> {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 204) return null;
  const texto = await r.text();
  if (!r.ok) {
    let msg = texto;
    try {
      msg = JSON.parse(texto)?.error?.message ?? texto;
    } catch {
      /* mantém texto bruto */
    }
    throw new ErroSpotify(r.status, `Spotify ${r.status}: ${msg}`);
  }
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    // comandos do player (pause/play/next) respondem 200 com um id em texto puro: sucesso, sem JSON
    return null;
  }
}

async function tokenEndpoint(params: Record<string, string>, cred: Credenciais) {
  const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString('base64');
  const r = await fetch(`${CONTAS}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroSpotify(r.status, `Spotify auth ${r.status}: ${j.error_description ?? j.error ?? 'erro'}`);
  return j;
}

const paraFaixa = (t: any): Faixa => ({
  id: t.id,
  uri: t.uri,
  nome: t.name,
  artistas: (t.artists ?? []).map((a: any) => a.name).join(', '),
  album: t.album?.name ?? '',
  capa_url: t.album?.images?.[1]?.url ?? t.album?.images?.[0]?.url ?? null,
  duracao_ms: t.duration_ms,
});

/**
 * "Restriction violated" (403): o Spotify recusa o comando porque o estado atual não permite
 * (ex.: pausar o que já está pausado, retomar o que já toca). Para pausar/retomar isso significa "já está como pedido".
 */
const restricao = (e: unknown) => e instanceof ErroSpotify && e.status === 403 && /restriction/i.test(e.message);

export const spotifyReal: SpotifyProvider = {
  modo: 'real',

  urlAutorizacao(state, cred) {
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: cred.clientId,
      scope: ESCOPOS,
      redirect_uri: redirectUri(),
      state,
      show_dialog: 'true', // permite escolher outra conta a cada conexão
    });
    return `${CONTAS}/authorize?${p}`;
  },

  async validarCredenciais(cred) {
    await tokenEndpoint({ grant_type: 'client_credentials' }, cred);
  },

  trocarCodigo: (codigo, cred) =>
    tokenEndpoint({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri() }, cred),

  renovar: (refreshToken, cred) => tokenEndpoint({ grant_type: 'refresh_token', refresh_token: refreshToken }, cred),

  async perfil(token): Promise<PerfilSpotify> {
    const me = await chamar(token, 'GET', '/me');
    return { id: me.id, nome: me.display_name ?? me.id, email: me.email ?? null, produto: me.product ?? null };
  },

  async buscar(token, termo) {
    const p = new URLSearchParams({ q: termo, type: 'track', limit: '10', market: 'BR' });
    const r = await chamar(token, 'GET', `/search?${p}`);
    return (r?.tracks?.items ?? []).map(paraFaixa);
  },

  async dispositivos(token): Promise<Dispositivo[]> {
    const r = await chamar(token, 'GET', '/me/player/devices');
    return (r?.devices ?? [])
      .filter((d: any) => d.id)
      .map((d: any) => ({ id: d.id, nome: d.name, tipo: d.type, ativo: !!d.is_active }));
  },

  async reproducao(token): Promise<Reproducao | null> {
    const r = await chamar(token, 'GET', '/me/player?additional_types=track');
    if (!r) return null;
    return {
      tocando: !!r.is_playing,
      progresso_ms: r.progress_ms ?? 0,
      dispositivo_id: r.device?.id ?? null,
      faixa: r.item && r.item.type === 'track' ? paraFaixa(r.item) : null,
    };
  },

  async adicionarNaFila(token, uri, deviceId) {
    const p = new URLSearchParams({ uri, device_id: deviceId });
    await chamar(token, 'POST', `/me/player/queue?${p}`);
  },
  async tocar(token, uri, deviceId) {
    await chamar(token, 'PUT', `/me/player/play?${new URLSearchParams({ device_id: deviceId })}`, { uris: [uri] });
  },
  async pausar(token, deviceId) {
    try {
      await chamar(token, 'PUT', `/me/player/pause?${new URLSearchParams({ device_id: deviceId })}`);
    } catch (e) {
      if (!restricao(e)) throw e;
    }
  },
  async retomar(token, deviceId) {
    try {
      await chamar(token, 'PUT', `/me/player/play?${new URLSearchParams({ device_id: deviceId })}`);
    } catch (e) {
      if (!restricao(e)) throw e;
    }
  },
  async proxima(token, deviceId) {
    await chamar(token, 'POST', `/me/player/next?${new URLSearchParams({ device_id: deviceId })}`);
  },
  async transferir(token, deviceId) {
    await chamar(token, 'PUT', '/me/player', { device_ids: [deviceId], play: false });
  },
};
