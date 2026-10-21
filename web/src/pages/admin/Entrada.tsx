import { Music2 } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Aviso, Botao, Campo, Input, Logo } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Entrada() {
  const { token, entrar, registrar } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (token) return <Navigate to="/admin" replace />;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (modo === 'entrar') await entrar(email, senha);
      else await registrar(nome, email, senha);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-brand/30 via-surface to-bg p-12 lg:flex">
        <Logo className="text-xl" />
        <div>
          <Music2 className="mb-6 size-12 text-brand" />
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">Seu bar, sua trilha. A clientela escolhe — dentro do seu estilo.</h2>
          <p className="mt-4 max-w-md text-muted">Defina os gêneros, monte o catálogo e deixe o público votar. Receba por super chat via Pix.</p>
        </div>
        <p className="text-xs text-faint">© Spotify Bar</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <form onSubmit={enviar} className="w-full max-w-sm space-y-4">
          <Logo className="mb-2 text-lg lg:hidden" />
          <h1 className="text-2xl font-extrabold">{modo === 'entrar' ? 'Entrar no painel do bar' : 'Criar conta do bar'}</h1>
          {modo === 'criar' && (
            <Campo rotulo="Seu nome">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} autoComplete="name" />
            </Campo>
          )}
          <Campo rotulo="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha" dica={modo === 'criar' ? 'Mínimo de 8 caracteres' : undefined}>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={modo === 'criar' ? 8 : 1} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao className="w-full" tamanho="lg" carregando={enviando}>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</Botao>
          <p className="text-center text-sm text-muted">
            {modo === 'entrar' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button type="button" className="font-bold text-white underline-offset-2 hover:underline" onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null); }}>
              {modo === 'entrar' ? 'Cadastre seu bar' : 'Entrar'}
            </button>
          </p>
          <p className="text-center text-sm"><Link to="/" className="text-faint hover:text-white">← Voltar para a página inicial</Link></p>
        </form>
      </main>
    </div>
  );
}
