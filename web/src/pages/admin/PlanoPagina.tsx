import { Check, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Aviso, Cartao, Chip } from '../../components/ui';
import { api } from '../../lib/api';
import { dataBR, reais, textoVencimento } from '../../lib/format';
import { useBar } from './contexto';

interface Plano { id: string; nome: string; valorCentavos: number; meses: number; beneficios: string[] }

/** Somente consulta: mostra os planos e destaca o atual. Mudar de plano é pelo administrador. */
export default function PlanoPagina() {
  const { bar } = useBar();
  const [planos, setPlanos] = useState<Plano[]>([]);

  useEffect(() => {
    api<Plano[]>('GET', '/api/planos').then(setPlanos, () => undefined);
  }, []);

  if (!bar) return null;

  const atualId = bar.plano_efetivo;
  const pago = atualId !== 'free' || bar.plano !== 'free';
  const mensal = planos.find((p) => p.id === 'mensal');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Plano</h1>
        <p className="text-sm text-muted">
          Plano atual de {bar.nome}: <strong className="text-white capitalize">{atualId}</strong>
          {pago && bar.plano_expira_em && <> · {bar.situacao === 'vencido' ? 'venceu' : 'vence'} em {dataBR(bar.plano_expira_em)} ({textoVencimento(bar.dias_para_vencer)})</>}
        </p>
      </div>

      {bar.bloqueado && <Aviso tipo="erro"><b>Bar bloqueado:</b> {bar.motivo_bloqueio}. Entre em contato com o administrador da plataforma para regularizar.</Aviso>}
      {!bar.bloqueado && bar.situacao === 'vencido' && <Aviso tipo="erro">Mensalidade vencida. Entre em contato com o administrador para renovar e evitar o bloqueio.</Aviso>}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {planos.map((p) => {
          const atual = atualId === p.id;
          const porMes = p.meses ? p.valorCentavos / p.meses : 0;
          const economia = mensal && p.meses > 1 ? mensal.valorCentavos * p.meses - p.valorCentavos : 0;
          return (
            <Cartao key={p.id} className={`flex flex-col gap-3 ${atual ? 'ring-2 ring-brand' : 'opacity-80'}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">{p.nome}</h2>
                {atual && <Chip tom="ok"><Check className="size-3" /> Seu plano</Chip>}
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
            </Cartao>
          );
        })}
      </div>

      <Cartao className="flex items-start gap-3 text-sm text-muted">
        <MessageCircle className="mt-0.5 size-5 shrink-0 text-brand" />
        <p>Quer <b className="text-white">mudar de plano</b>? Entre em contato com o administrador da plataforma. A alteração e o pagamento são feitos por ele.</p>
      </Cartao>
    </div>
  );
}
