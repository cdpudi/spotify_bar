import { BarChart3, Crown, Music2, Users, ThumbsUp, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Capa, Cartao, Input, Select, Vazio } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBar } from './contexto';

interface Resposta {
  resumo: { pedidos: number; tocadas: number; superchats: number; votos: number; participantes: number };
  top: { spotify_track_id: string; nome: string; artistas: string; capa_url: string | null; pedidos: number; tocadas: number; superchats: number; votos: number }[];
  por_bar: { id: string; nome: string; pedidos: number; tocadas: number }[];
  por_dia: { dia: string; pedidos: number }[];
}

/** Quantidade de músicas pedidas e as mais pedidas — do bar selecionado ou de toda a plataforma (admin). */
export default function EstatisticasPagina({ plataforma }: { plataforma?: boolean }) {
  const { req } = useAuth();
  const { bar, bares } = useBar();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [barFiltro, setBarFiltro] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!plataforma && !bar) return;
    const p = new URLSearchParams();
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    try {
      if (plataforma) {
        if (barFiltro) p.set('bar_id', barFiltro);
        setDados(await req('GET', `/api/admin/estatisticas?${p}`));
      } else {
        setDados(await req('GET', `/api/bares/${bar!.id}/estatisticas?${p}`));
      }
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }, [req, plataforma, bar?.id, de, ate, barFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void carregar(); }, [carregar]);

  const maxTop = Math.max(1, ...(dados?.top.map((t) => t.pedidos) ?? [1]));
  const maxDia = Math.max(1, ...(dados?.por_dia.map((d) => d.pedidos) ?? [1]));
  const cards = dados && [
    { rotulo: 'Músicas pedidas', valor: dados.resumo.pedidos, Icone: Music2 },
    { rotulo: 'Já tocadas', valor: dados.resumo.tocadas, Icone: BarChart3 },
    { rotulo: 'Super chats', valor: dados.resumo.superchats, Icone: Zap },
    { rotulo: 'Votos', valor: dados.resumo.votos, Icone: ThumbsUp },
    { rotulo: 'Participantes', valor: dados.resumo.participantes, Icone: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Estatísticas{plataforma ? ' da plataforma' : ''}</h1>
        <p className="text-sm text-muted">{plataforma ? 'Pedidos de música em todos os bares.' : `Pedidos de música em ${bar?.nome ?? 'seu bar'}.`}</p>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao className="grid gap-3 sm:grid-cols-3">
        {plataforma && (
          <Select value={barFiltro} onChange={(e) => setBarFiltro(e.target.value)} aria-label="Bar">
            <option value="">Todos os bares</option>
            {bares?.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </Select>
        )}
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">De <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">Até <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
      </Cartao>

      {!dados ? <p className="text-muted">Carregando…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {cards!.map(({ rotulo, valor, Icone }) => (
              <Cartao key={rotulo}><Icone className="mb-2 size-4 text-brand" /><p className="text-2xl font-extrabold tabular-nums">{valor}</p><p className="text-xs text-muted">{rotulo}</p></Cartao>
            ))}
          </div>

          <Cartao className="space-y-3">
            <h2 className="font-bold">Músicas mais pedidas</h2>
            {dados.top.length === 0 ? <Vazio icone={<Music2 className="size-9" />} titulo="Ainda sem pedidos no período" /> : (
              <ol className="space-y-2">
                {dados.top.map((t, i) => (
                  <li key={t.spotify_track_id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-sm tabular-nums text-faint">{i + 1}</span>
                    <Capa url={t.capa_url} titulo={t.nome} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">{t.nome}{t.superchats > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-gold"><Crown className="size-3" />{t.superchats}</span>}</p>
                      <p className="truncate text-xs text-muted">{t.artistas} · {t.votos} voto{t.votos === 1 ? '' : 's'} · {t.tocadas} tocada{t.tocadas === 1 ? '' : 's'}</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full bg-brand" style={{ width: `${(t.pedidos / maxTop) * 100}%` }} /></div>
                    </div>
                    <span className="w-10 text-right text-sm font-bold tabular-nums">{t.pedidos}×</span>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>

          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao className="space-y-3">
              <h2 className="font-bold">Pedidos por dia</h2>
              {dados.por_dia.length === 0 ? <p className="text-sm text-muted">Sem dados.</p> : (
                <div className="flex h-32 items-end gap-1" role="img" aria-label="Gráfico de pedidos por dia">
                  {dados.por_dia.map((d) => (
                    <div key={d.dia} className="group relative flex flex-1 flex-col justify-end" title={`${d.dia.split('-').reverse().join('/')}: ${d.pedidos}`}>
                      <div className="w-full rounded-t bg-brand/80 transition group-hover:bg-brand" style={{ height: `${Math.max(4, (d.pedidos / maxDia) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              )}
              {dados.por_dia.length > 0 && <p className="flex justify-between text-[0.7rem] text-faint"><span>{dados.por_dia[0].dia.split('-').reverse().join('/')}</span><span>{dados.por_dia.at(-1)!.dia.split('-').reverse().join('/')}</span></p>}
            </Cartao>
            {plataforma && !barFiltro && (
              <Cartao className="space-y-2">
                <h2 className="font-bold">Por bar</h2>
                {dados.por_bar.length === 0 ? <p className="text-sm text-muted">Sem dados.</p> : (
                  <ul className="space-y-1.5 text-sm">
                    {dados.por_bar.map((b) => <li key={b.id} className="flex justify-between gap-3"><span className="truncate">{b.nome}</span><span className="shrink-0 tabular-nums text-muted"><b className="text-white">{b.pedidos}</b> pedidos · {b.tocadas} tocadas</span></li>)}
                  </ul>
                )}
              </Cartao>
            )}
          </div>
        </>
      )}
    </div>
  );
}
