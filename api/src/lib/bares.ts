import { q1 } from '../db.js';
import { ErroHttp } from './erros.js';
import { planoEfetivo } from './planos.js';

export const ESTILOS_SUGERIDOS = [
  'Sertanejo', 'Pagode', 'Samba', 'MPB', 'Rock Nacional', 'Rock Internacional', 'Pop', 'Funk',
  'Forró', 'Axé', 'Eletrônica', 'Rap / Hip-hop', 'Reggae', 'Jazz / Blues', 'Gospel', 'Clássicos', 'Flashback',
];

/** Carrega um bar garantindo que pertence ao usuário logado. */
export async function barDoUsuario(barId: string, usuarioId: string) {
  const bar = await q1('select * from bares where id=$1 and usuario_id=$2', [barId, usuarioId]);
  if (!bar) throw new ErroHttp(404, 'Bar não encontrado');
  return bar;
}

/** Remove segredos antes de enviar ao painel. */
export function barParaPainel(bar: any) {
  const { mp_access_token_enc, ...resto } = bar;
  return {
    ...resto,
    mp_configurado: !!mp_access_token_enc,
    plano_efetivo: planoEfetivo(bar.plano, bar.plano_expira_em).id,
  };
}

export const slugificar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'bar';
