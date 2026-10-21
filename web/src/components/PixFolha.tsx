import { Check, Copy, Clock, PartyPopper } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { reais, tempo } from '../lib/format';
import { Aviso, Botao, Folha } from './ui';

export interface PixDados {
  id: string;
  valor_centavos: number;
  status: 'pendente' | 'pago' | 'expirado' | 'cancelado';
  brcode: string;
  qr_base64: string | null;
  expira_em: string;
  titulo: string;
}

/**
 * Folha de pagamento Pix: QR Code + copia e cola, acompanha o status até confirmar.
 * `consultar` busca o pagamento (público ou do painel); `simular` só existe em PIX_MODE=mock.
 */
export function PixFolha({
  pix,
  consultar,
  onFechar,
  onPago,
  simulavel,
  dica,
}: {
  pix: PixDados | null;
  consultar: (id: string) => Promise<PixDados>;
  onFechar: () => void;
  onPago?: () => void;
  simulavel?: boolean;
  dica?: string;
}) {
  const [atual, setAtual] = useState<PixDados | null>(pix);
  const [img, setImg] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [resta, setResta] = useState(0);

  useEffect(() => setAtual(pix), [pix]);

  useEffect(() => {
    if (!atual) return setImg(null);
    if (atual.qr_base64) return setImg(`data:image/png;base64,${atual.qr_base64}`);
    QRCode.toDataURL(atual.brcode, { margin: 1, width: 280, color: { dark: '#000000', light: '#ffffff' } }).then(setImg, () => setImg(null));
  }, [atual?.id, atual?.brcode, atual?.qr_base64]);

  // acompanha o pagamento
  useEffect(() => {
    if (!atual || atual.status !== 'pendente') return;
    const id = atual.id;
    const t = setInterval(async () => {
      try {
        const novo = await consultar(id);
        setAtual((a) => (a && a.id === id ? { ...novo, titulo: a.titulo } : a));
        if (novo.status === 'pago') onPago?.();
      } catch {
        /* tenta no próximo ciclo */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [atual?.id, atual?.status]);

  useEffect(() => {
    if (!atual) return;
    const f = () => setResta(new Date(atual.expira_em).getTime() - Date.now());
    f();
    const t = setInterval(f, 1000);
    return () => clearInterval(t);
  }, [atual?.expira_em]);

  async function copiar() {
    if (!atual) return;
    try {
      await navigator.clipboard.writeText(atual.brcode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = atual.brcode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function simular() {
    if (!atual) return;
    const novo = await api('POST', `/api/pagamentos/${atual.id}/simular`);
    setAtual({ ...atual, status: novo.status });
    if (novo.status === 'pago') onPago?.();
  }

  const expirou = atual && (atual.status === 'expirado' || (atual.status === 'pendente' && resta <= 0));

  return (
    <Folha aberta={!!pix} onFechar={onFechar} titulo={atual?.titulo ?? 'Pagamento Pix'}>
      {atual && atual.status === 'pago' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-brand/15 text-brand">
            <PartyPopper className="size-8" />
          </div>
          <p className="text-lg font-bold">Pagamento confirmado!</p>
          <p className="text-sm text-muted">{dica ?? 'Tudo certo.'}</p>
          <Botao onClick={onFechar}>Fechar</Botao>
        </div>
      )}
      {atual && atual.status !== 'pago' && (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold">{reais(atual.valor_centavos)}</span>
            <span className={`inline-flex items-center gap-1 text-sm ${expirou ? 'text-danger' : 'text-muted'}`}>
              <Clock className="size-4" />
              {expirou ? 'Expirado' : tempo(resta)}
            </span>
          </div>
          {expirou ? (
            <Aviso tipo="erro">Este Pix expirou. Feche e gere um novo.</Aviso>
          ) : (
            <>
              <div className="mx-auto grid w-fit place-items-center rounded-xl bg-white p-3">
                {img ? <img src={img} alt="QR Code do Pix" className="size-56" /> : <div className="size-56 animate-pulse bg-neutral-200" />}
              </div>
              <p className="text-center text-xs text-muted">Abra o app do seu banco, escolha Pix e leia o QR Code — ou use o copia e cola.</p>
              <div className="flex items-center gap-2 rounded-lg bg-elevated p-2">
                <code className="min-w-0 flex-1 truncate px-1 text-xs text-muted">{atual.brcode}</code>
                <Botao tamanho="sm" variante="secundario" onClick={copiar}>
                  {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </Botao>
              </div>
              <p className="flex items-center justify-center gap-2 text-xs text-muted">
                <span className="size-2 animate-pulse rounded-full bg-gold" /> Aguardando confirmação do pagamento…
              </p>
              {simulavel && (
                <Botao variante="ouro" className="w-full" onClick={simular}>
                  Simular pagamento (modo demonstração)
                </Botao>
              )}
            </>
          )}
        </div>
      )}
    </Folha>
  );
}
