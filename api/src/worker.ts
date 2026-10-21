import { config } from './config.js';
import { q, q1 } from './db.js';
import { ORDEM_FILA } from './lib/estado.js';
import { varrerPagamentos } from './payments/index.js';
import { notificar } from './realtime.js';
import { spotify, tokenDaConta } from './spotify/index.js';

/**
 * Motor do player. A cada ciclo, para cada bar com conta+dispositivo Spotify:
 *  1. lê o que está tocando e grava em player_estado;
 *  2. sincroniza a fila (enviada -> tocando -> tocada);
 *  3. quando a faixa está acabando (ou nada toca), escolhe a próxima da fila
 *     (super chat > mais votos > mais antiga) e a envia para a fila do Spotify.
 */

const PROXIMA_SQL = `
  select * from (
    select f.*, (select count(*)::int from votos v where v.fila_id = f.id) as votos
      from fila f where f.bar_id = $1 and f.status = 'pendente'
  ) t order by ${ORDEM_FILA} limit 1`;

async function processarBar(bar: any) {
  const token = await tokenDaConta(bar.spotify_conta_id);
  const rep = await spotify.reproducao(token, bar.spotify_device_id);
  const noDispositivo = !!rep && rep.dispositivo_id === bar.spotify_device_id;
  const faixa = noDispositivo ? rep!.faixa : null;
  const antes = await q1('select track_id, nome, tocando, dispositivo_online, erro from player_estado where bar_id=$1', [bar.id]);

  // 1) estado do player
  await q(
    `insert into player_estado (bar_id, track_id, nome, artistas, capa_url, duracao_ms, progresso_ms, tocando, dispositivo_online, erro, atualizado_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null, now())
     on conflict (bar_id) do update set track_id=$2, nome=$3, artistas=$4, capa_url=$5, duracao_ms=$6,
       progresso_ms=$7, tocando=$8, dispositivo_online=$9, erro=null, atualizado_em=now()`,
    [
      bar.id,
      faixa?.id ?? null,
      faixa?.nome ?? null,
      faixa?.artistas ?? null,
      faixa?.capa_url ?? null,
      faixa?.duracao_ms ?? null,
      noDispositivo ? rep!.progresso_ms : 0,
      noDispositivo ? rep!.tocando : false,
      noDispositivo || !!rep,
    ],
  );

  let mudou = (antes?.track_id ?? null) !== (faixa?.id ?? null) || antes?.tocando !== (noDispositivo ? rep!.tocando : false) || !antes?.dispositivo_online;

  // 2) sincroniza a fila com o que realmente está tocando
  if (faixa) {
    const t = await q1(`select id from fila where bar_id=$1 and status='tocando' and spotify_track_id=$2`, [bar.id, faixa.id]);
    if (!t) {
      await q(`update fila set status='tocada', finalizada_em=now() where bar_id=$1 and status='tocando'`, [bar.id]);
      const env = await q1(
        `update fila set status='tocando', iniciada_em=now() where id = (
           select id from fila where bar_id=$1 and status='enviada' and spotify_track_id=$2 order by enviada_em limit 1) returning id`,
        [bar.id, faixa.id],
      );
      if (env) mudou = true;
    }
  } else {
    await q(`update fila set status='tocada', finalizada_em=now() where bar_id=$1 and status='tocando'`, [bar.id]);
  }

  // "enviada" que nunca começou (o usuário limpou a fila do Spotify, trocou de música...) volta para a fila
  const reverteu = await q(
    `update fila set status='pendente', enviada_em=null
      where bar_id=$1 and status='enviada' and enviada_em < now() - interval '15 minutes' returning id`,
    [bar.id],
  );
  if (reverteu.length) mudou = true;

  // 3) agenda a próxima
  if (noDispositivo || !rep) {
    const restante = faixa ? faixa.duracao_ms - rep!.progresso_ms : 0;
    const ociosa = !faixa;
    const acabando = !!faixa && rep!.tocando && restante <= config.spotify.antecedenciaMs;
    const jaEnviada = await q1(`select 1 from fila where bar_id=$1 and status='enviada'`, [bar.id]);
    if ((ociosa || acabando) && !jaEnviada) {
      const prox = await q1(PROXIMA_SQL, [bar.id]);
      if (prox) {
        if (ociosa) await spotify.tocar(token, prox.uri, bar.spotify_device_id);
        else await spotify.adicionarNaFila(token, prox.uri, bar.spotify_device_id);
        await q(`update fila set status='enviada', enviada_em=now() where id=$1`, [prox.id]);
        mudou = true;
      }
    }
  }

  if (mudou) notificar(bar.id);
}

let rodando = false;
async function ciclo() {
  if (rodando) return;
  rodando = true;
  try {
    const bares = await q(
      `select id, spotify_conta_id, spotify_device_id from bares
        where ativo and spotify_conta_id is not null and spotify_device_id is not null`,
    );
    for (const bar of bares) {
      try {
        await processarBar(bar);
      } catch (e) {
        const msg = (e as Error).message;
        console.error(`[player] bar ${bar.id}:`, msg);
        await q(
          `insert into player_estado (bar_id, erro, dispositivo_online, atualizado_em) values ($1,$2,false,now())
           on conflict (bar_id) do update set erro=$2, dispositivo_online=false, atualizado_em=now()`,
          [bar.id, msg.slice(0, 300)],
        );
        notificar(bar.id);
      }
    }
  } finally {
    rodando = false;
  }
}

export function iniciarWorker() {
  setInterval(() => void ciclo(), config.spotify.pollMs);
  setInterval(() => void varrerPagamentos().catch((e) => console.error('[pix]', e.message)), 15_000);
  console.log(`[player] worker iniciado (modo spotify=${spotify.modo}, ciclo ${config.spotify.pollMs}ms)`);
}

export { ciclo as executarCicloAgora };
