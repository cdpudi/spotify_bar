import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, q1 } from '../db.js';
import { barParaPainel } from '../lib/bares.js';
import { ErroHttp } from '../lib/erros.js';
import { estatisticas } from '../lib/estatisticas.js';
import { listarPagamentos } from '../lib/lista-pagamentos.js';
import { hashSenha } from '../lib/seguranca.js';
import { registrarMensalidadeManual } from '../payments/index.js';
import { notificar } from '../realtime.js';

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use AAAA-MM-DD');

/** Gestão da plataforma: responsáveis, cobrança, bloqueio, recebimentos e estatísticas. Somente administrador. */
export async function rotasAdmin(app: FastifyInstance) {
  const admin = { preHandler: app.exigirAdmin };

  // ---- Responsáveis (donos dos bares) ----
  app.get('/api/admin/usuarios', admin, async () =>
    q(
      `select u.id, u.nome, u.email, u.papel, u.ativo, u.criado_em,
              (select count(*)::int from bares b where b.usuario_id = u.id) as bares
         from usuarios u order by u.papel, u.nome`,
    ),
  );

  app.post('/api/admin/usuarios', admin, async (req, reply) => {
    const d = z
      .object({
        nome: z.string().trim().min(2).max(120),
        email: z.string().trim().toLowerCase().email(),
        senha: z.string().min(8, 'mínimo de 8 caracteres').max(200),
        papel: z.enum(['dono', 'admin']).default('dono'),
      })
      .parse(req.body);
    if (await q1('select 1 from usuarios where email=$1', [d.email])) throw new ErroHttp(409, 'Este e-mail já está cadastrado');
    const u = await q1('insert into usuarios (nome,email,senha_hash,papel) values ($1,$2,$3,$4) returning id,nome,email,papel,ativo', [
      d.nome,
      d.email,
      await hashSenha(d.senha),
      d.papel,
    ]);
    return reply.code(201).send(u);
  });

  app.patch('/api/admin/usuarios/:id', admin, async (req) => {
    const { id } = req.params as { id: string };
    const d = z
      .object({ nome: z.string().trim().min(2).optional(), ativo: z.boolean().optional(), senha: z.string().min(8).optional() })
      .parse(req.body);
    if (id === req.user.sub && d.ativo === false) throw new ErroHttp(400, 'Você não pode desativar a própria conta');
    const u = await q1(
      `update usuarios set nome=coalesce($2,nome), ativo=coalesce($3,ativo), senha_hash=coalesce($4,senha_hash) where id=$1 returning id,nome,email,papel,ativo`,
      [id, d.nome ?? null, d.ativo ?? null, d.senha ? await hashSenha(d.senha) : null],
    );
    if (!u) throw new ErroHttp(404, 'Usuário não encontrado');
    return u;
  });

  // ---- Bares e cobrança ----
  // Visão de cobrança: plano, vencimento, situação, último recebimento e volume de pedidos
  app.get('/api/admin/bares', admin, async () => {
    const bares = await q(
      `select b.*, u.nome as usuario_nome, u.email as usuario_email,
              (select row_to_json(x) from (
                 select p.pago_em, p.forma, p.valor_centavos, p.plano from pagamentos p
                  where p.bar_id = b.id and p.tipo='assinatura' and p.status='pago' order by p.pago_em desc limit 1) x) as ultimo_pagamento,
              (select count(*)::int from fila f where f.bar_id = b.id and f.status not in ('aguardando_pagamento','removida')) as pedidos
         from bares b join usuarios u on u.id = b.usuario_id order by b.nome`,
    );
    return bares.map(barParaPainel);
  });

  app.post('/api/admin/bares/:id/bloquear', admin, async (req) => {
    const { id } = req.params as { id: string };
    const { motivo } = z.object({ motivo: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const bar = await q1(`update bares set bloqueado=true, bloqueado_em=now(), motivo_bloqueio=$2 where id=$1 returning *`, [id, motivo || 'Pagamento em atraso']);
    if (!bar) throw new ErroHttp(404, 'Bar não encontrado');
    // derruba o estado do player: a música deixa de ser enviada e o público é avisado
    await q('delete from player_estado where bar_id=$1', [id]);
    notificar(id);
    return barParaPainel(bar);
  });

  app.post('/api/admin/bares/:id/desbloquear', admin, async (req) => {
    const { id } = req.params as { id: string };
    const bar = await q1(`update bares set bloqueado=false, bloqueado_em=null, motivo_bloqueio=null where id=$1 returning *`, [id]);
    if (!bar) throw new ErroHttp(404, 'Bar não encontrado');
    notificar(id);
    return barParaPainel(bar);
  });

  // Lançamento manual de mensalidade: como foi recebido (pix/dinheiro/outro) e próximo vencimento
  app.post('/api/admin/bares/:id/mensalidades', admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = z
      .object({
        plano: z.enum(['mensal', 'semestral', 'anual']),
        forma: z.enum(['pix', 'dinheiro', 'outro']),
        valor_centavos: z.number().int().min(0).max(10_000_000).optional(),
        pago_em: data.optional(),
        proximo_vencimento: data.optional(),
        observacao: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    try {
      const pid = await registrarMensalidadeManual({
        barId: id,
        plano: d.plano,
        forma: d.forma,
        valorCentavos: d.valor_centavos,
        pagoEm: d.pago_em,
        proximoVencimento: d.proximo_vencimento,
        observacao: d.observacao,
        adminId: req.user.sub,
      });
      notificar(id);
      const bar = await q1('select * from bares where id=$1', [id]);
      return reply.code(201).send({ id: pid, bar: barParaPainel(bar) });
    } catch (e) {
      throw new ErroHttp(400, (e as Error).message);
    }
  });

  // ---- Recebimentos e estatísticas de toda a plataforma ----
  app.get('/api/admin/pagamentos', admin, async (req) => {
    const f = req.query as Record<string, string | undefined>;
    return listarPagamentos({ barId: f.bar_id, tipo: f.tipo, forma: f.forma, status: f.status, de: f.de, ate: f.ate, limite: Number(f.limite) || 200 });
  });

  app.get('/api/admin/estatisticas', admin, async (req) => {
    const f = req.query as Record<string, string | undefined>;
    return estatisticas({ barId: f.bar_id, de: f.de, ate: f.ate });
  });
}
