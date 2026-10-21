import { KeyRound, ShieldCheck, UserPlus, UserRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Aviso, Botao, Campo, Cartao, Chip, Folha, Input, Select } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface Usuario { id: string; nome: string; email: string; papel: 'admin' | 'dono'; ativo: boolean; bares: number }

/** Responsáveis pelos bares (donos) e administradores da plataforma. */
export default function UsuariosPagina() {
  const { req, usuario: eu } = useAuth();
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);
  const [f, setF] = useState({ nome: '', email: '', senha: '', papel: 'dono' });
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => setLista(await req('GET', '/api/admin/usuarios')), [req]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await req('POST', '/api/admin/usuarios', f);
      setNovo(false);
      setF({ nome: '', email: '', senha: '', papel: 'dono' });
      setMsg('Usuário criado. Informe e-mail e senha ao responsável e cadastre o bar dele.');
      await carregar();
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  async function alternar(u: Usuario) {
    try {
      await req('PATCH', `/api/admin/usuarios/${u.id}`, { ativo: !u.ativo });
      await carregar();
    } catch (err) {
      setMsg(mensagemErro(err));
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!senhaDe) return;
    try {
      await req('PATCH', `/api/admin/usuarios/${senhaDe.id}`, { senha: novaSenha });
      setSenhaDe(null);
      setNovaSenha('');
      setMsg('Senha alterada.');
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Responsáveis</h1>
          <p className="text-sm text-muted">Quem acessa o painel. O responsável edita só o catálogo do bar; o resto é com o administrador.</p>
        </div>
        <Botao onClick={() => { setErro(null); setNovo(true); }}><UserPlus className="size-4" /> Novo responsável</Botao>
      </div>
      {msg && <Aviso tipo="ok">{msg}</Aviso>}

      {!lista ? <p className="text-muted">Carregando…</p> : (
        <ul className="space-y-2">
          {lista.map((u) => (
            <li key={u.id}>
              <Cartao className="flex flex-wrap items-center gap-3 !p-3">
                <span className="grid size-10 place-items-center rounded-full bg-elevated text-muted">{u.papel === 'admin' ? <ShieldCheck className="size-5 text-brand" /> : <UserRound className="size-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">{u.nome} {u.papel === 'admin' ? <Chip tom="ok">Administrador</Chip> : <Chip>Responsável · {u.bares} bar{u.bares === 1 ? '' : 'es'}</Chip>}{!u.ativo && <Chip tom="erro">Desativado</Chip>}</p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                </div>
                <Botao tamanho="sm" variante="fantasma" onClick={() => { setErro(null); setSenhaDe(u); }}><KeyRound className="size-4" /> Nova senha</Botao>
                {u.id !== eu?.id && <Botao tamanho="sm" variante={u.ativo ? 'perigo' : 'secundario'} onClick={() => alternar(u)}>{u.ativo ? 'Desativar' : 'Reativar'}</Botao>}
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      <Folha aberta={novo} onFechar={() => setNovo(false)} titulo="Novo responsável">
        <form onSubmit={criar} className="space-y-4">
          <Campo rotulo="Nome"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></Campo>
          <Campo rotulo="E-mail (será o login)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Campo>
          <Campo rotulo="Senha inicial" dica="Mínimo de 8 caracteres"><Input type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} autoComplete="new-password" /></Campo>
          <Campo rotulo="Perfil"><Select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}><option value="dono">Responsável por bar (só catálogo)</option><option value="admin">Administrador da plataforma</option></Select></Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao className="w-full">Criar</Botao>
        </form>
      </Folha>

      <Folha aberta={!!senhaDe} onFechar={() => setSenhaDe(null)} titulo={`Nova senha — ${senhaDe?.nome ?? ''}`}>
        <form onSubmit={trocarSenha} className="space-y-4">
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres"><Input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required minLength={8} autoComplete="new-password" /></Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao className="w-full">Alterar senha</Botao>
        </form>
      </Folha>
    </div>
  );
}
