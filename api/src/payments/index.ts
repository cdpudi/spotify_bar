import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { q, q1, transacao } from '../db.js';
import { gerarBrCode } from '../lib/pix.js';
import { PLANOS, type PlanoId } from '../lib/planos.js';
import { decifrar } from '../lib/seguranca.js';
import { notificar } from '../realtime.js';

export type StatusPix = 'pago' | 'pendente' | 'expirado';

interface PixCriado {
  provider: 'mock' | 'estatico' | 'mercadopago';
  providerId: string | null;
  brcode: string;
  qrBase64: string | null;
}

interface Recebedor {
  provider: 'estatico' | 'mercadopago';
  chave?: string | null;
  titular?: string | null;
  cidade?: string | null;
  mpToken?: string | null;
}

const MP = 'https://api.mercadopago.com';

async function criarMercadoPago(token: string, valorCentavos: number, descricao: string, txid: string, pagamentoId: string): Promise<PixCriado> {
  const r = await fetch(`${MP}/v1/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': txid },
    body: JSON.stringify({
      transaction_amount: valorCentavos / 100,
      description: descricao,
      payment_method_id: 'pix',
      external_reference: pagamentoId,
      payer: { email: 'cliente@spotifybar.com.br' },
      date_of_expiration: new Date(Date.now() + config.pix.expiraMin * 60_000).toISOString().replace('Z', '-00:00'),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago ${r.status}: ${j.message ?? 'erro ao criar Pix'}`);
  const td = j.point_of_interaction?.transaction_data;
  return { provider: 'mercadopago', providerId: String(j.id), brcode: td?.qr_code ?? '', qrBase64: td?.qr_code_base64 ?? null };
}

async function gerarCobranca(rec: Recebedor, valorCentavos: number, descricao: string, txid: string, pagamentoId: string): Promise<PixCriado> {
  if (config.pix.modo === 'mock') {
    return {
      provider: 'mock',
      providerId: `mock-${pagamentoId}`,
      brcode: gerarBrCode({ chave: 'mock@spotifybar.dev', valorCentavos, titular: 'SPOTIFY BAR DEMO', cidade: 'SAO PAULO', txid }),
      qrBase64: null,
    };
  }
  if (rec.provider === 'mercadopago') {
    if (!rec.mpToken) throw new Error('Mercado Pago não configurado para este recebedor');
    return criarMercadoPago(rec.mpToken, valorCentavos, descricao, txid, pagamentoId);
  }
  if (!rec.chave) throw new Error('Chave Pix não configurada para este recebedor');
  return {
    provider: 'estatico',
    providerId: null,
    brcode: gerarBrCode({ chave: rec.chave, valorCentavos, titular: rec.titular ?? 'ESTABELECIMENTO', cidade: rec.cidade ?? 'BRASIL', txid }),
    qrBase64: null,
  };
}

async function inserirPagamento(p: {
  tipo: 'superchat' | 'assinatura';
  barId: string;
  filaId?: string | null;
  plano?: string | null;
  sessaoId?: string | null;
  valorCentavos: number;
  recebedor: Recebedor;
  descricao: string;
}) {
  const id = randomUUID();
  const txid = id.replace(/-/g, '').slice(0, 25);
  const c = await gerarCobranca(p.recebedor, p.valorCentavos, p.descricao, txid, id);
  return (await q1(
    `insert into pagamentos (id, tipo, bar_id, fila_id, plano, sessao_id, valor_centavos, provider, provider_id, txid, brcode, qr_base64, expira_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + make_interval(mins => $13)) returning *`,
    [id, p.tipo, p.barId, p.filaId ?? null, p.plano ?? null, p.sessaoId ?? null, p.valorCentavos, c.provider, c.providerId, txid, c.brcode, c.qrBase64, config.pix.expiraMin],
  ))!;
}

/** Cobrança do super chat: o dinheiro vai para o recebedor configurado pelo bar. */
export async function criarPixSuperchat(bar: any, filaId: string, sessaoId: string, valorCentavos: number, descricao: string) {
  return inserirPagamento({
    tipo: 'superchat',
    barId: bar.id,
    filaId,
    sessaoId,
    valorCentavos,
    descricao,
    recebedor: {
      provider: bar.pix_provider,
      chave: bar.pix_chave,
      titular: bar.pix_titular ?? bar.nome,
      cidade: bar.cidade,
      mpToken: bar.mp_access_token_enc ? decifrar(bar.mp_access_token_enc) : null,
    },
  });
}

/** Cobrança de assinatura: o dinheiro vai para a plataforma. */
export async function criarPixAssinatura(bar: any, plano: PlanoId) {
  const pl = PLANOS[plano];
  return inserirPagamento({
    tipo: 'assinatura',
    barId: bar.id,
    plano,
    valorCentavos: pl.valorCentavos,
    descricao: `Spotify Bar — plano ${pl.nome} (${bar.nome})`,
    recebedor: {
      provider: config.pix.plataformaProvider,
      chave: config.pix.plataformaChave,
      titular: config.pix.plataformaTitular,
      cidade: config.pix.plataformaCidade,
      mpToken: config.pix.plataformaMpToken,
    },
  });
}

/** Consulta o PSP quando há integração automática. Estático/mock só mudam por confirmação explícita. */
async function consultarProvider(p: any): Promise<StatusPix> {
  if (p.provider !== 'mercadopago' || !p.provider_id) return 'pendente';
  let token: string | null = null;
  if (p.tipo === 'assinatura') token = config.pix.plataformaMpToken;
  else {
    const bar = await q1('select mp_access_token_enc from bares where id=$1', [p.bar_id]);
    token = bar?.mp_access_token_enc ? decifrar(bar.mp_access_token_enc) : null;
  }
  if (!token) return 'pendente';
  const r = await fetch(`${MP}/v1/payments/${p.provider_id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return 'pendente';
  const j: any = await r.json();
  if (j.status === 'approved') return 'pago';
  if (['cancelled', 'rejected', 'expired'].includes(j.status)) return 'expirado';
  return 'pendente';
}

/** Marca como pago e aplica o efeito (fila ou plano). Idempotente. */
export async function confirmarPagamento(id: string): Promise<any> {
  const efeito = await transacao(async (c) => {
    const { rows } = await c.query('select * from pagamentos where id=$1 for update', [id]);
    const p = rows[0];
    if (!p || p.status === 'pago') return { p, aplicado: false };
    if (p.status !== 'pendente') throw new Error(`Pagamento ${p.status}, não pode ser confirmado`);
    await c.query(`update pagamentos set status='pago', pago_em=now() where id=$1`, [id]);

    if (p.tipo === 'superchat' && p.fila_id) {
      const { rows: fr } = await c.query('select * from fila where id=$1 for update', [p.fila_id]);
      const f = fr[0];
      if (f && f.status === 'aguardando_pagamento') {
        // já existe a mesma música aguardando na fila? então ela é promovida e este pedido é descartado
        const { rows: dup } = await c.query(
          `select id from fila where bar_id=$1 and spotify_track_id=$2 and status='pendente' and super=false limit 1`,
          [f.bar_id, f.spotify_track_id],
        );
        if (dup[0]) {
          await c.query(`update fila set super=true, super_pago_em=now() where id=$1`, [dup[0].id]);
          await c.query(`update fila set status='removida' where id=$1`, [f.id]);
        } else {
          await c.query(`update fila set status='pendente', super=true, super_pago_em=now() where id=$1`, [f.id]);
        }
      }
    }
    if (p.tipo === 'assinatura' && p.plano) {
      const pl = PLANOS[p.plano as PlanoId];
      await c.query(
        `update bares set plano=$2,
           plano_expira_em = (case when plano=$2 and plano_expira_em > now() then plano_expira_em else now() end) + make_interval(days => $3),
           atualizado_em=now()
         where id=$1`,
        [p.bar_id, p.plano, pl.dias],
      );
    }
    return { p, aplicado: true };
  });
  if (efeito.p && efeito.aplicado) notificar(efeito.p.bar_id);
  return q1('select * from pagamentos where id=$1', [id]);
}

/** Estado atual de um pagamento, consultando o PSP quando necessário e expirando os vencidos. */
export async function statusPagamento(id: string) {
  let p = await q1('select * from pagamentos where id=$1', [id]);
  if (!p) return null;
  if (p.status === 'pendente') {
    if (new Date(p.expira_em).getTime() < Date.now()) {
      p = await expirarPagamento(p);
    } else if ((await consultarProvider(p)) === 'pago') {
      p = await confirmarPagamento(id);
    }
  }
  return p;
}

async function expirarPagamento(p: any) {
  await q(`update pagamentos set status='expirado' where id=$1 and status='pendente'`, [p.id]);
  if (p.fila_id) {
    await q(`update fila set status='removida' where id=$1 and status='aguardando_pagamento'`, [p.fila_id]);
  }
  return q1('select * from pagamentos where id=$1', [p.id]);
}

/** Varredura periódica: expira Pix vencidos e confirma os aprovados no PSP. */
export async function varrerPagamentos() {
  const pend = await q('select * from pagamentos where status=\'pendente\' limit 200');
  for (const p of pend) {
    try {
      await statusPagamento(p.id);
    } catch (e) {
      console.error('[pix] varredura', p.id, (e as Error).message);
    }
  }
}
