import { Disc3, Link2, MonitorSmartphone, Plus, RefreshCw, Smartphone, Speaker, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Aviso, Botao, Cartao, Chip, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBar } from './contexto';

interface Conta { id: string; nome: string; email: string | null; produto: string | null; bares_usando: number }
interface Dispositivo { id: string; nome: string; tipo: string; ativo: boolean; em_uso_por: string | null }

const iconeDe = (tipo: string) => (/speaker|cast|audio/i.test(tipo) ? Speaker : /phone|tablet/i.test(tipo) ? Smartphone : MonitorSmartphone);

export default function SpotifyConfig() {
  const { req } = useAuth();
  const { bar, recarregar } = useBar();
  const [busca, setBusca] = useSearchParams();
  const [dados, setDados] = useState<{ modo: 'mock' | 'real'; limite: number; contas: Conta[] } | null>(null);
  const [contaSel, setContaSel] = useState<string | null>(null);
  const [devs, setDevs] = useState<Dispositivo[] | null>(null);
  const [carregandoDevs, setCarregandoDevs] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);

  const carregar = useCallback(async () => setDados(await req('GET', '/api/spotify/contas')), [req]);

  useEffect(() => {
    void carregar();
    if (busca.get('conectado')) setMsg({ tipo: 'ok', texto: 'Conta Spotify conectada!' });
    if (busca.get('erro')) setMsg({ tipo: 'erro', texto: busca.get('erro')! });
    if (busca.size) setBusca({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setContaSel(bar?.spotify_conta_id ?? dados?.contas[0]?.id ?? null), [bar?.spotify_conta_id, dados?.contas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const listar = useCallback(async (id: string) => {
    setCarregandoDevs(true);
    setDevs(null);
    try {
      setDevs(await req('GET', `/api/spotify/contas/${id}/dispositivos`));
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    } finally {
      setCarregandoDevs(false);
    }
  }, [req]);

  useEffect(() => {
    if (contaSel) void listar(contaSel);
  }, [contaSel]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bar) return null;

  async function conectar() {
    try {
      const { url } = await req('GET', `/api/spotify/conectar?retorno=${encodeURIComponent(window.location.origin)}`);
      window.location.href = url;
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function usar(d: Dispositivo) {
    try {
      await req('PUT', `/api/bares/${bar!.id}/spotify`, { conta_id: contaSel, device_id: d.id, device_nome: d.nome });
      await recarregar();
      setMsg({ tipo: 'ok', texto: `"${d.nome}" definido como o player de ${bar!.nome}.` });
      if (contaSel) void listar(contaSel);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function desvincular() {
    await req('PUT', `/api/bares/${bar!.id}/spotify`, { conta_id: null, device_id: null });
    await recarregar();
    setMsg({ tipo: 'info', texto: 'Player desvinculado. A fila pausa até escolher um dispositivo.' });
  }

  async function removerConta(c: Conta) {
    if (!confirm(`Remover a conta "${c.nome}"? ${c.bares_usando ? `Ela está em uso por ${c.bares_usando} bar(es), que ficarão sem player.` : ''}`)) return;
    await req('DELETE', `/api/spotify/contas/${c.id}`);
    await Promise.all([carregar(), recarregar()]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Spotify</h1>
        <p className="text-sm text-muted">Conecte contas Premium e escolha o aparelho que toca no bar (um celular com o app Spotify aberto, por exemplo).</p>
      </div>

      {dados?.modo === 'mock' && <Aviso tipo="ouro">Modo demonstração: o servidor usa um Spotify simulado. Em produção configure SPOTIFY_MODE=real.</Aviso>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Cartao className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">Contas conectadas {dados && <span className="font-normal text-muted">({dados.contas.length}/{dados.limite})</span>}</h2>
          <Botao tamanho="sm" onClick={conectar}><Plus className="size-4" /> Conectar conta</Botao>
        </div>
        {!dados ? <p className="text-sm text-muted">Carregando…</p> : dados.contas.length === 0 ? (
          <Vazio icone={<Disc3 className="size-9" />} titulo="Nenhuma conta conectada">É preciso uma conta Spotify Premium para controlar a reprodução.</Vazio>
        ) : (
          <ul className="space-y-1.5">
            {dados.contas.map((c) => (
              <li key={c.id}>
                <div className={`flex items-center gap-3 rounded-lg p-3 transition ${contaSel === c.id ? 'bg-elevated ring-1 ring-brand/50' : 'hover:bg-elevated/60'}`}>
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setContaSel(c.id)} aria-pressed={contaSel === c.id}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Disc3 className="size-5" /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.nome}</span>
                      <span className="block truncate text-xs text-muted">{c.email ?? 'sem e-mail'} · {c.produto ?? 'plano desconhecido'}</span>
                    </span>
                  </button>
                  {bar.spotify_conta_id === c.id && <Chip tom="ok"><Link2 className="size-3" /> Neste bar</Chip>}
                  <button onClick={() => removerConta(c)} className="grid size-8 place-items-center rounded-full text-faint hover:bg-danger/10 hover:text-danger" aria-label={`Remover conta ${c.nome}`}><Trash2 className="size-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {contaSel && (
        <Cartao className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Dispositivos desta conta</h2>
              <p className="text-xs text-muted">Abra o app Spotify no aparelho do bar para ele aparecer aqui.</p>
            </div>
            <Botao tamanho="sm" variante="secundario" onClick={() => listar(contaSel)} carregando={carregandoDevs}><RefreshCw className="size-4" /> Atualizar</Botao>
          </div>
          {devs && devs.length === 0 && <Vazio icone={<MonitorSmartphone className="size-9" />} titulo="Nenhum dispositivo encontrado">Abra o Spotify no celular do bar, toque uma música por um instante e atualize.</Vazio>}
          <ul className="space-y-1.5">
            {devs?.map((d) => {
              const Icone = iconeDe(d.tipo);
              const atual = bar.spotify_device_id === d.id;
              const ocupado = !!d.em_uso_por && !atual;
              return (
                <li key={d.id} className={`flex items-center gap-3 rounded-lg p-3 ${atual ? 'bg-brand/10 ring-1 ring-brand/40' : 'bg-elevated/50'}`}>
                  <Icone className="size-6 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{d.nome}</p>
                    <p className="text-xs text-muted">{d.tipo}{d.ativo ? ' · ativo agora' : ''}{ocupado ? ` · em uso por "${d.em_uso_por}"` : ''}</p>
                  </div>
                  {atual ? (
                    <Botao tamanho="sm" variante="fantasma" onClick={desvincular}>Desvincular</Botao>
                  ) : (
                    <Botao tamanho="sm" onClick={() => usar(d)} disabled={ocupado}>Usar neste bar</Botao>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}

      <Cartao className="text-sm text-muted">
        <p className="mb-1 font-bold text-white">Como funciona</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>O sistema adiciona na fila do Spotify a próxima música (super chat primeiro, depois a mais votada) pouco antes da atual acabar.</li>
          <li>Deixe o aparelho com tela ligada e o app Spotify aberto, sem outras músicas na fila do próprio Spotify.</li>
          <li>Cada dispositivo só pode atender um bar por vez.</li>
        </ul>
      </Cartao>
    </div>
  );
}
