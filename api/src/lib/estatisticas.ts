import { q, q1 } from '../db.js';

export interface FiltroEstat {
  barId?: string | null;
  usuarioId?: string | null; // restringe aos bares do dono
  de?: string | null;
  ate?: string | null;
}

/** Pedidos = músicas que entraram na fila (inclui super chat pago); votos = soma de votos recebidos. */
export async function estatisticas(f: FiltroEstat) {
  const params = [f.barId ?? null, f.usuarioId ?? null, f.de ?? null, f.ate ?? null];
  const onde = `
    f.status not in ('aguardando_pagamento','removida') and not f.automatica
    and ($1::uuid is null or f.bar_id = $1)
    and ($2::uuid is null or b.usuario_id = $2)
    and ($3::date is null or f.criado_em >= $3::date)
    and ($4::date is null or f.criado_em < $4::date + 1)`;

  const resumo = await q1(
    `select count(*)::int as pedidos,
            count(*) filter (where f.status in ('tocando','tocada'))::int as tocadas,
            count(*) filter (where f.super)::int as superchats,
            coalesce(sum((select count(*) from votos v where v.fila_id = f.id)),0)::int as votos,
            count(distinct f.solicitante_sessao)::int as participantes
       from fila f join bares b on b.id = f.bar_id where ${onde}`,
    params,
  );
  const top = await q(
    `select f.spotify_track_id, max(f.nome) as nome, max(f.artistas) as artistas, max(f.capa_url) as capa_url,
            count(*)::int as pedidos,
            count(*) filter (where f.status in ('tocando','tocada'))::int as tocadas,
            count(*) filter (where f.super)::int as superchats,
            coalesce(sum((select count(*) from votos v where v.fila_id = f.id)),0)::int as votos
       from fila f join bares b on b.id = f.bar_id where ${onde}
      group by f.spotify_track_id order by pedidos desc, votos desc, nome limit 20`,
    params,
  );
  const porBar = f.barId
    ? []
    : await q(
        `select b.id, b.nome, count(*)::int as pedidos,
                count(*) filter (where f.status in ('tocando','tocada'))::int as tocadas
           from fila f join bares b on b.id = f.bar_id where ${onde} group by b.id, b.nome order by pedidos desc limit 50`,
        params,
      );
  const porDia = await q(
    `select to_char(f.criado_em::date,'YYYY-MM-DD') as dia, count(*)::int as pedidos
       from fila f join bares b on b.id = f.bar_id where ${onde} group by 1 order by 1 desc limit 31`,
    params,
  );
  return { resumo, top, por_bar: porBar, por_dia: porDia.reverse() };
}
