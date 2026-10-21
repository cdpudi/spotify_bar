import { Check, Crown, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Botao, Cartao, Chip, Input, Select, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dataHoraBR, FORMAS, reais } from '../../lib/format';
import { useBar } from './contexto';

interface Item {
  id: string; status: 'pago' | 'pendente' | 'expirado' | 'cancelado'; forma: string; provider: string; valor_centavos: number;
  criado_em: string; pago_em: string | null; musica: string | null; artistas: string | null; apelido: string | null;
}
interface Resposta {
  resumo: { pedidos: number; recebidos: number; aguardando: number; nao_pagos: number; valor_recebido_centavos: number; valor_aguardando_centavos: number };
  itens: Item[];
}

const STATUS = {
  pago: { rotulo: 'Recebido', tom: 'ok' as const },
  pendente: { rotulo: 'Aguardando pagamento', tom: 'ouro' as const },
  expirado: { rotulo: 'Não recebido (expirou)', tom: 'erro' as const },
  cancelado: { rotulo: 'Não recebido', tom: 'erro' as const },
};

/** Pedidos de super chat feitos pelo público e se o valor foi recebido. */
export default function SuperChatsPagina() {
  const { req } = useAuth();
  const { bar } = useBar();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [status, setStatus] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!bar) return;
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    try {
      setDados(await req('GET', `/api/bares/${bar.id}/superchats?${p}`));
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }, [req, bar?.id, status, de, ate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 8000); // pedidos novos aparecem sozinhos
    return () => clearInterval(t);
  }, [carregar]);

  async function receber(i: Item, forma: 'pix' | 'dinheiro') {
    try {
      await req('POST', `/api/bares/${bar!.id}/pagamentos/${i.id}/confirmar`, { forma });
      setMsg({ tipo: 'ok', texto: `Super chat de "${i.musica}" marcado como recebido (${FORMAS[forma]}). A música subiu na fila.` });
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  if (!bar) return null;
  const r = dados?.resumo;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Zap className="size-6 text-gold" /> Super chat</h1>
        <p className="text-sm text-muted">Pedidos de super chat do público em {bar.nome} e se o valor foi recebido.</p>
      </div>
      {bar.plano_efetivo === 'free' && <Aviso tipo="ouro">O super chat só fica disponível para o público nos planos pagos. Para contratar, fale com o administrador.</Aviso>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao><p className="text-xs font-semibold text-muted">Pedidos</p><p className="mt-1 text-2xl font-extrabold">{r.pedidos}</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Recebidos</p><p className="mt-1 text-2xl font-extrabold text-brand">{r.recebidos}</p><p className="text-xs text-muted">{reais(r.valor_recebido_centavos)}</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Aguardando</p><p className="mt-1 text-2xl font-extrabold text-gold">{r.aguardando}</p><p className="text-xs text-muted">{reais(r.valor_aguardando_centavos)}</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Não recebidos</p><p className="mt-1 text-2xl font-extrabold text-danger">{r.nao_pagos}</p></Cartao>
        </div>
      )}

      <Cartao className="grid gap-3 sm:grid-cols-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          <option value="pago">Recebidos</option>
          <option value="pendente">Aguardando pagamento</option>
          <option value="expirado">Expirados</option>
        </Select>
        <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
        <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
      </Cartao>

      {!dados ? <p className="text-muted">Carregando…</p> : dados.itens.length === 0 ? (
        <Vazio icone={<Crown className="size-10" />} titulo="Nenhum super chat ainda">Quando alguém pagar para furar a fila, o pedido aparece aqui.</Vazio>
      ) : (
        <ul className="space-y-2">
          {dados.itens.map((i) => {
            const s = STATUS[i.status];
            return (
              <li key={i.id}>
                <Cartao className="flex flex-wrap items-center gap-3 !p-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold"><Crown className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.musica ?? 'Música'} <span className="font-normal text-muted">— {i.artistas}</span></p>
                    <p className="text-xs text-muted">
                      {dataHoraBR(i.criado_em)}{i.apelido ? ` · ${i.apelido}` : ''}
                      {i.status === 'pago' && <> · recebido em {dataHoraBR(i.pago_em)} via {FORMAS[i.forma] ?? i.forma}</>}
                    </p>
                  </div>
                  <p className="font-bold">{reais(i.valor_centavos)}</p>
                  <Chip tom={s.tom}>{s.rotulo}</Chip>
                  {i.status === 'pendente' && i.provider !== 'mercadopago' && (
                    <div className="flex gap-1.5">
                      <Botao tamanho="sm" onClick={() => receber(i, 'pix')}><Check className="size-4" /> Recebi (Pix)</Botao>
                      <Botao tamanho="sm" variante="secundario" onClick={() => receber(i, 'dinheiro')}>Recebi (dinheiro)</Botao>
                    </div>
                  )}
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
