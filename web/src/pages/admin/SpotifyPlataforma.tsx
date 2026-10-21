import { AlertTriangle, Disc3, KeyRound, Link2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Aviso, Botao, Campo, Cartao, Chip, Folha, Input, Select } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface AppSpotify { id: string; nome: string; client_id: string; limite_usuarios: number; ativo: boolean; usados: number; livres: number }
interface Conta {
  id: string; nome: string; email: string | null; produto: string | null; plano_spotify: 'individual' | 'duo' | 'familia'; grupo_familia: string | null;
  app_id: string | null; app_nome: string | null; bar_id: string | null; bar_nome: string | null; spotify_device_nome: string | null;
}
interface Dados {
  modo: 'mock' | 'real';
  contas: Conta[];
  apps: AppSpotify[];
  capacidade: { contas: number; em_uso: number; livres: number; lugares_livres_nos_apps: number };
}

const PLANOS = { individual: 'Individual', duo: 'Duo', familia: 'Família' } as const;

/** Gestão de aplicativos Spotify (Client ID/Secret), contas conectadas e capacidade da plataforma. */
export default function SpotifyPlataforma() {
  const { req } = useAuth();
  const [busca, setBusca] = useSearchParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);
  const [editandoApp, setEditandoApp] = useState<AppSpotify | 'novo' | null>(null);
  const [conectando, setConectando] = useState(false);
  const [editandoConta, setEditandoConta] = useState<Conta | null>(null);

  const carregar = useCallback(async () => {
    const [c] = await Promise.all([req<Dados>('GET', '/api/spotify/contas')]);
    setDados(c);
  }, [req]);

  useEffect(() => {
    void carregar();
    if (busca.get('conectado')) setMsg({ tipo: 'ok', texto: 'Conta Spotify conectada! Ela já pode ser escolhida na tela Spotify de um bar.' });
    if (busca.get('erro')) setMsg({ tipo: 'erro', texto: busca.get('erro')! });
    if (busca.size) setBusca({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function removerConta(c: Conta) {
    if (!confirm(`Remover a conta "${c.nome}"? ${c.bar_nome ? `Ela atende "${c.bar_nome}", que ficará sem player.` : ''}`)) return;
    await req('DELETE', `/api/spotify/contas/${c.id}`);
    await carregar();
  }

  async function removerApp(a: AppSpotify) {
    if (!confirm(`Excluir o aplicativo "${a.nome}"?`)) return;
    try {
      await req('DELETE', `/api/spotify/apps/${a.id}`);
      await carregar();
    } catch (e) {
      setMsg({ tipo: 'erro', texto: mensagemErro(e) });
    }
  }

  async function alternarApp(a: AppSpotify) {
    await req('PATCH', `/api/spotify/apps/${a.id}`, { ativo: !a.ativo });
    await carregar();
  }

  const cap = dados?.capacidade;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Spotify da plataforma</h1>
        <p className="text-sm text-muted">Aplicativos (Client ID/Secret), contas Premium e a capacidade de bares simultâneos.</p>
      </div>
      {dados?.modo === 'mock' && <Aviso tipo="ouro">Modo demonstração: o servidor usa um Spotify simulado.</Aviso>}
      {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}

      {cap && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cartao><p className="text-xs font-semibold text-muted">Contas conectadas</p><p className="mt-1 text-2xl font-extrabold">{cap.contas}</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Em uso por bares</p><p className="mt-1 text-2xl font-extrabold text-brand">{cap.em_uso}</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Contas livres</p><p className="mt-1 text-2xl font-extrabold">{cap.livres}</p><p className="text-xs text-muted">podem atender novos bares</p></Cartao>
          <Cartao><p className="text-xs font-semibold text-muted">Lugares livres nos apps</p><p className="mt-1 text-2xl font-extrabold">{cap.lugares_livres_nos_apps}</p><p className="text-xs text-muted">para conectar novas contas</p></Cartao>
        </div>
      )}

      {/* ---- Aplicativos ---- */}
      <Cartao className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><KeyRound className="size-4 text-muted" /> Aplicativos Spotify</h2>
            <p className="text-xs text-muted">Cada app tem um limite de contas (User Management, no Developer Dashboard). Cadastre outro quando um encher.</p>
          </div>
          <Botao tamanho="sm" onClick={() => setEditandoApp('novo')}><Plus className="size-4" /> Novo aplicativo</Botao>
        </div>
        {!dados ? <p className="text-sm text-muted">Carregando…</p> : dados.apps.length === 0 ? (
          <p className="text-sm text-muted">Nenhum aplicativo cadastrado. Cadastre o Client ID e o Secret do seu app no Spotify.</p>
        ) : (
          <ul className="space-y-2">
            {dados.apps.map((a) => {
              const cheio = a.usados >= a.limite_usuarios;
              return (
                <li key={a.id} className={`rounded-lg bg-elevated/60 p-3 ${a.ativo ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{a.nome} {!a.ativo && <Chip tom="erro">Inativo</Chip>} {cheio && a.ativo && <Chip tom="ouro">Lotado</Chip>}</p>
                      <p className="truncate font-mono text-xs text-muted">{a.client_id}</p>
                    </div>
                    <div className="w-40">
                      <p className="flex items-center justify-between text-xs text-muted"><span>Lugares</span><b className="text-white">{a.usados}/{a.limite_usuarios}</b></p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hover"><div className={`h-full ${cheio ? 'bg-gold' : 'bg-brand'}`} style={{ width: `${Math.min(100, (a.usados / a.limite_usuarios) * 100)}%` }} /></div>
                    </div>
                    <div className="flex gap-1">
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setEditandoApp(a)} aria-label={`Editar ${a.nome}`}><Pencil className="size-4" /></Botao>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => alternarApp(a)}>{a.ativo ? 'Desativar' : 'Ativar'}</Botao>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => removerApp(a)} aria-label={`Excluir ${a.nome}`}><Trash2 className="size-4" /></Botao>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      {/* ---- Contas ---- */}
      <Cartao className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold"><Disc3 className="size-4 text-muted" /> Contas Premium</h2>
            <p className="text-xs text-muted">Cada conta toca em um único aparelho por vez, então atende um bar só. Use contas dedicadas.</p>
          </div>
          <Botao tamanho="sm" onClick={() => setConectando(true)} disabled={!dados}><Plus className="size-4" /> Conectar conta</Botao>
        </div>
        {dados && dados.contas.length === 0 && <p className="text-sm text-muted">Nenhuma conta conectada ainda.</p>}
        <ul className="space-y-2">
          {dados?.contas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-elevated/60 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand"><Disc3 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {c.nome}
                  <Chip>{PLANOS[c.plano_spotify]}{c.plano_spotify === 'familia' && c.grupo_familia ? ` · ${c.grupo_familia}` : ''}</Chip>
                </p>
                <p className="truncate text-xs text-muted">{c.email ?? 'sem e-mail'} · app: {c.app_nome ?? 'não vinculado'}</p>
              </div>
              {c.bar_nome ? <Chip tom="ok"><Link2 className="size-3" /> {c.bar_nome}</Chip> : <Chip>Livre</Chip>}
              <div className="flex gap-1">
                <Botao tamanho="sm" variante="fantasma" onClick={() => setEditandoConta(c)} aria-label={`Editar ${c.nome}`}><Pencil className="size-4" /></Botao>
                <Botao tamanho="sm" variante="fantasma" onClick={() => removerConta(c)} aria-label={`Remover ${c.nome}`}><Trash2 className="size-4" /></Botao>
              </div>
            </li>
          ))}
        </ul>
        {dados?.contas.some((c) => !c.app_id) && dados.modo === 'real' && (
          <Aviso tipo="ouro">Há contas sem aplicativo vinculado — elas usam as credenciais do ambiente do servidor.</Aviso>
        )}
      </Cartao>

      <Cartao className="space-y-2 text-sm text-muted">
        <p className="flex items-center gap-2 font-bold text-white"><AlertTriangle className="size-4 text-gold" /> Antes de conectar uma conta nova</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Cadastre o <b className="text-white">nome e o e-mail</b> da conta em <b className="text-white">User Management</b> do aplicativo no Developer Dashboard do Spotify (não há como automatizar).</li>
          <li><b className="text-white">Individual:</b> uma reprodução por vez. <b className="text-white">Família/Duo:</b> cada membro é uma conta separada, com reprodução própria — conecte cada membro como uma conta.</li>
          <li>Planos pessoais do Spotify não preveem uso público em estabelecimentos. Avalie a licença antes de operar comercialmente.</li>
        </ul>
        <p className="flex items-center gap-2"><Users className="size-4" /> Dica: crie um app novo no Dashboard quando o atual estiver lotado e cadastre-o acima.</p>
      </Cartao>

      <FormApp alvo={editandoApp} onFechar={() => setEditandoApp(null)} onSalvo={() => { setEditandoApp(null); void carregar(); }} />
      <FormConectar aberto={conectando} apps={dados?.apps ?? []} onFechar={() => setConectando(false)} onErro={(t) => setMsg({ tipo: 'erro', texto: t })} />
      <FormConta conta={editandoConta} onFechar={() => setEditandoConta(null)} onSalvo={() => { setEditandoConta(null); void carregar(); }} />
    </div>
  );
}

function FormApp({ alvo, onFechar, onSalvo }: { alvo: AppSpotify | 'novo' | null; onFechar: () => void; onSalvo: () => void }) {
  const { req } = useAuth();
  const edit = alvo && alvo !== 'novo' ? alvo : null;
  const [f, setF] = useState({ nome: '', client_id: '', client_secret: '', limite_usuarios: 5 });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!alvo) return;
    setErro(null);
    setF(edit ? { nome: edit.nome, client_id: edit.client_id, client_secret: '', limite_usuarios: edit.limite_usuarios } : { nome: '', client_id: '', client_secret: '', limite_usuarios: 5 });
  }, [alvo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      if (edit) await req('PATCH', `/api/spotify/apps/${edit.id}`, { nome: f.nome, limite_usuarios: Number(f.limite_usuarios), client_secret: f.client_secret || undefined });
      else await req('POST', '/api/spotify/apps', { ...f, limite_usuarios: Number(f.limite_usuarios) });
      onSalvo();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Folha aberta={!!alvo} onFechar={onFechar} titulo={edit ? `Editar ${edit.nome}` : 'Novo aplicativo Spotify'}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome interno"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} placeholder="Ex.: App 2" /></Campo>
        <Campo rotulo="Client ID"><Input value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required disabled={!!edit} className="font-mono" autoComplete="off" /></Campo>
        <Campo rotulo="Client Secret" dica={edit ? 'Deixe em branco para manter o atual. Fica cifrado e nunca é exibido.' : 'Fica cifrado no banco e nunca é exibido depois de salvo.'}>
          <Input type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} required={!edit} className="font-mono" autoComplete="off" />
        </Campo>
        <Campo rotulo="Lugares (usuários) do app" dica="Quantas contas esse app aceita no User Management do Dashboard"><Input type="number" min={1} max={1000} value={f.limite_usuarios} onChange={(e) => setF({ ...f, limite_usuarios: Number(e.target.value) })} /></Campo>
        <Aviso tipo="info">No app do Dashboard, cadastre o Redirect URI: <code className="break-all">{window.location.origin.replace('localhost', '127.0.0.1').replace(':5175', ':3002')}/api/spotify/callback</code> (em produção: o endereço do site + <code>/api/spotify/callback</code>).</Aviso>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <Botao className="w-full" carregando={salvando}>{edit ? 'Salvar' : 'Validar e cadastrar'}</Botao>
      </form>
    </Folha>
  );
}

function FormConectar({ aberto, apps, onFechar, onErro }: { aberto: boolean; apps: AppSpotify[]; onFechar: () => void; onErro: (t: string) => void }) {
  const { req } = useAuth();
  const [appId, setAppId] = useState('');
  const [plano, setPlano] = useState<keyof typeof PLANOS>('individual');
  const [grupo, setGrupo] = useState('');
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setAppId(apps.find((a) => a.ativo && a.livres > 0)?.id ?? '');
    setPlano('individual');
    setGrupo('');
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ir(e: React.FormEvent) {
    e.preventDefault();
    setIndo(true);
    try {
      const p = new URLSearchParams({ retorno: window.location.origin, plano_spotify: plano });
      if (appId) p.set('app_id', appId);
      if (plano === 'familia' && grupo) p.set('grupo_familia', grupo);
      const { url } = await req('GET', `/api/spotify/conectar?${p}`);
      window.location.href = url;
    } catch (err) {
      onErro(mensagemErro(err));
      onFechar();
    } finally {
      setIndo(false);
    }
  }

  return (
    <Folha aberta={aberto} onFechar={onFechar} titulo="Conectar conta Spotify">
      <form onSubmit={ir} className="space-y-4">
        <Campo rotulo="Aplicativo" dica="Cada conta ocupa um lugar no aplicativo escolhido">
          <Select value={appId} onChange={(e) => setAppId(e.target.value)}>
            {apps.length === 0 && <option value="">Modo simulado (sem aplicativo)</option>}
            {apps.map((a) => <option key={a.id} value={a.id} disabled={!a.ativo || a.livres === 0}>{a.nome} — {a.usados}/{a.limite_usuarios} lugares{!a.ativo ? ' (inativo)' : a.livres === 0 ? ' (lotado)' : ''}</option>)}
          </Select>
        </Campo>
        <Campo rotulo="Plano Spotify da conta">
          <Select value={plano} onChange={(e) => setPlano(e.target.value as keyof typeof PLANOS)}>{Object.entries(PLANOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </Campo>
        {plano === 'familia' && <Campo rotulo="Nome do grupo Família" dica="Só para organizar (ex.: Família Silva)"><Input value={grupo} onChange={(e) => setGrupo(e.target.value)} maxLength={60} /></Campo>}
        <Aviso tipo="ouro">Antes: cadastre o e-mail da conta em <b>User Management</b> do aplicativo, no Developer Dashboard. Sem isso o Spotify recusa o login.</Aviso>
        <Botao className="w-full" carregando={indo}>Continuar no Spotify</Botao>
      </form>
    </Folha>
  );
}

function FormConta({ conta, onFechar, onSalvo }: { conta: Conta | null; onFechar: () => void; onSalvo: () => void }) {
  const { req } = useAuth();
  const [plano, setPlano] = useState<keyof typeof PLANOS>('individual');
  const [grupo, setGrupo] = useState('');

  useEffect(() => {
    if (!conta) return;
    setPlano(conta.plano_spotify);
    setGrupo(conta.grupo_familia ?? '');
  }, [conta]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    await req('PATCH', `/api/spotify/contas/${conta!.id}`, { plano_spotify: plano, grupo_familia: plano === 'familia' ? grupo || null : null });
    onSalvo();
  }

  return (
    <Folha aberta={!!conta} onFechar={onFechar} titulo={`Conta ${conta?.nome ?? ''}`}>
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Plano Spotify"><Select value={plano} onChange={(e) => setPlano(e.target.value as keyof typeof PLANOS)}>{Object.entries(PLANOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Campo>
        {plano === 'familia' && <Campo rotulo="Grupo Família"><Input value={grupo} onChange={(e) => setGrupo(e.target.value)} maxLength={60} /></Campo>}
        <Botao className="w-full">Salvar</Botao>
      </form>
    </Folha>
  );
}
