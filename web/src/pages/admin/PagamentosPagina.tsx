import { CircleDollarSign, Receipt } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Botao, Cartao, Chip, Input, Select, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dataBR, dataHoraBR, FORMAS, reais, TIPOS } from '../../lib/format';
import { useBar } from './contexto';
import { RegistrarMensalidade } from './RegistrarMensalidade';

interface Item {
  id: string; tipo: string; status: string; forma: string; provider: string; plano: string | null; valor_centavos: number;
  observacao: string | null; criado_em: string; pago_em: string | null; referencia_fim: string | null;
  bar_id: string; bar_nome: string; musica: string | null; registrado_por_nome: string | null;
}
interface Resposta { itens: Item[]; totais: { tipo: string; forma: string; quantidade: number; valor_centavos: number }[] }

const STATUS: Record<string, { rotulo: string; tom: 'ok' | 'ouro' | 'erro' | 'neutro' }> = {
  pago: { rotulo: 'Pago', tom: 'ok' }, pendente: { rotulo: 'Pendente', tom: 'ouro' }, expirado: { rotulo: 'Expirado', tom: 'erro' }, cancelado: { rotulo: 'Cancelado', tom: 'neutro' },
};

/** Todos os pagamentos: do bar selecionado (dono/admin) ou de toda a plataforma (admin). */
export default function PagamentosPagina({ plataforma }: { plataforma?: boolean }) {
  const { req, ehAdmin } = useAuth();
  const { bar, bares, recarregar } = useBar();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [tipo, setTipo] = useState('');
  const [forma, setForma] = useState('');
  const [status, setStatus] = useState('');
  const [barFiltro, setBarFiltro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);

  const carregar = useCallback(async () => {
    if (!plataforma && !bar) return;
    const p = new URLSearchParams();
    if (tipo) p.set('tipo', tipo);
    if (forma) p.set('forma', forma);
    if (status) p.set('status', status);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    try {
      if (plataforma) {
        if (barFiltro) p.set('bar_id', barFiltro);
        setDados(await req('GET', `/api/admin/pagamentos?${p}`));
      } else {
        setDados(await req('GET', `/api/bares/${bar!.id}/pagamentos?${p}`));
      }
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [req, plataforma, bar?.id, tipo, forma, status, de, ate, barFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar(); }, [carregar]);

  const total = dados?.totais.reduce((s, t) => s + t.valor_centavos, 0) ?? 0;
  const porForma = (dados?.totais ?? []).reduce<Record<string, number>>((m, t) => ({ ...m, [t.forma]: (m[t.forma] ?? 0) + t.valor_centavos }), {});
  const porTipo = (dados?.totais ?? []).reduce<Record<string, number>>((m, t) => ({ ...m, [t.tipo]: (m[t.tipo] ?? 0) + t.valor_centavos }), {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Pagamentos{plataforma ? ' da plataforma' : ''}</h1>
          <p className="text-sm text-muted">{plataforma ? 'Mensalidades e super chats de todos os bares, com a forma de recebimento.' : `Mensalidades e super chats de ${bar?.nome ?? 'seu bar'}.`}</p>
        </div>
        {ehAdmin && plataforma && <Botao onClick={() => setRegistrando(true)}><CircleDollarSign className="size-4" /> Registrar pagamento</Botao>}
      </div>

      {msg && <Aviso tipo="ok">{msg}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plataforma && (
          <Select value={barFiltro} onChange={(e) => setBarFiltro(e.target.value)} aria-label="Bar">
            <option value="">Todos os bares</option>
            {bares?.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </Select>
        )}
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Forma de recebimento"><option value="">Toda forma</option>{Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação"><option value="">Toda situação</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</Select>
        <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
        <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
        {(tipo || forma || status || de || ate || barFiltro) && <Botao variante="fantasma" onClick={() => { setTipo(''); setForma(''); setStatus(''); setDe(''); setAte(''); setBarFiltro(''); }}>Limpar filtros</Botao>}
      </Cartao>

      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao><p className="text-xs font-semibold text-muted">Total recebido (pagos)</p><p className="mt-1 text-2xl font-extrabold text-brand">{reais(total)}</p></Cartao>
        <Cartao>
          <p className="text-xs font-semibold text-muted">Por forma de recebimento</p>
          <p className="mt-1 space-x-3 text-sm">{Object.keys(porForma).length ? Object.entries(porForma).map(([k, v]) => <span key={k}><span className="text-muted">{FORMAS[k] ?? k}</span> <b>{reais(v)}</b></span>) : <span className="text-muted">—</span>}</p>
        </Cartao>
        <Cartao>
          <p className="text-xs font-semibold text-muted">Por tipo</p>
          <p className="mt-1 space-x-3 text-sm">{Object.keys(porTipo).length ? Object.entries(porTipo).map(([k, v]) => <span key={k}><span className="text-muted">{TIPOS[k] ?? k}</span> <b>{reais(v)}</b></span>) : <span className="text-muted">—</span>}</p>
        </Cartao>
      </div>

      {!dados ? <p className="text-muted">Carregando…</p> : dados.itens.length === 0 ? (
        <Vazio icone={<Receipt className="size-10" />} titulo="Nenhum pagamento encontrado">Ajuste os filtros ou aguarde novos recebimentos.</Vazio>
      ) : (
        <>
          {/* Tabela no desktop, cartões no celular */}
          <div className="hidden overflow-x-auto rounded-xl bg-surface md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>{['Data', plataforma ? 'Bar' : null, 'Tipo', 'Detalhe', 'Forma', 'Valor', 'Situação'].filter(Boolean).map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {dados.itens.map((p) => (
                  <tr key={p.id} className="hover:bg-elevated/50">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted">{dataHoraBR(p.pago_em ?? p.criado_em)}</td>
                    {plataforma && <td className="px-3 py-2.5 font-semibold">{p.bar_nome}</td>}
                    <td className="px-3 py-2.5">{TIPOS[p.tipo]}</td>
                    <td className="max-w-64 px-3 py-2.5 text-muted"><span className="line-clamp-2">{detalhe(p)}</span></td>
                    <td className="px-3 py-2.5">{FORMAS[p.forma] ?? p.forma}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold">{reais(p.valor_centavos)}</td>
                    <td className="px-3 py-2.5"><Chip tom={STATUS[p.status]?.tom}>{STATUS[p.status]?.rotulo ?? p.status}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 md:hidden">
            {dados.itens.map((p) => (
              <li key={p.id} className="rounded-xl bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-semibold">{plataforma ? `${p.bar_nome} · ` : ''}{TIPOS[p.tipo]}</p><p className="truncate text-xs text-muted">{detalhe(p)}</p></div>
                  <p className="font-bold">{reais(p.valor_centavos)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted"><span>{dataHoraBR(p.pago_em ?? p.criado_em)}</span><span>· {FORMAS[p.forma] ?? p.forma}</span><span className="ml-auto"><Chip tom={STATUS[p.status]?.tom}>{STATUS[p.status]?.rotulo ?? p.status}</Chip></span></div>
              </li>
            ))}
          </ul>
        </>
      )}

      {ehAdmin && plataforma && (
        <RegistrarMensalidade aberto={registrando} bares={bares ?? []} onFechar={() => setRegistrando(false)} onRegistrado={(t) => { setMsg(t); void carregar(); void recarregar(); }} />
      )}
    </div>
  );
}

function detalhe(p: Item) {
  if (p.tipo === 'superchat') return p.musica ?? 'Super chat';
  const partes = [p.plano ? `Plano ${p.plano}` : 'Mensalidade'];
  if (p.referencia_fim) partes.push(`válido até ${dataBR(p.referencia_fim)}`);
  if (p.registrado_por_nome) partes.push(`lançado por ${p.registrado_por_nome}`);
  if (p.observacao) partes.push(p.observacao);
  return partes.join(' · ');
}
