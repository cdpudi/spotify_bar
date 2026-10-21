export type PlanoId = 'free' | 'mensal' | 'semestral' | 'anual';

export interface Plano {
  id: PlanoId;
  nome: string;
  valorCentavos: number;
  dias: number;
  /** meses de cobrança, só para exibição */
  meses: number;
  superchat: boolean;
  catalogoMax: number;
  contasSpotifyMax: number;
  beneficios: string[];
}

export const PLANOS: Record<PlanoId, Plano> = {
  free: {
    id: 'free',
    nome: 'Free',
    valorCentavos: 0,
    dias: 0,
    meses: 0,
    superchat: false,
    catalogoMax: 30,
    contasSpotifyMax: 1,
    beneficios: ['Votação e fila ao vivo', 'Até 30 músicas no catálogo', '1 conta Spotify', 'QR Code do bar'],
  },
  mensal: {
    id: 'mensal',
    nome: 'Mensal',
    valorCentavos: 20000,
    dias: 30,
    meses: 1,
    superchat: true,
    catalogoMax: 5000,
    contasSpotifyMax: 10,
    beneficios: ['Super chat via Pix', 'Catálogo ilimitado', 'Várias contas e dispositivos Spotify', 'Tudo do plano Free'],
  },
  semestral: {
    id: 'semestral',
    nome: 'Semestral',
    valorCentavos: 100000,
    dias: 182,
    meses: 6,
    superchat: true,
    catalogoMax: 5000,
    contasSpotifyMax: 10,
    beneficios: ['Tudo do Mensal', 'Economia de R$ 200 no período'],
  },
  anual: {
    id: 'anual',
    nome: 'Anual',
    valorCentavos: 180000,
    dias: 365,
    meses: 12,
    superchat: true,
    catalogoMax: 5000,
    contasSpotifyMax: 10,
    beneficios: ['Tudo do Mensal', 'Economia de R$ 600 no período'],
  },
};

/** Plano em vigor: pago vencido volta para free. */
export function planoEfetivo(plano: string, expiraEm: Date | string | null): Plano {
  const p = PLANOS[plano as PlanoId] ?? PLANOS.free;
  if (p.id === 'free') return p;
  if (!expiraEm || new Date(expiraEm).getTime() < Date.now()) return PLANOS.free;
  return p;
}
