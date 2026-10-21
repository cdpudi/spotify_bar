import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';

export interface BarAdmin {
  id: string;
  nome: string;
  slug: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  raio_metros: number;
  ativo: boolean;
  playlist_automatica: boolean;
  plano: string;
  plano_efetivo: 'free' | 'mensal' | 'semestral' | 'anual';
  plano_expira_em: string | null;
  estilos: string[];
  max_pedidos_por_sessao: number;
  cooldown_repeticao_min: number;
  superchat_valor_centavos: number;
  spotify_conta_id: string | null;
  spotify_device_id: string | null;
  spotify_device_nome: string | null;
  pix_provider: 'estatico' | 'mercadopago';
  pix_chave: string | null;
  pix_titular: string | null;
  mp_configurado: boolean;
  usuario_id: string;
  usuario_nome?: string;
  usuario_email?: string;
  bloqueado: boolean;
  motivo_bloqueio: string | null;
  situacao: string;
  dias_para_vencer: number | null;
}

interface Ctx {
  bares: BarAdmin[] | null;
  bar: BarAdmin | null;
  selecionar(id: string): void;
  recarregar(): Promise<void>;
}
const BarCtx = createContext<Ctx>(null as never);
const CHAVE = 'sb:bar-ativo';

export function BarProvider({ children }: { children: ReactNode }) {
  const { req } = useAuth();
  const [bares, setBares] = useState<BarAdmin[] | null>(null);
  const [id, setId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE);
    } catch {
      return null;
    }
  });

  const recarregar = useCallback(async () => {
    setBares(await req<BarAdmin[]>('GET', '/api/bares'));
  }, [req]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const valor = useMemo<Ctx>(() => {
    const bar = bares?.find((b) => b.id === id) ?? bares?.[0] ?? null;
    return {
      bares,
      bar,
      recarregar,
      selecionar(novo) {
        setId(novo);
        try {
          localStorage.setItem(CHAVE, novo);
        } catch {
          /* ignore */
        }
      },
    };
  }, [bares, id, recarregar]);

  return <BarCtx.Provider value={valor}>{children}</BarCtx.Provider>;
}

export const useBar = () => useContext(BarCtx);
