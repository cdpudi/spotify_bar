import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, q1, transacao } from '../db.js';
import { ErroHttp } from '../lib/erros.js';
import { montarEstado } from '../lib/estado.js';
import { distanciaMetros } from '../lib/geo.js';
import { planoEfetivo } from '../lib/planos.js';
import { criarPixSuperchat, statusPagamento } from '../payments/index.js';
import { pagamentoParaCliente } from './pagamentos.js';
import { inscrever, notificar } from '../realtime.js';

const LIMITE_BUSCA_KM = 20;

async function barPorSlug(slug: string) {
  const bar = await q1('select * from bares where slug=$1', [slug]);
  if (!bar || !bar.ativo) throw new ErroHttp(404, 'Bar não encontrado ou inativo');
  return bar;
}

/** O token de sessão só vale para o bar para o qual foi emitido. */
function exigirDoBar(req: any, bar: any) {
  if (req.user.bar !== bar.id) throw new ErroHttp(403, 'Sua sessão é de outro bar. Entre novamente.');
  return req.user.sid as string;
}

export async function rotasPublico(app: FastifyInstance) {
  const sessao = { preHandler: app.exigirSessao };

  // Bares próximos, por GPS
  app.get('/api/public/bares/proximos', async (req) => {
    const { lat, lng, km } = z
      .object({
        lat: z.coerce.number().min(-90).max(90),
        lng: z.coerce.number().min(-180).max(180),
        km: z.coerce.number().min(0.1).max(LIMITE_BUSCA_KM).default(5),
      })
      .parse(req.query);
    // pré-filtro por caixa delimitadora (índice) e refinamento por haversine
    const dLat = km / 111;
    const dLng = km / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
    const bares = await q(
      `select b.id, b.slug, b.nome, b.cidade, b.uf, b.bairro, b.latitude, b.longitude, b.raio_metros, b.estilos,
              p.nome as tocando_nome, p.artistas as tocando_artistas, p.capa_url as tocando_capa, coalesce(p.tocando,false) as tocando
         from bares b left join player_estado p on p.bar_id = b.id
        where b.ativo and b.latitude between $1 and $2 and b.longitude between $3 and $4`,
      [lat - dLat, lat + dLat, lng - dLng, lng + dLng],
    );
    return bares
      .map((b: any) => {
        const distancia_m = Math.round(distanciaMetros(lat, lng, b.latitude, b.longitude));
        return {
          slug: b.slug,
          nome: b.nome,
          bairro: b.bairro,
          cidade: b.cidade,
          uf: b.uf,
          estilos: b.estilos,
          distancia_m,
          dentro_do_raio: distancia_m <= b.raio_metros,
          tocando: b.tocando_nome ? { nome: b.tocando_nome, artistas: b.tocando_artistas, capa_url: b.tocando_capa } : null,
        };
      })
      .filter((b: any) => b.distancia_m <= km * 1000)
      .sort((a: any, b: any) => a.distancia_m - b.distancia_m);
  });

  app.get('/api/public/bares/:slug', async (req) => {
    const bar = await barPorSlug((req.params as any).slug);
    return { slug: bar.slug, nome: bar.nome, cidade: bar.cidade, uf: bar.uf, bairro: bar.bairro, estilos: bar.estilos };
  });

  /**
   * Entrada na sala. Duas vias:
   *  - QR Code (`q` = token do bar): entra direto, sem GPS;
   *  - GPS: precisa estar dentro do raio do bar.
   * Devolve um token de sessão anônima (uma identidade estável por aparelho, `sid`).
   */
  // Limite por IP (folgado: o wifi de um bar compartilha o mesmo IP público entre dezenas de clientes)
  app.post('/api/public/bares/:slug/entrar', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const bar = await barPorSlug((req.params as any).slug);
    const d = z
      .object({
        q: z.string().optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        precisao_m: z.number().min(0).max(5000).optional(),
        sid: z.string().uuid().optional(),
        apelido: z.string().trim().max(24).optional(),
      })
      .parse(req.body);

    let via: 'qr' | 'gps';
    if (d.q) {
      if (d.q !== bar.qr_token) throw new ErroHttp(403, 'QR Code inválido ou desatualizado. Peça um novo ao bar.');
      via = 'qr';
    } else {
      if (d.lat == null || d.lng == null) throw new ErroHttp(400, 'Ative o GPS para entrar neste bar');
      const dist = distanciaMetros(d.lat, d.lng, bar.latitude, bar.longitude);
      // tolera a imprecisão do GPS (limitada a 100 m)
      const folga = Math.min(d.precisao_m ?? 0, 100);
      if (dist > bar.raio_metros + folga) {
        throw new ErroHttp(403, `Você está a ${Math.round(dist)} m do bar. É preciso estar a até ${bar.raio_metros} m ou ler o QR Code do local.`);
      }
      via = 'gps';
    }
    const sid = d.sid ?? randomUUID();
    const token = app.jwt.sign({ tipo: 'sessao', sid, bar: bar.id, via, apelido: d.apelido || undefined }, { expiresIn: '12h' });
    return { token, sid, via, bar: { slug: bar.slug, nome: bar.nome } };
  });

  // Estado da sala (leitura aberta — não expõe dados pessoais). Com token, inclui os votos do visitante.
  app.get('/api/public/bares/:slug/estado', async (req) => {
    const bar = await barPorSlug((req.params as any).slug);
    let sid: string | undefined;
    try {
      await req.jwtVerify();
      if (req.user.tipo === 'sessao' && req.user.bar === bar.id) sid = req.user.sid;
    } catch {
      /* visitante sem sessão */
    }
    return montarEstado(bar.id, sid);
  });

  app.get('/api/public/bares/:slug/stream', async (req, reply) => {
    const bar = await barPorSlug((req.params as any).slug);
    reply.hijack();
    inscrever(bar.id, reply.raw, req.headers.origin);
  });

  app.get('/api/public/bares/:slug/catalogo', sessao, async (req) => {
    const bar = await barPorSlug((req.params as any).slug);
    exigirDoBar(req, bar);
    const { q: busca, estilo } = req.query as { q?: string; estilo?: string };
    const itens = await q(
      `select c.id, c.nome, c.artistas, c.album, c.capa_url, c.duracao_ms, c.estilo,
              (select f.status from fila f where f.bar_id=c.bar_id and f.spotify_track_id=c.spotify_track_id
                and f.status in ('pendente','enviada','tocando') order by f.criado_em desc limit 1) as na_fila
         from catalogo c
        where c.bar_id=$1 and ($2::text is null or c.estilo=$2)
          and ($3::text is null or (c.nome || ' ' || c.artistas) ilike '%' || $3 || '%')
        order by c.nome limit 200`,
      [bar.id, estilo || null, busca?.trim() || null],
    );
    return itens;
  });

  /**
   * Pedir uma música. Se ela já está esperando na fila, o pedido vira um voto.
   * Música tocada há pouco (cooldown) e excesso de pedidos por visitante são barrados.
   */
  app.post('/api/public/bares/:slug/fila', sessao, async (req, reply) => {
    const bar = await barPorSlug((req.params as any).slug);
    const sid = exigirDoBar(req, bar);
    const { catalogo_id } = z.object({ catalogo_id: z.string().uuid() }).parse(req.body);
    const item = await q1('select * from catalogo where id=$1 and bar_id=$2', [catalogo_id, bar.id]);
    if (!item) throw new ErroHttp(404, 'Música fora do catálogo deste bar');

    const resultado = await transacao(async (c) => {
      // serializa pedidos do mesmo bar para evitar duplicidade em corrida
      await c.query('select pg_advisory_xact_lock(hashtext($1))', [bar.id]);
      const { rows: atual } = await c.query(
        `select id, status from fila where bar_id=$1 and spotify_track_id=$2 and status in ('pendente','enviada','tocando') limit 1`,
        [bar.id, item.spotify_track_id],
      );
      if (atual[0]) {
        if (atual[0].status === 'tocando') throw new ErroHttp(409, 'Essa música está tocando agora');
        if (atual[0].status === 'enviada') throw new ErroHttp(409, 'Essa música é a próxima a tocar');
        const v = await c.query('insert into votos (fila_id, sessao_id) values ($1,$2) on conflict do nothing', [atual[0].id, sid]);
        if (!v.rowCount) throw new ErroHttp(409, 'Você já votou nessa música');
        return { id: atual[0].id, acao: 'voto' as const };
      }
      if (bar.cooldown_repeticao_min > 0) {
        const { rows: rec } = await c.query(
          `select 1 from fila where bar_id=$1 and spotify_track_id=$2 and status in ('tocada','tocando')
             and coalesce(finalizada_em, iniciada_em) > now() - make_interval(mins => $3) limit 1`,
          [bar.id, item.spotify_track_id, bar.cooldown_repeticao_min],
        );
        if (rec[0]) throw new ErroHttp(429, `Essa música tocou há menos de ${bar.cooldown_repeticao_min} minutos`);
      }
      const { rows: meus } = await c.query(
        `select count(*)::int as n from fila where bar_id=$1 and solicitante_sessao=$2 and status in ('pendente','enviada') and super=false`,
        [bar.id, sid],
      );
      if (meus[0].n >= bar.max_pedidos_por_sessao) {
        throw new ErroHttp(429, `Você já tem ${bar.max_pedidos_por_sessao} músicas na fila. Aguarde alguma tocar ou vote nas dos outros.`);
      }
      const { rows } = await c.query(
        `insert into fila (bar_id, catalogo_id, spotify_track_id, uri, nome, artistas, capa_url, duracao_ms, status, solicitante_sessao, solicitante_apelido)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9,$10) returning id`,
        [bar.id, item.id, item.spotify_track_id, item.uri, item.nome, item.artistas, item.capa_url, item.duracao_ms, sid, req.user.apelido ?? null],
      );
      // quem pede a música já conta como o primeiro voto
      await c.query('insert into votos (fila_id, sessao_id) values ($1,$2)', [rows[0].id, sid]);
      return { id: rows[0].id, acao: 'pedido' as const };
    });
    notificar(bar.id);
    return reply.code(201).send(resultado);
  });

  app.post('/api/public/bares/:slug/fila/:filaId/voto', sessao, async (req, reply) => {
    const bar = await barPorSlug((req.params as any).slug);
    const sid = exigirDoBar(req, bar);
    const f = await q1(`select id from fila where id=$1 and bar_id=$2 and status='pendente'`, [(req.params as any).filaId, bar.id]);
    if (!f) throw new ErroHttp(404, 'Essa música não aceita mais votos');
    const r = await q('insert into votos (fila_id, sessao_id) values ($1,$2) on conflict do nothing returning 1', [f.id, sid]);
    if (!r.length) throw new ErroHttp(409, 'Você já votou nessa música');
    notificar(bar.id);
    return reply.code(201).send({ ok: true });
  });

  app.delete('/api/public/bares/:slug/fila/:filaId/voto', sessao, async (req) => {
    const bar = await barPorSlug((req.params as any).slug);
    const sid = exigirDoBar(req, bar);
    await q(
      `delete from votos where fila_id=$1 and sessao_id=$2 and fila_id in (select id from fila where bar_id=$3 and status='pendente')`,
      [(req.params as any).filaId, sid, bar.id],
    );
    notificar(bar.id);
    return { ok: true };
  });

  // Super chat: paga via Pix para furar a fila
  app.post('/api/public/bares/:slug/superchat', { ...sessao, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const bar = await barPorSlug((req.params as any).slug);
    const sid = exigirDoBar(req, bar);
    if (!planoEfetivo(bar.plano, bar.plano_expira_em).superchat) throw new ErroHttp(403, 'Este bar não aceita super chat');
    const { catalogo_id } = z.object({ catalogo_id: z.string().uuid() }).parse(req.body);
    const item = await q1('select * from catalogo where id=$1 and bar_id=$2', [catalogo_id, bar.id]);
    if (!item) throw new ErroHttp(404, 'Música fora do catálogo deste bar');
    const atual = await q1(`select status, super from fila where bar_id=$1 and spotify_track_id=$2 and status in ('pendente','enviada','tocando') order by super desc limit 1`, [bar.id, item.spotify_track_id]);
    if (atual && (atual.status !== 'pendente' || atual.super)) throw new ErroHttp(409, 'Essa música já está tocando ou na vez');
    // no máximo 2 cobranças abertas por visitante
    const abertas = await q1(`select count(*)::int as n from pagamentos where bar_id=$1 and sessao_id=$2 and status='pendente'`, [bar.id, sid]);
    if (abertas!.n >= 2) throw new ErroHttp(429, 'Finalize ou aguarde expirar seus Pix pendentes');

    const f = await q1(
      `insert into fila (bar_id, catalogo_id, spotify_track_id, uri, nome, artistas, capa_url, duracao_ms, status, solicitante_sessao, solicitante_apelido)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'aguardando_pagamento',$9,$10) returning id`,
      [bar.id, item.id, item.spotify_track_id, item.uri, item.nome, item.artistas, item.capa_url, item.duracao_ms, sid, req.user.apelido ?? null],
    );
    try {
      const p = await criarPixSuperchat(bar, f.id, sid, bar.superchat_valor_centavos, `Super chat: ${item.nome}`);
      return reply.code(201).send({ ...pagamentoParaCliente(p), musica: item.nome });
    } catch (e) {
      await q(`update fila set status='removida' where id=$1`, [f.id]);
      throw new ErroHttp(502, `Não foi possível gerar o Pix: ${(e as Error).message}`);
    }
  });

  app.get('/api/public/pagamentos/:pid', sessao, async (req) => {
    const p = await q1('select sessao_id, bar_id from pagamentos where id=$1', [(req.params as any).pid]);
    if (!p || p.sessao_id !== req.user.sid) throw new ErroHttp(404, 'Pagamento não encontrado');
    return pagamentoParaCliente(await statusPagamento((req.params as any).pid));
  });
}
