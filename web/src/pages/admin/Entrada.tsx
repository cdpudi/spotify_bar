import { Music2 } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Aviso, Botao, Campo, Input, Logo } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Entrada() {
  const { token, entrar } = useAuth();
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
      await entrar(email, senha);
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
          <h1 className="text-2xl font-extrabold">Entrar no painel</h1>
          <Campo rotulo="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Campo>
          <Campo rotulo="Senha">
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <Botao className="w-full" tamanho="lg" carregando={enviando}>Entrar</Botao>
          <p className="text-center text-xs text-faint">Não tem acesso? Peça o cadastro do seu bar ao administrador da plataforma.</p>
          <p className="text-center text-sm"><Link to="/" className="text-faint hover:text-white">← Voltar para a página inicial</Link></p>
        </form>
      </main>
    </div>
  );
}
