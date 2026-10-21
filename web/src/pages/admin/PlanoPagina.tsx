import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PixFolha, type PixDados } from '../../components/PixFolha';
import { Aviso, Botao, Cartao, Chip } from '../../components/ui';
import { api, mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { reais } from '../../lib/format';
import { useModo } from '../../lib/modo';
import { useBar } from './contexto';

interface Plano { id: string; nome: string; valorCentavos: number; meses: number; beneficios: string[] }

export default function PlanoPagina() {
  const { req } = useAuth();
  const { bar, recarregar } = useBar();
  const modo = useModo();
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [pix, setPix] = useState<PixDados | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<Plano[]>('GET', '/api/planos').then(setPlanos, () => undefined);
  }, []);

  if (!bar) return null;

  async function assinar(p: Plano) {
    setMsg(null);
    try {
      const r = await req('POST', `/api/bares/${bar!.id}/assinar`, { plano: p.id });
      setPix({ ...r, titulo: `Plano ${p.nome} — ${bar!.nome}` });
    } catch (e) {
      setMsg(mensagemErro(e));
    }
  }

  const venc = bar.plano_expira_em ? new Date(bar.plano_expira_em).toLocaleDateString('pt-BR') : null;
  const mensal = planos.find((p) => p.id === 'mensal');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Plano</h1>
        <p className="text-sm text-muted">
          Plano atual de {bar.nome}: <strong className="text-white capitalize">{bar.plano_efetivo}</strong>
          {bar.plano !== 'free' && venc && <> · {bar.situacao === 'vencido' ? 'venceu' : 'vence'} em {venc}</>}
        </p>
      </div>
      {bar.bloqueado && <Aviso tipo="erro"><b>Bar bloqueado:</b> {bar.motivo_bloqueio}. Pague a mensalidade abaixo ou fale com o administrador — o pagamento libera o bar.</Aviso>}
      {!bar.bloqueado && bar.situacao === 'vencido' && <Aviso tipo="erro">Mensalidade vencida. Renove para reativar o super chat e evitar o bloqueio.</Aviso>}
      {msg && <Aviso tipo="erro">{msg}</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {planos.map((p) => {
          const atual = bar.plano_efetivo === p.id;
          const destaque = p.id === 'anual';
          const porMes = p.meses ? p.valorCentavos / p.meses : 0;
          const economia = mensal && p.meses > 1 ? mensal.valorCentavos * p.meses - p.valorCentavos : 0;
          return (
            <Cartao key={p.id} className={`flex flex-col gap-3 ${destaque ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">{p.nome}</h2>
                {destaque && <Chip tom="ok">Melhor valor</Chip>}
                {atual && !destaque && <Chip tom="ok">Atual</Chip>}
              </div>
              <div>
                <p className="text-2xl font-extrabold">{p.valorCentavos === 0 ? 'Grátis' : reais(p.valorCentavos)}</p>
                <p className="text-xs text-muted">
                  {p.valorCentavos === 0 ? 'para sempre' : p.meses === 1 ? 'por mês' : `por ${p.meses} meses · ${reais(porMes)}/mês`}
                </p>
                {economia > 0 && <p className="mt-1 text-xs font-semibold text-brand">Economize {reais(economia)}</p>}
              </div>
              <ul className="flex-1 space-y-1.5 text-sm text-muted">
                {p.beneficios.map((b) => <li key={b} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand" /> {b}</li>)}
              </ul>
              {p.id === 'free' ? (
                <Botao variante="secundario" disabled>{atual ? 'Plano atual' : 'Incluso'}</Botao>
              ) : (
                <Botao variante={destaque ? 'primario' : 'secundario'} onClick={() => assinar(p)}>{atual ? 'Renovar' : 'Assinar'} com Pix</Botao>
              )}
            </Cartao>
          );
        })}
      </div>
      <p className="text-xs text-faint">O pagamento é por Pix e libera o plano assim que confirmado. Renovar antes do vencimento soma o período ao que já resta.</p>

      <PixFolha
        pix={pix}
        consultar={(id) => req<PixDados>('GET', `/api/pagamentos/${id}`)}
        onFechar={() => setPix(null)}
        onPago={() => void recarregar()}
        simulavel={modo?.pix === 'mock'}
        dica="Seu plano já está ativo. Obrigado!"
      />
    </div>
  );
}
