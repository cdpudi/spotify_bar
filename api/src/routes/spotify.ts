import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, q1 } from '../db.js';
import { ErroHttp } from '../lib/erros.js';
import { cifrar } from '../lib/seguranca.js';
import { credenciaisDoApp, ErroSpotify, spotify, tokenDaConta } from '../spotify/index.js';

/** Aceita só a origem pública configurada ou localhost/127.0.0.1 (desenvolvimento). */
function origemPermitida(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  try {
    const u = new URL(valor);
    const ok = u.origin === new URL(config.urlPublica).origin || ['localhost', '127.0.0.1'].includes(u.hostname);
    return ok ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

const PLANOS_SPOTIFY = ['individual', 'duo', 'familia'] as const;

/** Apps com lugares ocupados (contas vinculadas) e livres. */
async function listarApps() {
  const apps = await q(
    `select a.id, a.nome, a.client_id, a.limite_usuarios, a.ativo, a.criado_em,
            (select count(*)::int from spotify_contas c where c.app_id = a.id) as usados
       from spotify_apps a order by a.criado_em`,
  );
  return apps.map((a: any) => ({ ...a, livres: Math.max(0, a.limite_usuarios - a.usados) }));
}

export async function rotasSpotify(app: FastifyInstance) {
  const auth = { preHandler: app.exigirAdmin };

  // ---------- Aplicativos (Client ID / Secret) ----------
  app.get('/api/spotify/apps', auth, async () => listarApps());

  const corpoApp = z.object({
    nome: z.string().trim().min(2).max(80),
    client_id: z.string().trim().min(10).max(64),
    client_secret: z.string().trim().min(10).max(128),
    limite_usuarios: z.number().int().min(1).max(1000).default(5),
  });

  app.post('/api/spotify/apps', auth, async (req, reply) => {
    const d = corpoApp.parse(req.body);
    if (await q1('select 1 from spotify_apps where client_id=$1', [d.client_id])) throw new ErroHttp(409, 'Este Client ID já está cadastrado');
    try {
      await spotify.validarCredenciais({ clientId: d.client_id, clientSecret: d.client_secret });
    } catch (e) {
      throw new ErroHttp(400, `O Spotify não aceitou essas credenciais: ${(e as Error).message}`);
    }
    const a = await q1(
      `insert into spotify_apps (nome, client_id, client_secret_enc, limite_usuarios) values ($1,$2,$3,$4) returning id, nome, client_id, limite_usuarios, ativo`,
      [d.nome, d.client_id, cifrar(d.client_secret), d.limite_usuarios],
    );
    return reply.code(201).send({ ...a, usados: 0, livres: a.limite_usuarios });
  });

  app.patch('/api/spotify/apps/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const d = z
      .object({
        nome: z.string().trim().min(2).max(80).optional(),
        limite_usuarios: z.number().int().min(1).max(1000).optional(),
        ativo: z.boolean().optional(),
        client_secret: z.string().trim().min(10).max(128).optional(),
      })
      .parse(req.body);
    const atual = await q1('select client_id from spotify_apps where id=$1', [id]);
    if (!atual) throw new ErroHttp(404, 'Aplicativo não encontrado');
    if (d.client_secret) {
      try {
        await spotify.validarCredenciais({ clientId: atual.client_id, clientSecret: d.client_secret });
      } catch (e) {
        throw new ErroHttp(400, `O Spotify não aceitou o novo secret: ${(e as Error).message}`);
      }
    }
    await q(
      `update spotify_apps set nome=coalesce($2,nome), limite_usuarios=coalesce($3,limite_usuarios), ativo=coalesce($4,ativo),
         client_secret_enc=coalesce($5,client_secret_enc) where id=$1`,
      [id, d.nome ?? null, d.limite_usuarios ?? null, d.ativo ?? null, d.client_secret ? cifrar(d.client_secret) : null],
    );
    return (await listarApps()).find((a: any) => a.id === id);
  });

  app.delete('/api/spotify/apps/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const n = (await q1('select count(*)::int as n from spotify_contas where app_id=$1', [id]))!.n;
    if (n > 0) throw new ErroHttp(409, `Este aplicativo tem ${n} conta(s) conectada(s). Remova as contas antes de excluí-lo.`);
    await q('delete from spotify_apps where id=$1', [id]);
    return { ok: true };
  });

  // ---------- Contas ----------
  // Cada conta toca em um único lugar por vez: mostramos quem a está usando e a capacidade total.
  app.get('/api/spotify/contas', auth, async () => {
    const contas = await q(
      `select c.id, c.spotify_user_id, c.nome, c.email, c.produto, c.plano_spotify, c.grupo_familia, c.app_id, c.criado_em,
              a.nome as app_nome, b.id as bar_id, b.nome as bar_nome, b.spotify_device_nome
         from spotify_contas c
         left join spotify_apps a on a.id = c.app_id
         left join bares b on b.spotify_conta_id = c.id
        order by c.criado_em`,
    );
    const apps = await listarApps();
    const emUso = contas.filter((c: any) => c.bar_id).length;
    return {
      modo: spotify.modo,
      contas,
      apps,
      capacidade: {
        contas: contas.length,
        em_uso: emUso,
        livres: contas.length - emUso,
        lugares_livres_nos_apps: apps.filter((a: any) => a.ativo).reduce((s: number, a: any) => s + a.livres, 0),
      },
    };
  });

  app.patch('/api/spotify/contas/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const d = z.object({ plano_spotify: z.enum(PLANOS_SPOTIFY).optional(), grupo_familia: z.string().trim().max(60).nullable().optional() }).parse(req.body);
    const c = await q1(
      `update spotify_contas set plano_spotify=coalesce($2,plano_spotify), grupo_familia=case when $3::boolean then $4 else grupo_familia end where id=$1 returning id`,
      [id, d.plano_spotify ?? null, d.grupo_familia !== undefined, d.grupo_familia ?? null],
    );
    if (!c) throw new ErroHttp(404, 'Conta não encontrada');
    return { ok: true };
  });

  /**
   * Inicia o OAuth: devolve a URL de autorização do Spotify.
   * `app_id` escolhe o aplicativo; sem ele, usa o primeiro app ativo com lugar livre.
   */
  app.get('/api/spotify/conectar', auth, async (req) => {
    const f = z
      .object({
        app_id: z.string().uuid().optional(),
        plano_spotify: z.enum(PLANOS_SPOTIFY).default('individual'),
        grupo_familia: z.string().trim().max(60).optional(),
        retorno: z.string().optional(),
      })
      .parse(req.query);
    let appId = f.app_id ?? null;
    if (spotify.modo === 'real') {
      const apps = (await listarApps()).filter((a: any) => a.ativo);
      const escolhido = appId ? apps.find((a: any) => a.id === appId) : apps.find((a: any) => a.usados < a.limite_usuarios);
      if (!escolhido) throw new ErroHttp(409, appId ? 'Aplicativo inativo ou inexistente.' : 'Nenhum aplicativo Spotify ativo com lugar livre. Cadastre outro aplicativo.');
      if (escolhido.usados >= escolhido.limite_usuarios) {
        throw new ErroHttp(409, `O aplicativo "${escolhido.nome}" já usou todos os ${escolhido.limite_usuarios} lugares. Escolha outro ou cadastre um novo.`);
      }
      appId = escolhido.id;
    }
    const cred = await credenciaisDoApp(appId);
    const retorno = origemPermitida(f.retorno);
    const state = app.jwt.sign(
      { tipo: 'spotify', sub: req.user.sub, retorno, app_id: appId, plano_spotify: f.plano_spotify, grupo_familia: f.grupo_familia ?? null },
      { expiresIn: '10m' },
    );
    return { url: spotify.urlAutorizacao(state, cred) };
  });

  // Retorno do Spotify (sem sessão: identifica o usuário pelo `state` assinado)
  app.get('/api/spotify/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const voltaPara = (b: string, params: string) => reply.redirect(`${b}/admin/plataforma/spotify?${params}`);
    let volta = (params: string) => voltaPara(config.urlPublica, params);
    if (error || !code || !state) return volta(`erro=${encodeURIComponent(error ?? 'autorização negada')}`);
    let p: any;
    try {
      p = app.jwt.verify(state);
      if (p.tipo !== 'spotify') throw new Error();
      const base = p.retorno ?? config.urlPublica;
      volta = (params: string) => voltaPara(base, params);
    } catch {
      return volta('erro=' + encodeURIComponent('Solicitação expirada, tente conectar novamente'));
    }
    try {
      const cred = await credenciaisDoApp(p.app_id ?? null);
      const t = await spotify.trocarCodigo(code, cred);
      const perfil = await spotify.perfil(t.access_token);
      if (perfil.produto && perfil.produto !== 'premium') {
        return volta('erro=' + encodeURIComponent('Esta conta Spotify não é Premium — o controle do player exige Premium.'));
      }
      await q(
        `insert into spotify_contas (usuario_id, spotify_user_id, nome, email, produto, access_token_enc, refresh_token_enc, expira_em, app_id, plano_spotify, grupo_familia)
         values ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(secs => $8), $9, $10, $11)
         on conflict (usuario_id, spotify_user_id) do update set nome=$3, email=$4, produto=$5,
           access_token_enc=$6, refresh_token_enc=$7, expira_em=now() + make_interval(secs => $8), app_id=$9`,
        [p.sub, perfil.id, perfil.nome, perfil.email, perfil.produto, cifrar(t.access_token), cifrar(t.refresh_token), t.expires_in, p.app_id ?? null, p.plano_spotify ?? 'individual', p.grupo_familia ?? null],
      );
      return volta('conectado=1');
    } catch (e) {
      return volta('erro=' + encodeURIComponent((e as Error).message));
    }
  });

  app.delete('/api/spotify/contas/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    const r = await q(`update bares set spotify_conta_id=null, spotify_device_id=null, spotify_device_nome=null where spotify_conta_id=$1 returning id`, [id]);
    await q('delete from spotify_contas where id=$1', [id]);
    return { ok: true, bares_desvinculados: r.length };
  });

  // Lista os dispositivos que a conta enxerga agora (apps do Spotify abertos)
  app.get('/api/spotify/contas/:id/dispositivos', auth, async (req) => {
    const { id } = req.params as { id: string };
    if (!(await q1('select 1 from spotify_contas where id=$1', [id]))) throw new ErroHttp(404, 'Conta não encontrada');
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
