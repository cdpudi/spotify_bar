import { ChevronRight, Lock, MapPin, Music2, Navigation, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Aviso, Botao, Capa, Chip, Equalizador, Logo, Vazio } from '../components/ui';
import { api, mensagemErro } from '../lib/api';
import { distancia } from '../lib/format';
import { posicaoAtual } from '../lib/publico';

interface BarProximo {
  slug: string;
  nome: string;
  bairro: string | null;
  cidade: string;
  uf: string;
  estilos: string[];
  distancia_m: number;
  dentro_do_raio: boolean;
  tocando: { nome: string; artistas: string; capa_url: string | null } | null;
}

export default function Home() {
  const nav = useNavigate();
  const [etapa, setEtapa] = useState<'inicio' | 'buscando' | 'lista'>('inicio');
  const [bares, setBares] = useState<BarProximo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function localizar() {
    setErro(null);
    setEtapa('buscando');
    try {
      const pos = await posicaoAtual();
      const { latitude, longitude } = pos.coords;
      setBares(await api('GET', `/api/public/bares/proximos?lat=${latitude}&lng=${longitude}&km=10`));
      setEtapa('lista');
    } catch (e) {
      setErro(mensagemErro(e));
      setEtapa('inicio');
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 pb-10 safe-b">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-lg" />
        <Link to="/admin" className="text-sm font-semibold text-muted hover:text-white">
          Sou dono de bar
        </Link>
      </header>

      {etapa !== 'lista' && (
        <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-b from-brand/25 via-surface to-surface px-6 pb-8 pt-10 text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-brand text-black shadow-[0_0_60px_-10px_var(--color-brand)]">
            <Music2 className="size-8" />
          </div>
          <h1 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">A playlist do bar é de todo mundo</h1>
          <p className="mx-auto mt-3 max-w-md text-balance text-muted">
            Escolha a música, vote nas dos outros e, se quiser furar a fila, mande um super chat via Pix.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3">
            <Botao tamanho="lg" onClick={localizar} carregando={etapa === 'buscando'}>
              <Navigation className="size-5" />
              {etapa === 'buscando' ? 'Procurando bares…' : 'Encontrar bares perto de mim'}
            </Botao>
            <p className="text-xs text-faint">Vamos pedir acesso ao GPS só para listar os bares ao seu redor.</p>
          </div>
          {erro && (
            <div className="mt-5 text-left">
              <Aviso tipo="erro">{erro}</Aviso>
            </div>
          )}
        </section>
      )}

      {etapa === 'inicio' && (
        <section className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
          {[
            ['1', 'Ative o GPS', 'Mostramos os bares onde você está.'],
            ['2', 'Escolha o bar', 'Ou leia o QR Code da mesa e entre direto.'],
            ['3', 'Vote e peça', 'A música mais votada toca primeiro.'],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-xl bg-surface p-4">
              <span className="mb-2 grid size-7 place-items-center rounded-full bg-elevated text-xs font-bold text-brand">{n}</span>
              <p className="font-semibold">{t}</p>
              <p className="mt-0.5 text-muted">{d}</p>
            </div>
          ))}
        </section>
      )}

      {etapa === 'lista' && (
        <section className="mt-2">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-extrabold">Bares perto de você</h1>
            <Botao variante="fantasma" tamanho="sm" onClick={localizar}>
              <RefreshCw className="size-4" /> Atualizar
            </Botao>
          </div>
          {bares.length === 0 ? (
            <Vazio icone={<MapPin className="size-10" />} titulo="Nenhum bar por aqui ainda">
              Não encontramos bares parceiros num raio de 10 km. Se você está em um, leia o QR Code da mesa.
            </Vazio>
          ) : (
            <ul className="space-y-3">
              {bares.map((b) => (
                <li key={b.slug}>
                  <button
                    onClick={() => nav(`/b/${b.slug}`)}
                    className="group flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left transition hover:bg-elevated"
                  >
                    <Capa url={b.tocando?.capa_url} titulo={b.tocando?.nome ?? b.nome} className="size-16" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-bold">{b.nome}</p>
                        {b.dentro_do_raio ? <Chip tom="ok">Você está aqui</Chip> : <Lock className="size-3.5 shrink-0 text-faint" aria-label="Fora do alcance" />}
                      </div>
                      <p className="truncate text-xs text-muted">
                        {distancia(b.distancia_m)} · {b.bairro ? `${b.bairro}, ` : ''}
                        {b.cidade}
                      </p>
                      {b.tocando ? (
                        <p className="mt-1 flex items-center gap-2 truncate text-xs text-brand">
                          <Equalizador /> <span className="truncate">{b.tocando.nome} — {b.tocando.artistas}</span>
                        </p>
                      ) : (
                        <p className="mt-1 truncate text-xs text-faint">{b.estilos.slice(0, 3).join(' · ') || 'Sem música agora'}</p>
                      )}
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 text-center text-xs text-faint">Para votar e pedir músicas é preciso estar no bar. Fora do alcance? Leia o QR Code do local.</p>
        </section>
      )}
    </div>
  );
}
