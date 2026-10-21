import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, q1 } from '../db.js';
import { barDoUsuario, barParaPainel, ehAdmin, ESTILOS_SUGERIDOS, slugificar } from '../lib/bares.js';
import { ErroHttp } from '../lib/erros.js';
import { PLANOS } from '../lib/planos.js';
import { estatisticas } from '../lib/estatisticas.js';
import { cifrar, tokenAleatorio } from '../lib/seguranca.js';
import { notificar } from '../realtime.js';
import { ErroSpotify, spotify, tokenDaConta } from '../spotify/index.js';

const texto = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const dadosBar = z.object({
  nome: z.string().trim().min(2).max(120),
  cnpj: texto(20),
  telefone: texto(30),
  email: z.string().trim().email().optional().nullable().or(z.literal('')).transform((v) => v || null),
  cep: texto(12),
  logradouro: texto(160),
  numero: texto(20),
  complemento: texto(80),
  bairro: texto(80),
  cidade: z.string().trim().min(2).max(80),
  uf: z.string().trim().length(2).toUpperCase(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  raio_metros: z.number().int().min(30).max(5000).default(150),
  estilos: z.array(z.string().trim().min(2).max(40)).max(12).default([]),
  max_pedidos_por_sessao: z.number().int().min(1).max(20).default(3),
  cooldown_repeticao_min: z.number().int().min(0).max(720).default(30),
  superchat_valor_centavos: z.number().int().min(100).max(100000).default(1000),
  ativo: z.boolean().default(true),
  playlist_automatica: z.boolean().default(true),
});

const urlDoBar = (b: { slug: string; qr_token: string }) => `${config.urlPublica}/b/${b.slug}?q=${b.qr_token}`;

export async function rotasBares(app: FastifyInstance) {
  const auth = { preHandler: app.exigirUsuario };
  const admin = { preHandler: app.exigirAdmin };

  app.get('/api/estilos', async () => ESTILOS_SUGERIDOS);
  app.get('/api/planos', async () => Object.values(PLANOS));

  app.get('/api/bares', auth, async (req) => {
    const todos = await ehAdmin(req.user.sub);
    const bares = await q(
      `select b.*, u.nome as usuario_nome, u.email as usuario_email from bares b join usuarios u on u.id = b.usuario_id
        ${todos ? '' : 'where b.usuario_id = $1'} order by b.criado_em`,
      todos ? [] : [req.user.sub],
    );
    return bares.map(barParaPainel);
  });

  app.post('/api/bares', admin, async (req, reply) => {
    const d = dadosBar.extend({ usuario_id: z.string().uuid('Escolha o responsável pelo bar') }).parse(req.body);
    const dono = await q1("select id from usuarios where id=$1 and ativo", [d.usuario_id]);
    if (!dono) throw new ErroHttp(404, 'Responsável não encontrado');
    const slug = `${slugificar(d.nome)}-${randomBytes(2).toString('hex')}`;
    const bar = await q1(
      `insert into bares (usuario_id,nome,slug,cnpj,telefone,email,cep,logradouro,numero,complemento,bairro,cidade,uf,
         latitude,longitude,raio_metros,qr_token,estilos,max_pedidos_por_sessao,cooldown_repeticao_min,superchat_valor_centavos,ativo,playlist_automatica)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) returning *`,
      [d.usuario_id, d.nome, slug, d.cnpj, d.telefone, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf,
        d.latitude, d.longitude, d.raio_metros, tokenAleatorio(12), d.estilos, d.max_pedidos_por_sessao, d.cooldown_repeticao_min,
        d.superchat_valor_centavos, d.ativo, d.playlist_automatica],
    );
    return reply.code(201).send(barParaPainel(bar));
  });

  app.get('/api/bares/:id', auth, async (req) => {
    const { id } = req.params as { id: string };
    return barParaPainel(await barDoUsuario(id, req.user.sub));
  });

  app.put('/api/bares/:id', admin, async (req) => {
    const { id } = req.params as { id: string };
    await barDoUsuario(id, req.user.sub);
    const d = dadosBar.extend({ usuario_id: z.string().uuid().optional() }).parse(req.body);
    if (d.usuario_id) await q('update bares set usuario_id=$2 where id=$1', [id, d.usuario_id]);
    const bar = await q1(
      `update bares set nome=$2,cnpj=$3,telefone=$4,email=$5,cep=$6,logradouro=$7,numero=$8,complemento=$9,bairro=$10,cidade=$11,uf=$12,
         latitude=$13,longitude=$14,raio_metros=$15,estilos=$16,max_pedidos_por_sessao=$17,cooldown_repeticao_min=$18,
         superchat_valor_centavos=$19,ativo=$20,playlist_automatica=$21,atualizado_em=now() where id=$1 returning *`,
      [id, d.nome, d.cnpj, d.telefone, d.email, d.cep, d.logradouro, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.latitude,
        d.longitude, d.raio_metros, d.estilos, d.max_pedidos_por_sessao, d.cooldown_repeticao_min, d.superchat_valor_centavos, d.ativo, d.playlist_automatica],
    );
    notificar(id);
    return barParaPainel(bar);
  });

  // Recebimento do super chat
  app.put('/api/bares/:id/pix', admin, async (req) => {
    const { id } = req.params as { id: string };
    await barDoUsuario(id, req.user.sub);
    const d = z
      .object({
        pix_provider: z.enum(['estatico', 'mercadopago']),
        pix_chave: texto(140),
        pix_titular: texto(25),
        mp_access_token: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    if (d.pix_provider === 'estatico' && !d.pix_chave) throw new ErroHttp(400, 'Informe a chave Pix');
    const bar = await q1(
      `update bares set pix_provider=$2, pix_chave=$3, pix_titular=$4,
         mp_access_token_enc = case when $5::text is null or $5 = '' then mp_access_token_enc else $5 end, atualizado_em=now()
       where id=$1 returning *`,
      [id, d.pix_provider, d.pix_chave, d.pix_titular, d.mp_access_token ? cifrar(d.mp_access_token) : null],
    );
    if (d.pix_provider === 'mercadopago' && !bar.mp_access_token_enc) throw new ErroHttp(400, 'Informe o Access Token do Mercado Pago');
    return barParaPainel(bar);
  });

  // QR Code individual do bar
  app.get('/api/bares/:id/qr', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    return { url: urlDoBar(bar), url_sem_qr: `${config.urlPublica}/b/${bar.slug}` };
  });
  app.post('/api/bares/:id/qr/regenerar', admin, async (req) => {
    const { id } = req.params as { id: string };
    await barDoUsuario(id, req.user.sub);
    const bar = await q1('update bares set qr_token=$2 where id=$1 returning *', [id, tokenAleatorio(12)]);
    return { url: urlDoBar(bar) };
  });

  // Conta + dispositivo Spotify do bar
  app.put('/api/bares/:id/spotify', admin, async (req) => {
    const { id } = req.params as { id: string };
    await barDoUsuario(id, req.user.sub);
    const d = z
      .object({ conta_id: z.string().uuid().nullable(), device_id: z.string().min(1).nullable(), device_nome: z.string().nullable().optional() })
      .parse(req.body);
    if (d.conta_id) {
      const conta = await q1('select id from spotify_contas where id=$1', [d.conta_id]);
      if (!conta) throw new ErroHttp(404, 'Conta Spotify não encontrada');
      if (!d.device_id) throw new ErroHttp(400, 'Selecione um dispositivo');
      // uma conta toca em um único lugar por vez: não pode atender dois bares
      const contaEmUso = await q1('select nome from bares where spotify_conta_id=$1 and id<>$2', [d.conta_id, id]);
      if (contaEmUso) throw new ErroHttp(409, `Esta conta Spotify já atende o bar "${contaEmUso.nome}". Cada conta toca em um único lugar por vez — use outra conta.`);
      const uso = await q1('select nome from bares where spotify_device_id=$1 and id<>$2', [d.device_id, id]);
      if (uso) throw new ErroHttp(409, `Este dispositivo já está em uso pelo bar "${uso.nome}"`);
      try {
        await spotify.transferir(await tokenDaConta(d.conta_id), d.device_id);
      } catch (e) {
        if (!(e instanceof ErroSpotify)) throw e;
        throw new ErroHttp(502, `Não foi possível ativar o dispositivo: ${e.message}`);
      }
    }
    const bar = await q1(
      `update bares set spotify_conta_id=$2, spotify_device_id=$3, spotify_device_nome=$4, atualizado_em=now() where id=$1 returning *`,
      [id, d.conta_id, d.conta_id ? d.device_id : null, d.conta_id ? (d.device_nome ?? null) : null],
    );
    // desvinculou ou trocou de dispositivo: o estado antigo do player não vale mais
    await q('delete from player_estado where bar_id=$1', [id]);
    notificar(id);
    return barParaPainel(bar);
  });

  // Estatísticas de pedidos (dono e administrador)
  app.get('/api/bares/:id/estatisticas', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const { de, ate } = req.query as { de?: string; ate?: string };
    return estatisticas({ barId: bar.id, de, ate });
  });

  // Painel: fila completa e controles do player
  app.get('/api/bares/:id/fila', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const { montarEstado } = await import('../lib/estado.js');
    const estado = await montarEstado(bar.id);
    const pagamentosPendentes = await q(
      `select p.id, p.valor_centavos, p.criado_em, p.provider, f.nome, f.artistas
         from pagamentos p left join fila f on f.id = p.fila_id
        where p.bar_id=$1 and p.tipo='superchat' and p.status='pendente' order by p.criado_em`,
      [bar.id],
    );
    const player = await q1('select erro, dispositivo_online from player_estado where bar_id=$1', [bar.id]);
    return { ...estado, erro_player: player?.erro ?? null, pagamentos_pendentes: pagamentosPendentes };
  });

  app.delete('/api/bares/:id/fila/:filaId', auth, async (req) => {
    const { id, filaId } = req.params as { id: string; filaId: string };
    await barDoUsuario(id, req.user.sub);
    await q(`update fila set status='removida' where id=$1 and bar_id=$2 and status in ('pendente','enviada')`, [filaId, id]);
    notificar(id);
    return { ok: true };
  });

  app.post('/api/bares/:id/player/:acao', auth, async (req) => {
    const { id, acao } = req.params as { id: string; acao: string };
    const bar = await barDoUsuario(id, req.user.sub);
    if (!bar.spotify_conta_id || !bar.spotify_device_id) throw new ErroHttp(409, 'Configure a conta e o dispositivo Spotify do bar');
    const token = await tokenDaConta(bar.spotify_conta_id);
    try {
      if (acao === 'pausar') await spotify.pausar(token, bar.spotify_device_id);
      else if (acao === 'retomar') await spotify.retomar(token, bar.spotify_device_id);
      else if (acao === 'pular') await spotify.proxima(token, bar.spotify_device_id);
      else throw new ErroHttp(404, 'Ação inválida');
    } catch (e) {
      if (e instanceof ErroSpotify && e.status === 403 && /restriction/i.test(e.message)) {
        throw new ErroHttp(409, 'O Spotify não permite este comando agora (nada tocando, anúncio ou aparelho ocupado). Toque uma música no aparelho e tente de novo.');
      }
      if (e instanceof ErroSpotify) throw new ErroHttp(502, e.message);
      throw e;
    }
    notificar(id);
    return { ok: true };
  });
}
