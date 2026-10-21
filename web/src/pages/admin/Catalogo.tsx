import { Check, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Botao, Capa, Cartao, Chip, Input, Select, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { tempo } from '../../lib/format';
import { useBar } from './contexto';

interface Item { id: string; spotify_track_id: string; nome: string; artistas: string; album?: string | null; capa_url: string | null; duracao_ms: number; estilo: string }
interface Faixa { id: string; uri: string; nome: string; artistas: string; album: string; capa_url: string | null; duracao_ms: number; no_catalogo: boolean }

export default function Catalogo() {
  const { req } = useAuth();
  const { bar } = useBar();
  const [itens, setItens] = useState<Item[]>([]);
  const [limite, setLimite] = useState(0);
  const [filtro, setFiltro] = useState<string | null>(null);
  const [termo, setTermo] = useState('');
  const [achadas, setAchadas] = useState<Faixa[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [estiloNovo, setEstiloNovo] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!bar) return;
    const r = await req('GET', `/api/bares/${bar.id}/catalogo`);
    setItens(r.itens);
    setLimite(r.limite);
  }, [bar?.id, req]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void carregar();
    setEstiloNovo(bar?.estilos[0] ?? '');
    setAchadas(null);
  }, [bar?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bar) return null;

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    setMsg(null);
    try {
      setAchadas(await req('GET', `/api/bares/${bar!.id}/spotify/buscar?q=${encodeURIComponent(termo.trim())}`));
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) });
    } finally {
      setBuscando(false);
    }
  }

  async function adicionar(f: Faixa) {
    try {
      await req('POST', `/api/bares/${bar!.id}/catalogo`, {
        spotify_track_id: f.id, uri: f.uri, nome: f.nome, artistas: f.artistas, album: f.album, capa_url: f.capa_url, duracao_ms: f.duracao_ms, estilo: estiloNovo,
      });
      setAchadas((a) => a?.map((x) => (x.id === f.id ? { ...x, no_catalogo: true } : x)) ?? null);
      setMsg({ tipo: 'ok', texto: `"${f.nome}" adicionada em ${estiloNovo}.` });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) });
    }
  }

  const remover = async (i: Item) => {
    await req('DELETE', `/api/bares/${bar.id}/catalogo/${i.id}`);
    await carregar();
  };
  const mudarEstilo = async (i: Item, estilo: string) => {
    try {
      await req('PATCH', `/api/bares/${bar.id}/catalogo/${i.id}`, { estilo });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) });
    }
  };

  const visiveis = filtro ? itens.filter((i) => i.estilo === filtro) : itens;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Catálogo</h1>
        <p className="text-sm text-muted">
          As músicas que o público pode escolher. Cada uma é classificada em um dos estilos do bar. {itens.length}/{limite} no plano atual.
        </p>
      </div>

      {bar.estilos.length === 0 && <Aviso tipo="ouro">Defina os <Link to="/admin/bar" className="font-bold underline">estilos musicais do bar</Link> antes de montar o catálogo.</Aviso>}
      {!bar.spotify_conta_id && <Aviso tipo="ouro">Para buscar músicas, <Link to="/admin/spotify" className="font-bold underline">vincule uma conta Spotify</Link> ao bar.</Aviso>}

      <Cartao className="space-y-4">
        <h2 className="font-bold">Adicionar do Spotify</h2>
        <form onSubmit={buscar} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Música ou artista" className="!pl-9" aria-label="Buscar no Spotify" />
          </div>
          <Select value={estiloNovo} onChange={(e) => setEstiloNovo(e.target.value)} className="sm:max-w-48" aria-label="Estilo da música">
            {bar.estilos.map((e) => <option key={e}>{e}</option>)}
          </Select>
          <Botao carregando={buscando} disabled={!bar.spotify_conta_id}>Buscar</Botao>
        </form>
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        {achadas && (achadas.length === 0 ? <p className="text-sm text-muted">Nada encontrado.</p> : (
          <ul className="space-y-1">
            {achadas.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-elevated">
                <Capa url={f.capa_url} titulo={f.nome} className="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{f.nome}</p>
                  <p className="truncate text-xs text-muted">{f.artistas} · {f.album} · {tempo(f.duracao_ms)}</p>
                </div>
                {f.no_catalogo ? <Chip tom="ok"><Check className="size-3" /> No catálogo</Chip> : <Botao tamanho="sm" variante="secundario" onClick={() => adicionar(f)} disabled={!estiloNovo}><Plus className="size-4" /> Adicionar</Botao>}
              </li>
            ))}
          </ul>
        ))}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-bold">Músicas do bar ({itens.length})</h2>
        {bar.estilos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Chip ativo={!filtro} onClick={() => setFiltro(null)}>Todos</Chip>
            {bar.estilos.map((e) => <Chip key={e} ativo={filtro === e} onClick={() => setFiltro(filtro === e ? null : e)}>{e}</Chip>)}
          </div>
        )}
        {visiveis.length === 0 ? <Vazio titulo="Nenhuma música ainda">Busque no Spotify acima e adicione as músicas que combinam com o seu bar.</Vazio> : (
          <ul className="divide-y divide-line/60">
            {visiveis.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <Capa url={i.capa_url} titulo={i.nome} className="size-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{i.nome}</p>
                  <p className="truncate text-xs text-muted">{i.artistas}{i.album ? ` · ${i.album}` : ''} · {tempo(i.duracao_ms)}</p>
                </div>
                <Select value={i.estilo} onChange={(e) => mudarEstilo(i, e.target.value)} className="!h-8 max-w-36 !text-xs" aria-label={`Estilo de ${i.nome}`}>
                  {[...new Set([...bar.estilos, i.estilo])].map((e) => <option key={e}>{e}</option>)}
                </Select>
                <button onClick={() => remover(i)} className="grid size-8 place-items-center rounded-full text-faint hover:bg-danger/10 hover:text-danger" aria-label={`Remover ${i.nome}`}><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
