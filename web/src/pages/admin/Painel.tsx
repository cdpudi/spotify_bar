import { AlertTriangle, Check, ExternalLink, Pause, Play, SkipForward, Trash2, Users, Crown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Aviso, Botao, Capa, Cartao, Equalizador, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { reais, tempo } from '../../lib/format';
import { useProgresso, type EstadoSala } from '../../lib/publico';
import { useBar } from './contexto';

interface EstadoPainel extends EstadoSala {
  erro_player: string | null;
  pagamentos_pendentes: { id: string; valor_centavos: number; criado_em: string; provider: string; nome: string | null; artistas: string | null }[];
}

export default function Painel() {
  const { req } = useAuth();
  const { bares, bar } = useBar();
  const [e, setE] = useState<EstadoPainel | null>(null);
  const [skew, setSkew] = useState(0);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [catalogoQtd, setCatalogoQtd] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    if (!bar) return;
    try {
      const r = await req<EstadoPainel>('GET', `/api/bares/${bar.id}/fila`);
      setSkew(new Date(r.agora).getTime() - Date.now());
      setE(r);
    } catch {
      /* mantém o último estado */
    }
  }, [bar?.id, req]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setE(null);
    if (!bar) return;
    void carregar();
    req('GET', `/api/bares/${bar.id}/catalogo`).then((c) => setCatalogoQtd(c.itens.length), () => undefined);
    const es = new EventSource(`/api/public/bares/${bar.slug}/stream`);
    es.addEventListener('estado', () => void carregar());
    const t = setInterval(() => void carregar(), 5000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, [bar?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const prog = useProgresso(e?.tocando ?? null, skew);

  if (bares && bares.length === 0) return <Navigate to="/admin/bar/novo" replace />;
  if (!bar) return null;

  const rodar = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) setMsg({ tipo: 'ok', texto: ok });
      await carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: mensagemErro(err) });
    }
  };
  const player = (acao: 'pausar' | 'retomar' | 'pular') => rodar(() => req('POST', `/api/bares/${bar.id}/player/${acao}`));

  const pendencias = [
    !bar.spotify_conta_id || !bar.spotify_device_id ? { texto: 'Conecte uma conta Spotify e escolha o dispositivo do bar.', para: '/admin/spotify' } : null,
    catalogoQtd === 0 ? { texto: 'Seu catálogo está vazio — ninguém consegue pedir música.', para: '/admin/catalogo' } : null,
    bar.plano_efetivo !== 'free' && bar.pix_provider === 'estatico' && !bar.pix_chave ? { texto: 'Cadastre a chave Pix para receber os super chats.', para: '/admin/pix' } : null,
  ].filter(Boolean) as { texto: string; para: string }[];

  const t = e?.tocando;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{bar.nome}</h1>
          <p className="text-sm text-muted">Painel ao vivo · atualiza sozinho</p>
        </div>
        <a href={`/b/${bar.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          Ver como cliente <ExternalLink className="size-4" />
        </a>
      </div>

      {pendencias.length > 0 && (
        <div className="space-y-2">
          {pendencias.map((p) => (
            <Link key={p.para} to={p.para} className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2.5 text-sm text-gold hover:bg-gold/15">
              <AlertTriangle className="size-4 shrink-0" /> {p.texto}
            </Link>
          ))}
        </div>
      )}
      {e?.erro_player && <Aviso tipo="erro">Player: {e.erro_player}</Aviso>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      <Cartao>
        <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
          {t?.tocando ? <Equalizador /> : null} Player · {bar.spotify_device_nome ?? 'sem dispositivo'}
          <span className={`ml-auto size-2 rounded-full ${e?.player_online ? 'bg-brand' : 'bg-danger'}`} title={e?.player_online ? 'Dispositivo online' : 'Dispositivo offline'} />
        </p>
        {t ? (
          <div className="flex items-center gap-4">
            <Capa url={t.capa_url} titulo={t.nome} className="size-20" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold">{t.nome}</p>
              <p className="truncate text-sm text-muted">{t.artistas}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover"><div className="h-full bg-white transition-[width] duration-500 ease-linear" style={{ width: `${Math.min(100, (prog / t.duracao_ms) * 100)}%` }} /></div>
              <p className="mt-1 text-[0.7rem] tabular-nums text-faint">{tempo(prog)} / {tempo(t.duracao_ms)}</p>
            </div>
          </div>
        ) : (
          <p className="py-3 text-sm text-muted">Nada tocando. Quando houver pedidos, o player inicia sozinho.</p>
        )}
        <div className="mt-4 flex gap-2">
          <Botao variante="secundario" onClick={() => player(t?.tocando ? 'pausar' : 'retomar')} disabled={!t}>
            {t?.tocando ? <><Pause className="size-4" /> Pausar</> : <><Play className="size-4" /> Retomar</>}
          </Botao>
          <Botao variante="secundario" onClick={() => player('pular')} disabled={!t}><SkipForward className="size-4" /> Pular</Botao>
        </div>
      </Cartao>

      {e && e.pagamentos_pendentes.length > 0 && (
        <Cartao className="space-y-3">
          <h2 className="font-bold">Super chats aguardando confirmação</h2>
          {e.pagamentos_pendentes.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg bg-elevated p-3">
              <Crown className="size-5 shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.nome ?? 'Música'} <span className="text-muted">— {p.artistas}</span></p>
                <p className="text-xs text-muted">{reais(p.valor_centavos)} · {p.provider === 'mercadopago' ? 'confirmação automática' : 'confira o extrato e confirme'}</p>
              </div>
              {p.provider !== 'mercadopago' && (
                <Botao tamanho="sm" onClick={() => rodar(() => req('POST', `/api/bares/${bar.id}/pagamentos/${p.id}/confirmar`), 'Pagamento confirmado — a música subiu na fila.')}>
                  <Check className="size-4" /> Recebi
                </Botao>
              )}
            </div>
          ))}
        </Cartao>
      )}

      <Cartao>
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Users className="size-4 text-muted" /> Fila ({e?.fila.length ?? 0})</h2>
        {!e ? <p className="text-sm text-muted">Carregando…</p> : e.fila.length === 0 ? (
          <Vazio titulo="Fila vazia">Os pedidos dos clientes aparecem aqui em tempo real.</Vazio>
        ) : (
          <ol className="space-y-1">
            {e.fila.map((f, i) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-elevated">
                <span className="w-5 text-center text-sm text-faint">{i + 1}</span>
                <Capa url={f.capa_url} titulo={f.nome} className="size-10" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{f.nome}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                    {f.super && <span className="inline-flex shrink-0 items-center gap-0.5 font-bold text-gold"><Crown className="size-3" /> Super</span>}
                    {f.status === 'enviada' && <span className="shrink-0 font-bold text-brand">Próxima</span>}
                    <span className="truncate">{f.artistas}{f.solicitante_apelido ? ` · ${f.solicitante_apelido}` : ''}</span>
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs tabular-nums text-muted" title="Votos">
                  {f.votos}<span className="hidden sm:inline"> voto{f.votos === 1 ? '' : 's'}</span><span className="sm:hidden"> ♥</span>
                </span>
                <button onClick={() => rodar(() => req('DELETE', `/api/bares/${bar.id}/fila/${f.id}`), 'Música removida da fila.')} className="grid size-8 place-items-center rounded-full text-faint hover:bg-danger/10 hover:text-danger" aria-label={`Remover ${f.nome}`}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </div>
  );
}
