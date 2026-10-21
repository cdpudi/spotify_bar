export interface Faixa {
  id: string;
  uri: string;
  nome: string;
  artistas: string;
  album: string;
  capa_url: string | null;
  duracao_ms: number;
}

export interface Dispositivo {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
}

export interface Reproducao {
  tocando: boolean;
  progresso_ms: number;
  dispositivo_id: string | null;
  faixa: Faixa | null;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface PerfilSpotify {
  id: string;
  nome: string;
  email: string | null;
  produto: string | null;
}

/** Credenciais de um aplicativo Spotify (Client ID/Secret). */
export interface Credenciais {
  clientId: string;
  clientSecret: string;
}

export interface SpotifyProvider {
  modo: 'mock' | 'real';
  urlAutorizacao(state: string, cred: Credenciais): string;
  /** Confere se o Client ID/Secret são aceitos pelo Spotify (client credentials). */
  validarCredenciais(cred: Credenciais): Promise<void>;
  trocarCodigo(codigo: string, cred: Credenciais): Promise<Tokens>;
  renovar(refreshToken: string, cred: Credenciais): Promise<Omit<Tokens, 'refresh_token'> & { refresh_token?: string }>;
  perfil(token: string): Promise<PerfilSpotify>;
  buscar(token: string, termo: string): Promise<Faixa[]>;
  dispositivos(token: string): Promise<Dispositivo[]>;
  reproducao(token: string, deviceId?: string | null): Promise<Reproducao | null>;
  adicionarNaFila(token: string, uri: string, deviceId: string): Promise<void>;
  tocar(token: string, uri: string, deviceId: string): Promise<void>;
  pausar(token: string, deviceId: string): Promise<void>;
  retomar(token: string, deviceId: string): Promise<void>;
  proxima(token: string, deviceId: string): Promise<void>;
  transferir(token: string, deviceId: string): Promise<void>;
}

export class ErroSpotify extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}
