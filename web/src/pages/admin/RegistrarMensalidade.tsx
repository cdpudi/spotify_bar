import { useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Folha, Input, Select, Textarea } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { reais } from '../../lib/format';
import type { BarAdmin } from './contexto';

const PLANOS = { mensal: ['Mensal', 20000, 30], semestral: ['Semestral', 100000, 182], anual: ['Anual', 180000, 365] } as const;

/** Lança o recebimento de uma mensalidade: como foi pago e qual o próximo vencimento. */
export function RegistrarMensalidade({
  aberto,
  bares,
  barInicial,
  onFechar,
  onRegistrado,
}: {
  aberto: boolean;
  bares: BarAdmin[];
  barInicial?: string | null;
  onFechar: () => void;
  onRegistrado: (msg: string) => void;
}) {
  const { req } = useAuth();
  const [barId, setBarId] = useState('');
  const [plano, setPlano] = useState<keyof typeof PLANOS>('mensal');
  const [forma, setForma] = useState<'pix' | 'dinheiro' | 'outro'>('pix');
  const [valor, setValor] = useState('');
  const [pagoEm, setPagoEm] = useState('');
  const [venc, setVenc] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const bar = bares.find((b) => b.id === barId);

  useEffect(() => {
    if (!aberto) return;
    setBarId(barInicial ?? bares[0]?.id ?? '');
    setValor('');
    setPagoEm(new Date().toISOString().slice(0, 10));
    setVenc('');
    setObs('');
    setErro(null);
    setForma('pix');
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bar && bar.plano_efetivo !== 'free') setPlano(bar.plano_efetivo);
  }, [barId]); // eslint-disable-line react-hooks/exhaustive-deps

  // vencimento previsto se o campo ficar vazio (soma ao vencimento atual, se ainda vigente)
  const previsto = (() => {
    const [, , dias] = PLANOS[plano];
    const base = bar && bar.plano_efetivo === plano && bar.plano_expira_em && new Date(bar.plano_expira_em) > new Date() ? new Date(bar.plano_expira_em) : new Date();
    return new Date(base.getTime() + dias * 86_400_000).toLocaleDateString('pt-BR');
  })();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await req('POST', `/api/admin/bares/${barId}/mensalidades`, {
        plano,
        forma,
        valor_centavos: valor ? Math.round(Number(valor.replace(',', '.')) * 100) : undefined,
        pago_em: pagoEm || undefined,
        proximo_vencimento: venc || undefined,
        observacao: obs || undefined,
      });
      onRegistrado(`Pagamento de ${bar?.nome} registrado. O bar foi liberado e o vencimento atualizado.`);
      onFechar();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha aberta={aberto} onFechar={onFechar} titulo="Registrar pagamento">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Bar">
          <Select value={barId} onChange={(e) => setBarId(e.target.value)} disabled={!!barInicial} required>
            {bares.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </Select>
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Plano">
            <Select value={plano} onChange={(e) => setPlano(e.target.value as keyof typeof PLANOS)}>
              {Object.entries(PLANOS).map(([id, [nome, v]]) => <option key={id} value={id}>{nome} — {reais(v)}</option>)}
            </Select>
          </Campo>
          <Campo rotulo="Como foi recebido">
            <Select value={forma} onChange={(e) => setForma(e.target.value as typeof forma)}>
              <option value="pix">Pix</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="outro">Outro</option>
            </Select>
          </Campo>
          <Campo rotulo="Valor recebido (R$)" dica="Vazio = valor do plano"><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={(PLANOS[plano][1] / 100).toFixed(2).replace('.', ',')} /></Campo>
          <Campo rotulo="Data do pagamento"><Input type="date" value={pagoEm} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPagoEm(e.target.value)} /></Campo>
        </div>
        <Campo rotulo="Próximo vencimento" dica={`Vazio = ${previsto} (período do plano somado ao vencimento atual)`}>
          <Input type="date" value={venc} min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)} onChange={(e) => setVenc(e.target.value)} />
        </Campo>
        <Campo rotulo="Observação"><Textarea rows={2} value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: recibo 12, pago em mãos" /></Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao className="w-full" carregando={salvando} disabled={!barId}>Registrar e liberar o bar</Botao>
      </form>
    </Folha>
  );
}
