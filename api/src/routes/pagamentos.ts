import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { q, q1 } from '../db.js';
import { barDoUsuario } from '../lib/bares.js';
import { ErroHttp } from '../lib/erros.js';
import { PLANOS, type PlanoId } from '../lib/planos.js';
import { confirmarPagamento, criarPixAssinatura, statusPagamento } from '../payments/index.js';

const paraCliente = (p: any) => ({
  id: p.id,
  tipo: p.tipo,
  plano: p.plano,
  valor_centavos: p.valor_centavos,
  status: p.status,
  provider: p.provider,
  brcode: p.brcode,
  qr_base64: p.qr_base64,
  expira_em: p.expira_em,
  pago_em: p.pago_em,
});
export { paraCliente as pagamentoParaCliente };

export async function rotasPagamentos(app: FastifyInstance) {
  const auth = { preHandler: app.exigirUsuario };

  // Assinatura do plano (Pix para a plataforma)
  app.post('/api/bares/:id/assinar', auth, async (req, reply) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const { plano } = z.object({ plano: z.enum(['mensal', 'semestral', 'anual']) }).parse(req.body);
    if (config.pix.modo === 'real' && config.pix.plataformaProvider === 'estatico' && !config.pix.plataformaChave) {
      throw new ErroHttp(503, 'Recebimento das assinaturas ainda não configurado na plataforma');
    }
    const p = await criarPixAssinatura(bar, plano as PlanoId);
    return reply.code(201).send(paraCliente(p));
  });

  app.get('/api/bares/:id/pagamentos', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const lista = await q(
      `select p.*, f.nome as musica from pagamentos p left join fila f on f.id=p.fila_id
        where p.bar_id=$1 order by p.criado_em desc limit 100`,
      [bar.id],
    );
    return lista.map((p: any) => ({ ...paraCliente(p), musica: p.musica, criado_em: p.criado_em }));
  });

  // Consulta de um pagamento (dono do bar)
  app.get('/api/pagamentos/:pid', auth, async (req) => {
    const p = await q1('select bar_id from pagamentos where id=$1', [(req.params as any).pid]);
    if (!p) throw new ErroHttp(404, 'Pagamento não encontrado');
    await barDoUsuario(p.bar_id, req.user.sub);
    return paraCliente(await statusPagamento((req.params as any).pid));
  });

  // Pix estático: o bar confere o extrato e confirma manualmente
  app.post('/api/bares/:id/pagamentos/:pid/confirmar', auth, async (req) => {
    const bar = await barDoUsuario((req.params as any).id, req.user.sub);
    const p = await q1('select * from pagamentos where id=$1 and bar_id=$2', [(req.params as any).pid, bar.id]);
    if (!p) throw new ErroHttp(404, 'Pagamento não encontrado');
    if (p.tipo !== 'superchat') throw new ErroHttp(400, 'Apenas super chats são confirmados manualmente');
    if (p.provider === 'mercadopago') throw new ErroHttp(400, 'Pagamentos do Mercado Pago são confirmados automaticamente');
    try {
      return paraCliente(await confirmarPagamento(p.id));
    } catch (e) {
      throw new ErroHttp(409, (e as Error).message);
    }
  });

  // Somente desenvolvimento (PIX_MODE=mock): simula o pagamento
  app.post('/api/pagamentos/:pid/simular', async (req) => {
    if (config.pix.modo !== 'mock') throw new ErroHttp(404, 'Não encontrado');
    try {
      return paraCliente(await confirmarPagamento((req.params as any).pid));
    } catch (e) {
      throw new ErroHttp(409, (e as Error).message);
    }
  });

  // Webhook do Mercado Pago: não confiamos no corpo, apenas usamos o id para consultar o PSP.
  app.post('/api/webhooks/mercadopago', async (req) => {
    const { secret } = req.query as { secret?: string };
    if (config.pix.webhookSecret && secret !== config.pix.webhookSecret) throw new ErroHttp(401, 'Não autorizado');
    const id = (req.body as any)?.data?.id ?? (req.query as any)['data.id'];
    if (!id) return { ok: true };
    const p = await q1(`select id from pagamentos where provider='mercadopago' and provider_id=$1`, [String(id)]);
    if (p) await statusPagamento(p.id);
    return { ok: true };
  });
}

export { PLANOS };
