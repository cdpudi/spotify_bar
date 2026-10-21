export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function tempo(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function distancia(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Gradiente determinístico a partir do texto, usado quando a música não tem capa. */
export function gradiente(texto: string) {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 65% 42%), hsl(${(h + 55) % 360} 70% 28%))`;
}

export const iniciais = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export const FORMAS: Record<string, string> = { pix: 'Pix', dinheiro: 'Dinheiro', outro: 'Outro' };
export const TIPOS: Record<string, string> = { superchat: 'Super chat', assinatura: 'Mensalidade' };
export const SITUACOES: Record<string, { rotulo: string; tom: 'neutro' | 'ouro' | 'ok' | 'erro' }> = {
  gratuito: { rotulo: 'Free', tom: 'neutro' },
  em_dia: { rotulo: 'Em dia', tom: 'ok' },
  vence_em_breve: { rotulo: 'Vence em breve', tom: 'ouro' },
  vencido: { rotulo: 'Vencido', tom: 'erro' },
  bloqueado: { rotulo: 'Bloqueado', tom: 'erro' },
};

/** "vence em 5 dias" / "venceu há 3 dias" */
export function textoVencimento(dias: number | null | undefined) {
  if (dias == null) return '—';
  if (dias === 0) return 'vence hoje';
  return dias > 0 ? `em ${dias} dia${dias === 1 ? '' : 's'}` : `há ${-dias} dia${dias === -1 ? '' : 's'}`;
}
