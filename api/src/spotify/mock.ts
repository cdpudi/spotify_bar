import { config } from '../config.js';
import type { Dispositivo, Faixa, Reproducao, SpotifyProvider } from './tipos.js';

/**
 * Spotify simulado para desenvolvimento/testes sem credenciais (SPOTIFY_MODE=mock).
 * Reproduz o comportamento essencial: dispositivos, fila do Spotify, avanço automático
 * de faixa. As durações são curtas de propósito, para acelerar os testes.
 */

const faixa = (n: number, nome: string, artistas: string, album: string, segundos: number): Faixa => ({
  id: `mock${String(n).padStart(3, '0')}`,
  uri: `spotify:track:mock${String(n).padStart(3, '0')}`,
  nome,
  artistas,
  album,
  capa_url: null,
  duracao_ms: segundos * 1000,
});

export const BIBLIOTECA_MOCK: Faixa[] = [
  faixa(1, 'Evidências', 'Chitãozinho & Xororó', 'Clássicos Sertanejos', 60),
  faixa(2, 'Largado às Traças', 'Zé Neto & Cristiano', 'Ao Vivo', 55),
  faixa(3, 'Boa Sorte', 'Henrique & Juliano', 'Ao Vivo em Brasília', 50),
  faixa(4, 'Garota de Ipanema', 'Tom Jobim', 'Clássicos da MPB', 45),
  faixa(5, 'Como Uma Onda', 'Lulu Santos', 'Eu e Memê', 60),
  faixa(6, 'Tempo Perdido', 'Legião Urbana', 'Dois', 55),
  faixa(7, 'Pais e Filhos', 'Legião Urbana', 'As Quatro Estações', 50),
  faixa(8, 'Wonderwall', 'Oasis', "(What's the Story) Morning Glory?", 60),
  faixa(9, "Don't Stop Believin'", 'Journey', 'Escape', 55),
  faixa(10, 'Sweet Child O Mine', "Guns N' Roses", 'Appetite for Destruction', 60),
  faixa(11, 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 65),
  faixa(12, 'Dancing Queen', 'ABBA', 'Arrival', 50),
  faixa(13, 'Faz Gostoso', 'Veronica Bortolini', 'Pagode Hits', 45),
  faixa(14, 'Deixa Acontecer', 'Grupo Revelação', 'Ao Vivo', 50),
  faixa(15, 'Tá Tranquilo, Tá Favorável', 'MC Hariel', 'Funk Hits', 40),
  faixa(16, 'Ela É do Tipo', 'Kevin o Chris', 'Funk Hits', 45),
  faixa(17, 'Forró no Escuro', 'Luiz Gonzaga', 'O Rei do Baião', 50),
  faixa(18, 'Xote dos Milagres', 'Falamansa', 'Deixa Entrar', 45),
  faixa(19, 'Get Lucky', 'Daft Punk', 'Random Access Memories', 60),
  faixa(20, 'Levels', 'Avicii', 'Levels', 55),
  faixa(21, 'No Woman, No Cry', 'Bob Marley & The Wailers', 'Natty Dread', 60),
  faixa(22, 'Three Little Birds', 'Bob Marley & The Wailers', 'Exodus', 45),
  faixa(23, 'Shape of You', 'Ed Sheeran', '÷', 50),
  faixa(24, 'Blinding Lights', 'The Weeknd', 'After Hours', 50),
  faixa(25, 'Trem-Bala', 'Ana Vilela', 'Ana Vilela', 45),
  faixa(26, 'Ai Se Eu Te Pego', 'Michel Teló', 'Ai Se Eu Te Pego', 40),
];

interface EstadoDispositivo {
  atual: Faixa | null;
  iniciouEm: number; // timestamp quando começou (ajustado por pausas)
  pausadoEm: number | null;
  fila: Faixa[];
}

const dispositivos = new Map<string, EstadoDispositivo>();
const vazio = (): EstadoDispositivo => ({ atual: null, iniciouEm: 0, pausadoEm: null, fila: [] });
const dev = (id: string) => {
  if (!dispositivos.has(id)) dispositivos.set(id, vazio());
  return dispositivos.get(id)!;
};
const porUri = (uri: string) => BIBLIOTECA_MOCK.find((f) => f.uri === uri) ?? BIBLIOTECA_MOCK[0];

/** Avança as faixas conforme o relógio, como o Spotify faria sozinho. */
function atualizar(e: EstadoDispositivo) {
  if (!e.atual || e.pausadoEm !== null) return;
  for (;;) {
    if (!e.atual) return;
    const fim = e.iniciouEm + e.atual.duracao_ms;
    if (Date.now() < fim) return;
    const proxima = e.fila.shift() ?? null;
    e.atual = proxima;
    e.iniciouEm = fim;
    if (!proxima) return;
  }
}

export const spotifyMock: SpotifyProvider = {
  modo: 'mock',

  urlAutorizacao(state) {
    return `${config.urlApi}/api/spotify/callback?code=mock-${Math.random().toString(36).slice(2, 8)}&state=${encodeURIComponent(state)}`;
  },
  // No mock cada "código" vira uma conta distinta: o token carrega o código.
  async trocarCodigo(codigo) {
    return { access_token: codigo, refresh_token: codigo, expires_in: 3600 };
  },
  async renovar(refreshToken) {
    return { access_token: refreshToken, expires_in: 3600 };
  },
  async perfil(token) {
    return { id: token, nome: `Conta Demo ${token.slice(-4).toUpperCase()}`, email: 'demo@spotify.mock', produto: 'premium' };
  },
  async buscar(_t, termo) {
    const n = termo.trim().toLowerCase();
    return BIBLIOTECA_MOCK.filter((f) => `${f.nome} ${f.artistas} ${f.album}`.toLowerCase().includes(n)).slice(0, 10);
  },
  async dispositivos(token): Promise<Dispositivo[]> {
    return [
      { id: `celular-bar:${token}`, nome: 'Celular do Bar (demo)', tipo: 'Smartphone', ativo: true },
      { id: `caixa-som:${token}`, nome: 'Caixa de som (demo)', tipo: 'Speaker', ativo: false },
    ];
  },
  async reproducao(_token, deviceId): Promise<Reproducao | null> {
    if (!deviceId) return null;
    const e = dev(deviceId);
    atualizar(e);
    if (!e.atual) return { tocando: false, progresso_ms: 0, dispositivo_id: deviceId, faixa: null };
    const ref = e.pausadoEm ?? Date.now();
    return { tocando: e.pausadoEm === null, progresso_ms: Math.max(0, ref - e.iniciouEm), dispositivo_id: deviceId, faixa: e.atual };
  },
  async adicionarNaFila(_t, uri, deviceId) {
    const e = dev(deviceId);
    atualizar(e);
    if (!e.atual) {
      e.atual = porUri(uri);
      e.iniciouEm = Date.now();
      e.pausadoEm = null;
    } else e.fila.push(porUri(uri));
  },
  async tocar(_t, uri, deviceId) {
    const e = dev(deviceId);
    e.atual = porUri(uri);
    e.iniciouEm = Date.now();
    e.pausadoEm = null;
  },
  async pausar(_t, deviceId) {
    const e = dev(deviceId);
    atualizar(e);
    if (e.atual && e.pausadoEm === null) e.pausadoEm = Date.now();
  },
  async retomar(_t, deviceId) {
    const e = dev(deviceId);
    if (e.pausadoEm !== null) {
      e.iniciouEm += Date.now() - e.pausadoEm;
      e.pausadoEm = null;
    }
  },
  async proxima(_t, deviceId) {
    const e = dev(deviceId);
    atualizar(e);
    e.atual = e.fila.shift() ?? null;
    e.iniciouEm = Date.now();
    e.pausadoEm = null;
  },
  async transferir() {
    /* sem efeito no mock */
  },
};

/** Só para testes: zera o estado dos dispositivos simulados. */
export function resetarMock() {
  dispositivos.clear();
}
