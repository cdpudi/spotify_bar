import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export interface ItemFila {
  id: string;
  nome: string;
  artistas: string;
  capa_url: string | null;
  duracao_ms: number;
  super: boolean;
  status: 'pendente' | 'enviada';
  votos: number;
  meu_voto: boolean;
  meu_pedido: boolean;
  posicao: number;
  solicitante_apelido: string | null;
  automatica: boolean;
}

export interface EstadoSala {
  agora: string;
  bar: {
    id: string; nome: string; slug: string; ativo: boolean; estilos: string[]; cidade: string; uf: string;
    superchat: boolean; superchat_valor_centavos: number; max_pedidos_por_sessao: number;
  };
  tocando: null | {
    nome: string; artistas: string; capa_url: string | null; duracao_ms: number;
    progresso_ms: number; tocando: boolean; atualizado_em: string; automatica: boolean;
  };
  player_online: boolean;
  fila: ItemFila[];
}

// ---------- sessão anônima por aparelho ----------
const lerLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravarLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export function sidDoAparelho(): string {
  let sid = lerLS('sb:sid');
  if (!sid) {
    sid = crypto.randomUUID();
    gravarLS('sb:sid', sid);
  }
  return sid;
}

export const apelido = () => lerLS('sb:apelido') ?? '';
export const salvarApelido = (v: string) => gravarLS('sb:apelido', v.trim().slice(0, 24));

/** Token da sala guardado só enquanto não expira (12 h). */
export function tokenSalvo(slug: string): string | null {
  const t = lerLS(`sb:tok:${slug}`);
  if (!t) return null;
  try {
    const { exp } = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return exp * 1000 > Date.now() + 60_000 ? t : null;
  } catch {
    return null;
  }
}

export async function entrarNaSala(slug: string, dados: { q?: string; lat?: number; lng?: number; precisao_m?: number }) {
  const r = await api<{ token: string; via: 'qr' | 'gps' }>('POST', `/api/public/bares/${slug}/entrar`, {
    ...dados,
    sid: sidDoAparelho(),
    apelido: apelido() || undefined,
  });
  gravarLS(`sb:tok:${slug}`, r.token);
  return r;
}

export function posicaoAtual(): Promise<GeolocationPosition> {
  return new Promise((ok, erro) => {
    if (!('geolocation' in navigator)) return erro(new Error('Seu navegador não suporta localização.'));
    navigator.geolocation.getCurrentPosition(ok, (e) => {
      erro(
        new Error(
          e.code === 1
            ? 'Permissão de localização negada. Ative o GPS nas configurações do navegador ou leia o QR Code do bar.'
            : e.code === 3
              ? 'Não conseguimos obter sua localização a tempo. Tente novamente.'
              : 'Não foi possível obter sua localização.',
        ),
      );
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

/** Estado da sala em tempo real: SSE dispara o refetch; há polling de segurança. */
export function useSala(slug: string, token: string | null) {
  const [estado, setEstado] = useState<EstadoSala | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [skewMs, setSkew] = useState(0);
  const tokRef = useRef(token);
  tokRef.current = token;

  const carregar = useCallback(async () => {
    try {
      const e = await api<EstadoSala>('GET', `/api/public/bares/${slug}/estado`, undefined, tokRef.current);
      setSkew(new Date(e.agora).getTime() - Date.now());
      setEstado(e);
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar, token]);

  useEffect(() => {
    const es = new EventSource(`/api/public/bares/${slug}/stream`);
    es.addEventListener('estado', () => void carregar());
    const poll = setInterval(() => void carregar(), 8000);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [slug, carregar]);

  return { estado, erro, skewMs, recarregar: carregar };
}

/** Progresso suave da faixa atual, extrapolado entre atualizações do servidor (skew = relógio do servidor - do aparelho). */
export function useProgresso(t: EstadoSala['tocando'], skewMs: number) {
  const [, forcar] = useState(0);
  useEffect(() => {
    if (!t?.tocando) return;
    const i = setInterval(() => forcar((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [t?.tocando, t?.nome]);
  if (!t) return 0;
  if (!t.tocando) return t.progresso_ms;
  const idade = Math.max(0, Date.now() + skewMs - new Date(t.atualizado_em).getTime());
  return Math.min(t.duracao_ms, t.progresso_ms + idade);
}
