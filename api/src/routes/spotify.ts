import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { q, q1 } from '../db.js';
import { ErroHttp } from '../lib/erros.js';
import { cifrar } from '../lib/seguranca.js';
import { ErroSpotify, spotify, tokenDaConta } from '../spotify/index.js';

const contaPublica = `id, spotify_user_id, nome, email, produto, criado_em`;

export async function rotasSpotify(app: FastifyInstance) {
  const auth = { preHandler: app.exigirAdmin };

  app.get('/api/spotify/contas', auth, async (req) => {
    const contas = await q(
      `select ${contaPublica}, (select count(*)::int from bares b where b.spotify_conta_id = c.id) as bares_usando
         from spotify_contas c order by criado_em`,
    );
    return { modo: spotify.modo, contas };
  });

  // Inicia o OAuth: devolve a URL de autorização do Spotify
  app.get('/api/spotify/conectar', auth, async (req) => {
    if (spotify.modo === 'real' && (!config.spotify.clientId || !config.spotify.clientSecret)) {
      throw new ErroHttp(503, 'Integração Spotify não configurada no servidor (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)');
    }
    const state = app.jwt.sign({ tipo: 'spotify', sub: req.user.sub }, { expiresIn: '10m' });
    return { url: spotify.urlAutorizacao(state) };
  });

  // Retorno do Spotify (sem sessão: identifica o usuário pelo `state` assinado)
  app.get('/api/spotify/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const volta = (params: string) => reply.redirect(`${config.urlPublica}/admin/spotify?${params}`);
    if (error || !code || !state) return volta(`erro=${encodeURIComponent(error ?? 'autorização negada')}`);
    let usuarioId: string;
    try {
      const p: any = app.jwt.verify(state);
      if (p.tipo !== 'spotify') throw new Error();
      usuarioId = p.sub;
    } catch {
      return volta('erro=' + encodeURIComponent('Solicitação expirada, tente conectar novamente'));
    }
    try {
      const t = await spotify.trocarCodigo(code);
      const perfil = await spotify.perfil(t.access_token);
      if (perfil.produto && perfil.produto !== 'premium') {
        return volta('erro=' + encodeURIComponent('Esta conta Spotify não é Premium — o controle do player exige Premium.'));
      }
      await q(
        `insert into spotify_contas (usuario_id, spotify_user_id, nome, email, produto, access_token_enc, refresh_token_enc, expira_em)
         values ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(secs => $8))
         on conflict (usuario_id, spotify_user_id) do update set nome=$3, email=$4, produto=$5,
           access_token_enc=$6, refresh_token_enc=$7, expira_em=now() + make_interval(secs => $8)`,
        [usuarioId, perfil.id, perfil.nome, perfil.email, perfil.produto, cifrar(t.access_token), cifrar(t.refresh_token), t.expires_in],
      );
      return volta('conectado=1');
    } catch (e) {
      return volta('erro=' + encodeURIComponent((e as Error).message));
    }
  });

  app.delete('/api/spotify/contas/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const r = await q(
      `update bares set spotify_conta_id=null, spotify_device_id=null, spotify_device_nome=null where spotify_conta_id=$1 returning id`,
      [id],
    );
    await q('delete from spotify_contas where id=$1', [id]);
    return { ok: true, bares_desvinculados: r.length };
  });

  // Lista os dispositivos que a conta enxerga agora (apps do Spotify abertos)
  app.get('/api/spotify/contas/:id/dispositivos', auth, async (req) => {
    const { id } = req.params as { id: string };
    if (!(await q1('select 1 from spotify_contas where id=$1', [id]))) {
      throw new ErroHttp(404, 'Conta não encontrada');
    }
    try {
      const dispositivos = await spotify.dispositivos(await tokenDaConta(id));
      const usados = await q('select spotify_device_id, nome from bares where spotify_device_id = any($1)', [dispositivos.map((d) => d.id)]);
      return dispositivos.map((d) => ({ ...d, em_uso_por: usados.find((u: any) => u.spotify_device_id === d.id)?.nome ?? null }));
    } catch (e) {
      if (e instanceof ErroSpotify) throw new ErroHttp(502, e.message);
      throw e;
    }
  });
}
