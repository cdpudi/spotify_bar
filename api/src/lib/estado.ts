import { q, q1 } from '../db.js';
import { planoEfetivo } from './planos.js';

/** Ordem de execução: já enviada ao Spotify > super chat (por hora do pagamento) > mais votos > mais antiga. */
export const ORDEM_FILA = `
  (status = 'enviada') desc,
  super desc,
  super_pago_em asc nulls last,
  votos desc,
  criado_em asc`;

const COLUNAS_FILA = `
  f.id, f.nome, f.artistas, f.capa_url, f.duracao_ms, f.super, f.status, f.criado_em, f.super_pago_em,
  f.solicitante_apelido, f.catalogo_id, f.spotify_track_id,
  (select count(*)::int from votos v where v.fila_id = f.id) as votos`;

/** Estado público da sala: o que toca agora, a fila ordenada e os votos do visitante. */
export async function montarEstado(barId: string, sid?: string) {
  const bar = await q1(
    `select id, nome, slug, ativo, estilos, cidade, uf, plano, plano_expira_em, superchat_valor_centavos,
            max_pedidos_por_sessao, cooldown_repeticao_min
       from bares where id=$1`,
    [barId],
  );
  if (!bar) return null;
  const player = await q1('select * from player_estado where bar_id=$1', [barId]);

  const fila = await q(
    `select * from (
       select ${COLUNAS_FILA},
              exists(select 1 from votos v where v.fila_id = f.id and v.sessao_id = $2) as meu_voto,
              (f.solicitante_sessao = $2) as meu_pedido
         from fila f where f.bar_id = $1 and f.status in ('pendente','enviada')
     ) t order by ${ORDEM_FILA}`,
    [barId, sid ?? ''],
  );

  const plano = planoEfetivo(bar.plano, bar.plano_expira_em);
  return {
    agora: new Date().toISOString(),
    bar: {
      id: bar.id,
      nome: bar.nome,
      slug: bar.slug,
      ativo: bar.ativo,
      estilos: bar.estilos,
      cidade: bar.cidade,
      uf: bar.uf,
      superchat: plano.superchat,
      superchat_valor_centavos: bar.superchat_valor_centavos,
      max_pedidos_por_sessao: bar.max_pedidos_por_sessao,
    },
    tocando: player?.nome
      ? {
          nome: player.nome,
          artistas: player.artistas,
          capa_url: player.capa_url,
          duracao_ms: player.duracao_ms,
          progresso_ms: player.progresso_ms,
          tocando: player.tocando,
          atualizado_em: player.atualizado_em,
        }
      : null,
    player_online: player?.dispositivo_online ?? false,
    fila: fila.map((f: any, i: number) => ({ ...f, posicao: i + 1 })),
  };
}
