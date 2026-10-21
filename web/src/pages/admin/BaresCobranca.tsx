import { Ban, CircleDollarSign, ExternalLink, LockOpen, Plus, Store } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aviso, Botao, Campo, Cartao, Chip, Folha, Textarea, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dataBR, FORMAS, reais, SITUACOES, textoVencimento } from '../../lib/format';
import { useBar, type BarAdmin } from './contexto';
import { RegistrarMensalidade } from './RegistrarMensalidade';

interface BarCobranca extends BarAdmin {
  usuario_nome: string;
  usuario_email: string;
  situacao: keyof typeof SITUACOES;
  dias_para_vencer: number | null;
  motivo_bloqueio: string | null;
  pedidos: number;
  ultimo_pagamento: { pago_em: string; forma: string; valor_centavos: number; plano: string } | null;
}

type Filtro = 'todos' | 'vencido' | 'vence_em_breve' | 'bloqueado' | 'em_dia' | 'gratuito';

export default function BaresCobranca() {
  const { req } = useAuth();
  const { selecionar, recarregar } = useBar();
  const nav = useNavigate();
  const [bares, setBares] = useState<BarCobranca[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [bloqueando, setBloqueando] = useState<BarCobranca | null>(null);
  const [motivo, setMotivo] = useState('Pagamento em atraso');

  const carregar = useCallback(async () => setBares(await req('GET', '/api/admin/bares')), [req]);
  useEffect(() => { void carregar(); }, [carregar]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: bares?.length ?? 0 };
    for (const b of bares ?? []) c[b.situacao] = (c[b.situacao] ?? 0) + 1;
    return c;
  }, [bares]);

  const visiveis = (bares ?? []).filter((b) => filtro === 'todos' || b.situacao === filtro);

  async function bloquear() {
    if (!bloqueando) return;
    try {
      await req('POST', `/api/admin/bares/${bloqueando.id}/bloquear`, { motivo });
      setMsg({ tipo: 'ok', texto: `${bloqueando.nome} bloqueado. O bar some para o público e o player para.` });
      setBloqueando(null);
      await Promise.all([carregar(), recarregar()]);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function desbloquear(b: BarCobranca) {
    try {
      await req('POST', `/api/admin/bares/${b.id}/desbloquear`);
      setMsg({ tipo: 'ok', texto: `${b.nome} desbloqueado.` });
      await Promise.all([carregar(), recarregar()]);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Bares e cobrança</h1>
          <p className="text-sm text-muted">Acompanhe pagamentos e vencimentos. Venceu e não pagou? Bloqueie o bar.</p>
        </div>
        <Botao onClick={() => nav('/admin/bar/novo')}><Plus className="size-4" /> Cadastrar bar</Botao>
      </div>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([['todos', 'Todos'], ['vencido', 'Vencidos'], ['vence_em_breve', 'Vencem em breve'], ['bloqueado', 'Bloqueados'], ['em_dia', 'Em dia'], ['gratuito', 'Free']] as const).map(([id, rotulo]) => (
          <Chip key={id} ativo={filtro === id} onClick={() => setFiltro(id)}>{rotulo} · {contagem[id] ?? 0}</Chip>
        ))}
      </div>

      {!bares ? <p className="text-muted">Carregando…</p> : visiveis.length === 0 ? (
        <Vazio icone={<Store className="size-10" />} titulo="Nenhum bar neste filtro" />
      ) : (
        <ul className="space-y-3">
          {visiveis.map((b) => {
            const s = SITUACOES[b.situacao];
            const pago = b.plano_efetivo !== 'free' || b.plano !== 'free';
            const atrasado = b.situacao === 'vencido';
            return (
              <li key={b.id}>
                <Cartao className={`space-y-3 ${atrasado ? 'ring-1 ring-danger/40' : ''} ${b.bloqueado ? 'opacity-90' : ''}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                        {b.nome} <Chip tom={s.tom}>{s.rotulo}</Chip>
                      </p>
                      <p className="text-sm text-muted">{b.usuario_nome} · {b.usuario_email} · {b.cidade}/{b.uf}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-bold capitalize">{pago ? b.plano : 'Free'}</p>
                      {pago && b.plano_expira_em && (
                        <p className={atrasado ? 'font-semibold text-danger' : 'text-muted'}>
                          Vence {dataBR(b.plano_expira_em)} <span className="text-xs">({textoVencimento(b.dias_para_vencer)})</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-muted sm:grid-cols-3">
                    <p>Último pagamento: <span className="text-white">{b.ultimo_pagamento ? `${dataBR(b.ultimo_pagamento.pago_em)} · ${FORMAS[b.ultimo_pagamento.forma] ?? b.ultimo_pagamento.forma} · ${reais(b.ultimo_pagamento.valor_centavos)}` : 'nenhum'}</span></p>
                    <p>Pedidos de música: <span className="text-white">{b.pedidos}</span></p>
                    {b.bloqueado && <p className="text-danger">Motivo do bloqueio: {b.motivo_bloqueio}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Botao tamanho="sm" onClick={() => setPagando(b.id)}><CircleDollarSign className="size-4" /> Registrar pagamento</Botao>
                    {b.bloqueado ? (
                      <Botao tamanho="sm" variante="secundario" onClick={() => desbloquear(b)}><LockOpen className="size-4" /> Desbloquear</Botao>
                    ) : (
                      <Botao tamanho="sm" variante={atrasado ? 'perigo' : 'fantasma'} onClick={() => { setMotivo('Pagamento em atraso'); setBloqueando(b); }}><Ban className="size-4" /> Bloquear</Botao>
                    )}
                    <Botao tamanho="sm" variante="fantasma" onClick={() => { selecionar(b.id); nav('/admin'); }}><ExternalLink className="size-4" /> Abrir painel</Botao>
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}

      <RegistrarMensalidade
        aberto={!!pagando}
        bares={bares ?? []}
        barInicial={pagando}
        onFechar={() => setPagando(null)}
        onRegistrado={(texto) => { setMsg({ tipo: 'ok', texto }); void carregar(); void recarregar(); }}
      />

      <Folha aberta={!!bloqueando} onFechar={() => setBloqueando(null)} titulo={`Bloquear ${bloqueando?.nome ?? ''}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted">O bar deixa de aparecer para o público, ninguém consegue entrar na sala e o player para de receber músicas. O responsável vê o aviso no painel. Registrar um pagamento libera o bar de novo.</p>
          <Campo rotulo="Motivo (aparece para o responsável)"><Textarea rows={2} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <Botao variante="perigo" className="w-full" onClick={bloquear}><Ban className="size-4" /> Confirmar bloqueio</Botao>
        </div>
      </Folha>
    </div>
  );
}
