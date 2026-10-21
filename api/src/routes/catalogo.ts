import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, q1 } from '../db.js';
import { barDoUsuario } from '../lib/bares.js';
import { ErroHttp } from '../lib/erros.js';
import { planoEfetivo } from '../lib/planos.js';
import { ErroSpotify, spotify, tokenDaConta } from '../spotify/index.js';

const faixaSchema = z.object({
  spotify_track_id: z.string().min(1),
  uri: z.string().startsWith('spotify:track:'),
  nome: z.string().min(1).max(300),
  artistas: z.string().min(1).max(300),
  album: z.string().max(300).nullable().optional(),
  capa_url: z.string().url().nullable().optional(),
  duracao_ms: z.number().int().positive(),
  estilo: z.string().trim().min(2).max(40),
});

export async function rotasCatalogo(app: FastifyInstance) {
  const auth = { preHandler: app.exigirUsuario };

  app.get('/api/bares/:id/catalogo', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const itens = await q('select * from catalogo where bar_id=$1 order by estilo, nome', [bar.id]);
    const plano = planoEfetivo(bar.plano, bar.plano_expira_em);
    return { limite: plano.catalogoMax, itens };
  });

  // Busca no Spotify usando a conta vinculada ao bar
  app.get('/api/bares/:id/spotify/buscar', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const termo = z.string().trim().min(2).parse((req.query as any).q);
    if (!bar.spotify_conta_id) throw new ErroHttp(409, 'Vincule uma conta Spotify ao bar para buscar músicas');
    try {
      const faixas = await spotify.buscar(await tokenDaConta(bar.spotify_conta_id), termo);
      const ja = await q('select spotify_track_id from catalogo where bar_id=$1', [bar.id]);
      const set = new Set(ja.map((r: any) => r.spotify_track_id));
      return faixas.map((f) => ({ ...f, no_catalogo: set.has(f.id) }));
    } catch (e) {
      if (e instanceof ErroSpotify) throw new ErroHttp(502, e.message);
      throw e;
    }
  });

  app.post('/api/bares/:id/catalogo', auth, async (req, reply) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const d = faixaSchema.parse(req.body);
    // Regra central: só entra no catálogo música classificada num estilo permitido pelo bar
    if (!bar.estilos.length) throw new ErroHttp(409, 'Defina os estilos musicais do bar antes de montar o catálogo');
    if (!bar.estilos.includes(d.estilo)) throw new ErroHttp(400, `O estilo "${d.estilo}" não está entre os estilos permitidos do bar`);
    const plano = planoEfetivo(bar.plano, bar.plano_expira_em);
    const total = (await q1('select count(*)::int as n from catalogo where bar_id=$1', [bar.id]))!.n;
    if (total >= plano.catalogoMax) {
      throw new ErroHttp(402, `Limite de ${plano.catalogoMax} músicas do plano ${plano.nome} atingido. Assine um plano para ampliar.`);
    }
    const item = await q1(
      `insert into catalogo (bar_id, spotify_track_id, uri, nome, artistas, album, capa_url, duracao_ms, estilo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (bar_id, spotify_track_id) do update set estilo=$9 returning *`,
      [bar.id, d.spotify_track_id, d.uri, d.nome, d.artistas, d.album ?? null, d.capa_url ?? null, d.duracao_ms, d.estilo],
    );
    return reply.code(201).send(item);
  });

  app.patch('/api/bares/:id/catalogo/:itemId', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const { estilo } = z.object({ estilo: z.string().trim().min(2) }).parse(req.body);
    if (!bar.estilos.includes(estilo)) throw new ErroHttp(400, 'Estilo não permitido neste bar');
    const item = await q1('update catalogo set estilo=$3 where id=$2 and bar_id=$1 returning *', [bar.id, (req.params as any).itemId, estilo]);
    if (!item) throw new ErroHttp(404, 'Item não encontrado');
    return item;
  });

  app.delete('/api/bares/:id/catalogo/:itemId', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    await q('delete from catalogo where id=$2 and bar_id=$1', [bar.id, (req.params as any).itemId]);
    return { ok: true };
  });
}
