import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Campo, Cartao, Input } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBar } from './contexto';

export default function PixConfig() {
  const { req } = useAuth();
  const { bar, recarregar } = useBar();
  const [prov, setProv] = useState<'estatico' | 'mercadopago'>('estatico');
  const [chave, setChave] = useState('');
  const [titular, setTitular] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!bar) return;
    setProv(bar.pix_provider);
    setChave(bar.pix_chave ?? '');
    setTitular(bar.pix_titular ?? '');
    setToken('');
  }, [bar?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bar) return null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await req('PUT', `/api/bares/${bar!.id}/pix`, { pix_provider: prov, pix_chave: chave || null, pix_titular: titular || null, mp_access_token: token || undefined });
      await recarregar();
      setToken('');
      setMsg({ tipo: 'ok', texto: 'Recebimento Pix salvo.' });
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Recebimento do super chat</h1>
        <p className="text-sm text-muted">Os pagamentos vão direto para você. A plataforma não toca no dinheiro dos super chats.</p>
      </div>
      {bar.plano_efetivo === 'free' && <Aviso tipo="ouro">O super chat só funciona nos planos pagos. <Link to="/admin/plano" className="font-bold underline">Ver planos</Link></Aviso>}

      <Cartao className="space-y-4">
        <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
          {([
            ['estatico', 'Chave Pix', 'Mais simples. O cliente paga para a sua chave e você confirma o recebimento no painel.'],
            ['mercadopago', 'Mercado Pago', 'Confirmação automática: a música sobe na fila assim que o Pix é pago.'],
          ] as const).map(([id, titulo, desc]) => (
            <button type="button" key={id} role="radio" aria-checked={prov === id} onClick={() => setProv(id)}
              className={`rounded-xl border p-4 text-left transition ${prov === id ? 'border-brand bg-brand/10' : 'border-line hover:border-faint'}`}>
              <p className="font-bold">{titulo}</p>
              <p className="mt-1 text-sm text-muted">{desc}</p>
            </button>
          ))}
        </div>

        {prov === 'estatico' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Chave Pix *" dica="CPF/CNPJ, e-mail, telefone ou chave aleatória"><Input value={chave} onChange={(e) => setChave(e.target.value)} required /></Campo>
            <Campo rotulo="Nome do recebedor" dica="Como aparece no banco do cliente (máx. 25)"><Input value={titular} maxLength={25} onChange={(e) => setTitular(e.target.value)} /></Campo>
          </div>
        ) : (
          <Campo rotulo="Access Token do Mercado Pago" dica={bar.mp_configurado ? 'Já configurado — deixe em branco para manter o atual.' : 'Painel do Mercado Pago → Suas integrações → Credenciais de produção.'}>
            <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={bar.mp_configurado ? '••••••••••••' : 'APP_USR-…'} autoComplete="off" />
          </Campo>
        )}
      </Cartao>

      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      <Botao tamanho="lg" carregando={salvando}>Salvar</Botao>
    </form>
  );
}
