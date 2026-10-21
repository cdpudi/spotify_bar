import { ArrowLeft, ArrowUp, Crown, ListMusic, MapPin, Plus, QrCode, Search, Sparkles, UserRound, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PixFolha, type PixDados } from '../components/PixFolha';
import { Aviso, Botao, Capa, Chip, Equalizador, Folha, Input, Vazio } from '../components/ui';
import { api, ErroApi, mensagemErro } from '../lib/api';
import { reais, tempo } from '../lib/format';
import { useModo } from '../lib/modo';
import { apelido, entrarNaSala, posicaoAtual, salvarApelido, tokenSalvo, useProgresso, useSala, type EstadoSala, type ItemFila } from '../lib/publico';

interface MusicaCatalogo {
  id: string;
  nome: string;
  artistas: string;
  album: string | null;
  capa_url: string | null;
  duracao_ms: number;
  estilo: string;
  na_fila: 'pendente' | 'enviada' | 'tocando' | null;
}

export default function Sala() {
  const { slug = '' } = useParams();
  const [busca] = useSearchParams();
  const qr = busca.get('q');
  const [token, setToken] = useState<string | null>(() => (qr ? null : tokenSalvo(slug)));
  const [entrando, setEntrando] = useState(!!qr);
  const [erroEntrada, setErroEntrada] = useState<string | null>(null);

  const entrar = useCallback(
    async (via: 'qr' | 'gps') => {
      setErroEntrada(null);
      setEntrando(true);
      try {
        if (via === 'qr' && qr) {
          setToken((await entrarNaSala(slug, { q: qr })).token);
        } else {
          const p = await posicaoAtual();
          setToken((await entrarNaSala(slug, { lat: p.coords.latitude, lng: p.coords.longitude, precisao_m: p.coords.accuracy })).token);
        }
      } catch (e) {
        setErroEntrada(mensagemErro(e));
      } finally {
        setEntrando(false);
      }
    },
    [slug, qr],
  );

  // QR Code: entra direto, sem GPS
  useEffect(() => {
    if (qr && !token) void entrar('qr');
  }, [qr]); // eslint-disable-line react-hooks/exhaustive-deps

  const { estado, erro: erroSala, skewMs, recarregar } = useSala(slug, token);

  if (erroSala && !estado) {
    return (
      <Centro>
        <Vazio icone={<MapPin className="size-10" />} titulo="Bar indisponível">{erroSala}</Vazio>
        <Link to="/" className="mt-4 text-sm font-semibold text-brand">Ver outros bares</Link>
      </Centro>
    );
  }
  if (!estado) return <Centro><span className="size-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></Centro>;

  return (
    <Sala2
      estado={estado}
      skewMs={skewMs}
      token={token}
      semSessao={() => setToken(null)}
      recarregar={recarregar}
      gate={{ entrando, erro: erroEntrada, entrar, temQr: !!qr }}
    />
  );
}

const Centro = ({ children }: { children: React.ReactNode }) => <div className="grid min-h-dvh place-items-center px-6 text-center">{children}</div>;

function Sala2({
  estado, skewMs, token, semSessao, recarregar, gate,
}: {
  estado: EstadoSala; skewMs: number; token: string | null; semSessao: () => void; recarregar: () => Promise<void>;
  gate: { entrando: boolean; erro: string | null; entrar: (v: 'qr' | 'gps') => void; temQr: boolean };
}) {
  const { bar } = estado;
  const slug = bar.slug;
  const [aba, setAba] = useState<'fila' | 'escolher'>('fila');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pix, setPix] = useState<PixDados | null>(null);
  const [superAlvo, setSuperAlvo] = useState<MusicaCatalogo | null>(null);
  const [perfilAberto, setPerfilAberto] = useState(false);
  const modo = useModo();
  const timer = useRef<number | undefined>(undefined);

  const msg = (tipo: 'ok' | 'erro', texto: string) => {
    setAviso({ tipo, texto });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAviso(null), 3800);
  };

  /** Executa uma ação autenticada tratando sessão expirada e mostrando o resultado. */
  async function acao<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
    try {
      const r = await fn();
      if (ok) msg('ok', ok);
      void recarregar();
      return r;
    } catch (e) {
      if (e instanceof ErroApi && (e.status === 401 || (e.status === 403 && /outro bar/.test(e.message)))) semSessao();
      else msg('erro', mensagemErro(e));
    }
  }

  const votar = (f: ItemFila) =>
    acao(() => (f.meu_voto ? api('DELETE', `/api/public/bares/${slug}/fila/${f.id}/voto`, undefined, token) : api('POST', `/api/public/bares/${slug}/fila/${f.id}/voto`, undefined, token)));

  const pedir = async (m: MusicaCatalogo) => {
    const r = await acao(() => api<{ acao: 'pedido' | 'voto' }>('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: m.id }, token));
    if (r) {
      msg('ok', r.acao === 'voto' ? 'Voto registrado!' : 'Música na fila! Seu pedido já conta como 1 voto.');
      setAba('fila');
    }
  };

  const gerarPix = async () => {
    if (!superAlvo) return;
    const r = await acao(() => api('POST', `/api/public/bares/${slug}/superchat`, { catalogo_id: superAlvo.id }, token));
    if (r) {
      setPix({ ...r, titulo: `Super chat — ${superAlvo.nome}` });
      setSuperAlvo(null);
    }
  };

  const consultarPix = (id: string) => api<PixDados>('GET', `/api/public/pagamentos/${id}`, undefined, token);

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-24 lg:pb-10">
      <header className="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-bg/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="grid size-9 place-items-center rounded-full text-muted hover:bg-hover hover:text-white" aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight">{bar.nome}</h1>
          <p className="truncate text-xs text-muted">{bar.cidade}/{bar.uf}{bar.estilos.length ? ` · ${bar.estilos.join(', ')}` : ''}</p>
        </div>
        {token && (
          <button onClick={() => setPerfilAberto(true)} className="grid size-9 place-items-center rounded-full bg-elevated text-muted hover:text-white" aria-label="Seu apelido">
            <UserRound className="size-5" />
          </button>
        )}
      </header>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Tocando estado={estado} skewMs={skewMs} />

        <main>
          {!token ? (
            <Portaria gate={gate} raio />
          ) : (
            <>
              <div role="tablist" className="mb-4 grid grid-cols-2 rounded-full bg-surface p-1">
                {([['fila', 'Fila', ListMusic], ['escolher', 'Escolher música', Search]] as const).map(([id, rotulo, Icone]) => (
                  <button
                    key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                    className={`flex h-10 items-center justify-center gap-2 rounded-full text-sm font-bold transition ${aba === id ? 'bg-elevated text-white' : 'text-muted hover:text-white'}`}
                  >
                    <Icone className="size-4" /> {rotulo}
                    {id === 'fila' && estado.fila.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[0.65rem] text-black">{estado.fila.length}</span>}
                  </button>
                ))}
              </div>

              {aba === 'fila' ? (
                <Fila fila={estado.fila} onVotar={votar} onEscolher={() => setAba('escolher')} />
              ) : (
                <Catalogo
                  slug={slug} token={token} estilos={bar.estilos} superchat={bar.superchat} valorSuper={bar.superchat_valor_centavos}
                  onPedir={pedir} onSuper={setSuperAlvo} aoErro={(e) => acao(() => Promise.reject(e))} versao={estado.fila.length}
                />
              )}
            </>
          )}
        </main>
      </div>

      {aviso && (
        <div className="fixed inset-x-0 bottom-4 z-[60] mx-auto w-[min(92vw,420px)] animate-subir" role="status">
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        </div>
      )}

      <Folha aberta={!!superAlvo} onFechar={() => setSuperAlvo(null)} titulo="Super chat">
        {superAlvo && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-elevated p-3">
              <Capa url={superAlvo.capa_url} titulo={superAlvo.nome} className="size-14" />
              <div className="min-w-0">
                <p className="truncate font-bold">{superAlvo.nome}</p>
                <p className="truncate text-sm text-muted">{superAlvo.artistas}</p>
              </div>
            </div>
            <p className="text-sm text-muted">
              Pague via Pix e sua música <strong className="text-gold">toca antes de todas as outras</strong> — passa na frente até das mais votadas.
              Se mais gente mandar super chat, vale a ordem de pagamento.
            </p>
            <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/10 px-4 py-3">
              <span className="text-sm font-semibold text-gold">Valor</span>
              <span className="text-xl font-extrabold text-gold">{reais(bar.superchat_valor_centavos)}</span>
            </div>
            <Botao variante="ouro" className="w-full" tamanho="lg" onClick={gerarPix}><Zap className="size-5" /> Gerar Pix</Botao>
          </div>
        )}
      </Folha>

      <PixFolha
        pix={pix} consultar={consultarPix} onFechar={() => setPix(null)} simulavel={modo?.pix === 'mock'}
        onPago={() => { void recarregar(); setAba('fila'); }}
        dica="Sua música está no topo da fila e toca assim que a atual terminar."
      />

      <Folha aberta={perfilAberto} onFechar={() => setPerfilAberto(false)} titulo="Seu apelido">
        <ApelidoForm onSalvo={() => { setPerfilAberto(false); msg('ok', 'Apelido salvo. Vale para os próximos pedidos.'); }} />
      </Folha>
    </div>
  );
}

function ApelidoForm({ onSalvo }: { onSalvo: () => void }) {
  const [v, setV] = useState(apelido());
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvarApelido(v); onSalvo(); }}>
      <p className="text-sm text-muted">Aparece ao lado das músicas que você pedir. Opcional.</p>
      <Input value={v} maxLength={24} onChange={(e) => setV(e.target.value)} placeholder="Ex.: Mesa 12" aria-label="Apelido" />
      <Botao className="w-full">Salvar</Botao>
    </form>
  );
}

function Portaria({ gate }: { gate: { entrando: boolean; erro: string | null; entrar: (v: 'qr' | 'gps') => void; temQr: boolean }; raio?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface p-6 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-elevated text-brand">
        {gate.temQr ? <QrCode className="size-7" /> : <MapPin className="size-7" />}
      </div>
      <h2 className="text-lg font-bold">{gate.temQr ? 'Entrando pelo QR Code…' : 'Confirme que você está no bar'}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
        {gate.temQr
          ? 'Só um instante.'
          : 'Para votar e pedir músicas, ative o GPS. Se preferir, leia o QR Code da mesa e entre sem localização.'}
      </p>
      {gate.erro && <div className="mt-4 text-left"><Aviso tipo="erro">{gate.erro}</Aviso></div>}
      <div className="mt-5 flex flex-col items-center gap-2">
        <Botao onClick={() => gate.entrar(gate.temQr ? 'qr' : 'gps')} carregando={gate.entrando} tamanho="lg">
          {gate.temQr ? 'Tentar novamente' : 'Ativar GPS e entrar'}
        </Botao>
        <p className="text-xs text-faint">Você ainda pode ver a fila e o que está tocando sem entrar.</p>
      </div>
    </div>
  );
}

function Tocando({ estado, skewMs }: { estado: EstadoSala; skewMs: number }) {
  const t = estado.tocando;
  const prog = useProgresso(t, skewMs);
  const pct = t ? Math.min(100, (prog / t.duracao_ms) * 100) : 0;
  return (
    <section className="lg:sticky lg:top-20 lg:self-start" aria-label="Tocando agora">
      <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-elevated to-surface p-4 sm:p-5">
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
          {t?.tocando ? <Equalizador /> : <span className="size-2 rounded-full bg-faint" />}
          {t ? (t.tocando ? 'Tocando agora' : 'Pausado') : 'Aguardando música'}
        </p>
        {t ? (
          <div className="flex items-center gap-4 lg:flex-col lg:items-stretch">
            <Capa url={t.capa_url} titulo={t.nome} className="size-24 !rounded-lg shadow-2xl sm:size-28 lg:size-auto lg:aspect-square" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold lg:text-2xl">{t.nome}</p>
              <p className="truncate text-sm text-muted">{t.artistas}</p>
              <div className="mt-3">
                <div className="h-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-white transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[0.7rem] tabular-nums text-faint">
                  <span>{tempo(prog)}</span>
                  <span>{tempo(t.duracao_ms)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-muted">
            <Sparkles className="mx-auto mb-2 size-8 text-faint" />
            <p className="font-semibold text-white">Nada tocando agora</p>
            <p className="text-sm">{estado.player_online ? 'Peça a primeira música!' : 'O player do bar está offline no momento.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Fila({ fila, onVotar, onEscolher }: { fila: ItemFila[]; onVotar: (f: ItemFila) => void; onEscolher: () => void }) {
  if (!fila.length)
    return (
      <Vazio icone={<ListMusic className="size-10" />} titulo="A fila está vazia">
        Seja o primeiro a escolher uma música.
        <span className="mt-4 block"><Botao onClick={onEscolher}><Plus className="size-4" /> Escolher música</Botao></span>
      </Vazio>
    );
  return (
    <ol className="space-y-1.5">
      {fila.map((f, i) => (
        <li key={f.id} className={`flex items-center gap-3 rounded-xl p-2.5 transition ${f.super ? 'bg-gold/10 ring-1 ring-gold/30' : f.status === 'enviada' ? 'bg-brand/10 ring-1 ring-brand/30' : 'hover:bg-surface'}`}>
          <span className="w-5 text-center text-sm tabular-nums text-faint">{i + 1}</span>
          <Capa url={f.capa_url} titulo={f.nome} className="size-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{f.nome}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              {f.super && <span className="inline-flex items-center gap-0.5 font-bold text-gold"><Crown className="size-3" /> Super chat</span>}
              {f.status === 'enviada' && !f.super && <span className="font-bold text-brand">Próxima</span>}
              <span className="truncate">{f.artistas}{f.solicitante_apelido ? ` · ${f.solicitante_apelido}` : ''}</span>
            </p>
          </div>
          {f.status === 'enviada' ? (
            <span className="px-2 text-xs font-semibold text-muted">{f.votos} voto{f.votos === 1 ? '' : 's'}</span>
          ) : (
            <button
              onClick={() => onVotar(f)} aria-pressed={f.meu_voto} aria-label={f.meu_voto ? `Remover voto em ${f.nome}` : `Votar em ${f.nome}`}
              className={`flex h-10 min-w-14 items-center justify-center gap-1 rounded-full px-3 text-sm font-bold transition active:scale-95 ${f.meu_voto ? 'bg-brand text-black' : 'bg-elevated text-white hover:bg-hover'}`}
            >
              <ArrowUp className="size-4" /> {f.votos}
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function Catalogo({
  slug, token, estilos, superchat, valorSuper, onPedir, onSuper, aoErro, versao,
}: {
  slug: string; token: string; estilos: string[]; superchat: boolean; valorSuper: number;
  onPedir: (m: MusicaCatalogo) => void; onSuper: (m: MusicaCatalogo) => void; aoErro: (e: unknown) => void; versao: number;
}) {
  const [termo, setTermo] = useState('');
  const [estilo, setEstilo] = useState<string | null>(null);
  const [itens, setItens] = useState<MusicaCatalogo[] | null>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (termo.trim()) p.set('q', termo.trim());
    if (estilo) p.set('estilo', estilo);
    const t = setTimeout(() => {
      api<MusicaCatalogo[]>('GET', `/api/public/bares/${slug}/catalogo?${p}`, undefined, token).then(setItens, aoErro);
    }, 200);
    return () => clearTimeout(t);
  }, [termo, estilo, slug, token, versao]); // eslint-disable-line react-hooks/exhaustive-deps

  const textoSituacao = useMemo(() => ({ pendente: 'Na fila', enviada: 'É a próxima', tocando: 'Tocando' }), []);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar música ou artista" className="!pl-9" aria-label="Buscar música" />
      </div>
      {estilos.length > 0 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip ativo={!estilo} onClick={() => setEstilo(null)}>Todos</Chip>
          {estilos.map((e) => <Chip key={e} ativo={estilo === e} onClick={() => setEstilo(estilo === e ? null : e)}>{e}</Chip>)}
        </div>
      )}
      <div className="mt-3">
        {itens === null ? (
          <div className="py-10 text-center text-sm text-muted">Carregando catálogo…</div>
        ) : itens.length === 0 ? (
          <Vazio icone={<Search className="size-9" />} titulo="Nenhuma música encontrada">Só tocam aqui as músicas do estilo do bar. Tente outra busca.</Vazio>
        ) : (
          <ul className="space-y-1.5">
            {itens.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-surface">
                <Capa url={m.capa_url} titulo={m.nome} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.nome}</p>
                  <p className="truncate text-xs text-muted">{m.artistas} · {m.estilo}</p>
                </div>
                {m.na_fila === 'tocando' || m.na_fila === 'enviada' ? (
                  <Chip tom="ok">{textoSituacao[m.na_fila]}</Chip>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {superchat && (
                      <button
                        onClick={() => onSuper(m)} title={`Super chat ${reais(valorSuper)}`} aria-label={`Super chat em ${m.nome}`}
                        className="grid size-10 place-items-center rounded-full bg-gold/15 text-gold transition hover:bg-gold/25 active:scale-95"
                      ><Zap className="size-4" /></button>
                    )}
                    <button
                      onClick={() => onPedir(m)}
                      className={`flex h-10 items-center gap-1 rounded-full px-4 text-sm font-bold transition active:scale-95 ${m.na_fila === 'pendente' ? 'bg-elevated text-white hover:bg-hover' : 'bg-brand text-black hover:bg-brand-hover'}`}
                    >
                      {m.na_fila === 'pendente' ? <><ArrowUp className="size-4" /> Votar</> : <><Plus className="size-4" /> Pedir</>}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
