import { Copy, Download, Printer, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { Aviso, Botao, Cartao } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBar } from './contexto';

export default function QrCodeBar() {
  const { req } = useAuth();
  const { bar } = useBar();
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    if (!bar) return;
    setUrl(null);
    req('GET', `/api/bares/${bar.id}/qr`).then((r) => setUrl(r.url), (e) => setMsg({ tipo: 'erro', texto: mensagemErro(e) }));
  }, [bar?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: 'M' }).then(setImg);
  }, [url]);

  if (!bar) return null;

  async function regenerar() {
    if (!confirm('Gerar um novo QR Code? Os QR Codes já impressos deixam de funcionar.')) return;
    const r = await req('POST', `/api/bares/${bar!.id}/qr/regenerar`);
    setUrl(r.url);
    setMsg({ tipo: 'ok', texto: 'Novo QR Code gerado. Imprima e troque os antigos.' });
  }

  const baixar = () => {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img;
    a.download = `qrcode-${bar.slug}.png`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-extrabold">QR Code do bar</h1>
        <p className="text-sm text-muted">Quem entra por este QR Code vai direto para a sala do seu bar, sem precisar do GPS. Sem ler o QR, o cliente precisa estar no raio do local.</p>
      </div>

      <Cartao className="mx-auto max-w-sm text-center print:bg-white print:text-black print:shadow-none" >
        <p className="mb-1 text-lg font-extrabold">{bar.nome}</p>
        <p className="mb-4 text-sm text-muted print:text-neutral-600">Escolha a música que vai tocar!</p>
        <div className="mx-auto w-fit rounded-2xl bg-white p-3">
          {img ? <img src={img} alt={`QR Code de ${bar.nome}`} className="size-64" /> : <div className="size-64 animate-pulse rounded bg-neutral-200" />}
        </div>
        <p className="mt-4 text-xs text-muted print:text-neutral-600">Aponte a câmera, vote e peça sua música</p>
      </Cartao>

      {msg && <div className="print:hidden"><Aviso tipo={msg.tipo}>{msg.texto}</Aviso></div>}

      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        <Botao onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Botao>
        <Botao variante="secundario" onClick={baixar} disabled={!img}><Download className="size-4" /> Baixar PNG</Botao>
        <Botao variante="secundario" onClick={() => url && navigator.clipboard.writeText(url).then(() => setMsg({ tipo: 'ok', texto: 'Link copiado.' }))} disabled={!url}><Copy className="size-4" /> Copiar link</Botao>
        <Botao variante="perigo" onClick={regenerar}><RefreshCw className="size-4" /> Gerar novo</Botao>
      </div>
      {url && <p className="break-all text-center text-xs text-faint print:hidden">{url}</p>}
    </div>
  );
}
