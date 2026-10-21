import { PLANOS, type PlanoId } from './planos.js';

export type SituacaoCobranca = 'gratuito' | 'em_dia' | 'vence_em_breve' | 'vencido' | 'bloqueado';
export const DIAS_AVISO_VENCIMENTO = 7;

/** Situação de cobrança do bar a partir do plano e da data de vencimento. */
export function situacaoCobranca(bar: { plano: string; plano_expira_em: Date | string | null; bloqueado?: boolean }) {
  const pago = (bar.plano as PlanoId) in PLANOS && bar.plano !== 'free';
  const dias = bar.plano_expira_em ? Math.ceil((new Date(bar.plano_expira_em).getTime() - Date.now()) / 86_400_000) : null;
  let situacao: SituacaoCobranca;
  if (bar.bloqueado) situacao = 'bloqueado';
  else if (!pago) situacao = 'gratuito';
  else if (dias === null || dias < 0) situacao = 'vencido';
  else if (dias <= DIAS_AVISO_VENCIMENTO) situacao = 'vence_em_breve';
  else situacao = 'em_dia';
  return { situacao, dias_para_vencer: pago ? dias : null };
}
