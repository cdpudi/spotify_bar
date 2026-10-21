import { q } from '../db.js';

export interface FiltroPagamentos {
  barId?: string | null;
  usuarioId?: string | null; // restringe aos bares do dono
  tipo?: string | null;      // superchat | assinatura
  forma?: string | null;     // pix | dinheiro | outro
  status?: string | null;
  de?: string | null;
  ate?: string | null;
  limite?: number;
}

/** Pagamentos com bar, música e quem registrou, mais totais por forma de recebimento (apenas os pagos). */
export async function listarPagamentos(f: FiltroPagamentos) {
  const params = [f.barId ?? null, f.usuarioId ?? null, f.tipo ?? null, f.forma ?? null, f.status ?? null, f.de ?? null, f.ate ?? null];
  const onde = `
    ($1::uuid is null or p.bar_id = $1)
    and ($2::uuid is null or b.usuario_id = $2)
    and ($3::text is null or p.tipo = $3)
    and ($4::text is null or p.forma = $4)
    and ($5::text is null or p.status = $5)
    and ($6::date is null or coalesce(p.pago_em, p.criado_em) >= $6::date)
    and ($7::date is null or coalesce(p.pago_em, p.criado_em) < $7::date + 1)`;

  const itens = await q(
    `select p.id, p.tipo, p.status, p.forma, p.provider, p.plano, p.valor_centavos, p.observacao, p.criado_em, p.pago_em,
            p.referencia_inicio, p.referencia_fim, b.id as bar_id, b.nome as bar_nome, fl.nome as musica,
            ur.nome as registrado_por_nome
       from pagamentos p join bares b on b.id = p.bar_id
       left join fila fl on fl.id = p.fila_id
       left join usuarios ur on ur.id = p.registrado_por
      where ${onde}
      order by coalesce(p.pago_em, p.criado_em) desc limit ${Math.min(f.limite ?? 200, 500)}`,
    params,
  );
  const totais = await q(
    `select p.tipo, p.forma, count(*)::int as quantidade, coalesce(sum(p.valor_centavos),0)::int as valor_centavos
       from pagamentos p join bares b on b.id = p.bar_id
      where p.status = 'pago' and ${onde}
      group by p.tipo, p.forma order by p.tipo, p.forma`,
    params,
  );
  return { itens, totais };
}
