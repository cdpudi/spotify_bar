import { Disc3, Link2, MonitorSmartphone, RefreshCw, Settings2, Smartphone, Speaker } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Cartao, Chip, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBar } from './contexto';

interface Conta {
  id: string; nome: string; email: string | null; produto: string | null; plano_spotify: string; grupo_familia: string | null;
  app_nome: string | null; bar_id: string | null; bar_nome: string | null;
}
interface Dispositivo { id: string; nome: string; tipo: string; ativo: boolean; em_uso_por: string | null }

const iconeDe = (tipo: string) => (/speaker|cast|audio/i.test(tipo) ? Speaker : /phone|tablet/i.test(tipo) ? Smartphone : MonitorSmartphone);
const PLANOS: Record<string, string> = { individual: 'Individual', duo: 'Duo', familia: 'Família' };

/** Escolhe a conta Spotify (livre) e o dispositivo que tocam neste bar. Contas e apps ficam em "Spotify da plataforma". */
export default function SpotifyConfig() {
  const { req } = useAuth();
  const { bar, recarregar } = useBar();
  const [dados, setDados] = useState<{ modo: 'mock' | 'real'; contas: Conta[] } | null>(null);
  const [contaSel, setContaSel] = useState<string | null>(null);
  const [devs, setDevs] = useState<Dispositivo[] | null>(null);
  const [carregandoDevs, setCarregandoDevs] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);

  const carregar = useCallback(async () => setDados(await req('GET', '/api/spotify/contas')), [req]);
  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => setContaSel(bar?.spotify_conta_id ?? dados?.contas.find((c) => !c.bar_id)?.id ?? null), [bar?.id, bar?.spotify_conta_id, dados?.contas.length]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const contaAtual = dados?.contas.find((c) => c.id === contaSel);
  const ocupadaPorOutro = !!contaAtual?.bar_id && contaAtual.bar_id !== bar.id;

  async function usar(d: Dispositivo) {
    try {
      await req('PUT', `/api/bares/${bar!.id}/spotify`, { conta_id: contaSel, device_id: d.id, device_nome: d.nome });
      await Promise.all([recarregar(), carregar()]);
      setMsg({ tipo: 'ok', texto: `"${d.nome}" definido como o player de ${bar!.nome}.` });
      if (contaSel) void listar(contaSel);
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function desvincular() {
    await req('PUT', `/api/bares/${bar!.id}/spotify`, { conta_id: null, device_id: null });
    await Promise.all([recarregar(), carregar()]);
    setMsg({ tipo: 'info', texto: 'Player desvinculado. A conta ficou livre para outro bar.' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Spotify do bar</h1>
          <p className="text-sm text-muted">Escolha a conta Premium e o aparelho que tocam em {bar.nome}. Cada conta atende um bar só.</p>
        </div>
        <Link to="/admin/plataforma/spotify" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"><Settings2 className="size-4" /> Aplicativos e contas</Link>
      </div>

      {dados?.modo === 'mock' && <Aviso tipo="ouro">Modo demonstração: o servidor usa um Spotify simulado.</Aviso>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Cartao className="space-y-3">
        <h2 className="font-bold">Conta Spotify</h2>
        {!dados ? <p className="text-sm text-muted">Carregando…</p> : dados.contas.length === 0 ? (
          <Vazio icone={<Disc3 className="size-9" />} titulo="Nenhuma conta conectada">Conecte uma conta Premium em <Link to="/admin/plataforma/spotify" className="font-semibold text-brand underline">Aplicativos e contas</Link>.</Vazio>
        ) : (
          <ul className="space-y-1.5">
            {dados.contas.map((c) => {
              const outro = !!c.bar_id && c.bar_id !== bar.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setContaSel(c.id)} aria-pressed={contaSel === c.id}
                    className={`flex w-full items-center gap-3 rounded-lg p-3 text-left transition ${contaSel === c.id ? 'bg-elevated ring-1 ring-brand/50' : 'hover:bg-elevated/60'} ${outro ? 'opacity-70' : ''}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Disc3 className="size-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.nome}</span>
                      <span className="block truncate text-xs text-muted">{c.email ?? 'sem e-mail'} · {PLANOS[c.plano_spotify]}{c.grupo_familia ? ` ${c.grupo_familia}` : ''} · {c.app_nome ?? 'sem app'}</span>
                    </span>
                    {c.bar_id === bar.id ? <Chip tom="ok"><Link2 className="size-3" /> Neste bar</Chip> : outro ? <Chip tom="ouro">Atende {c.bar_nome}</Chip> : <Chip>Livre</Chip>}
                  </button>
                </li>
              );
            })}
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
          {ocupadaPorOutro && <Aviso tipo="ouro">Esta conta já atende <b>{contaAtual?.bar_nome}</b>. Uma conta toca em um único lugar por vez — escolha uma conta livre.</Aviso>}
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
                    <Botao tamanho="sm" onClick={() => usar(d)} disabled={ocupado || ocupadaPorOutro}>Usar neste bar</Botao>
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
          <li>O sistema envia à fila do Spotify a próxima música (super chat primeiro, depois a mais votada; sem pedidos, uma do catálogo) pouco antes da atual acabar.</li>
          <li>Deixe o aparelho com tela ligada e o app Spotify aberto, sem outras músicas na fila do próprio Spotify.</li>
          <li>Não use a conta do bar em outro aparelho: o Spotify toca em um lugar só por conta e a música do bar seria interrompida.</li>
        </ul>
      </Cartao>
    </div>
  );
}
