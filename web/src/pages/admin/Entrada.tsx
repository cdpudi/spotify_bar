import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Aviso, Botao, Campo, Input, Logo } from '../../components/ui';
import { mensagemErro } from '../../lib/api';
import { useAuth } from '../../lib/auth';

// Símbolos musicais que sobem flutuando: claves de sol e de fá, notas e pausas.
const SIMBOLOS = ['𝄞', '♪', '𝄢', '♫', '♩', '♬', '𝄞', '♪', '𝄞', '♫', '𝄢', '♬'];

/** Gerador determinístico: o fundo é o mesmo a cada carga (evita "pulos" ao re-renderizar). */
function pseudo(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function FundoMusical() {
  const itens = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        simbolo: SIMBOLOS[i % SIMBOLOS.length],
        esquerda: pseudo(i, 1) * 100,
        tamanho: 22 + pseudo(i, 2) * 64,
        duracao: 14 + pseudo(i, 3) * 16,
        atraso: -pseudo(i, 4) * 30,
        sentido: pseudo(i, 5) > 0.5 ? 1 : -1,
        opacidade: 0.1 + pseudo(i, 6) * 0.3,
        verde: pseudo(i, 7) > 0.35,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      {itens.map((n, i) => (
        <span
          key={i}
          className="nota-flutuante"
          style={{
            left: `${n.esquerda}%`,
            fontSize: `${n.tamanho}px`,
            animationDuration: `${n.duracao}s`,
            animationDelay: `${n.atraso}s`,
            ['--op' as string]: n.opacidade,
            color: n.verde ? 'var(--color-brand)' : 'var(--color-gold)',
            ['--sway' as string]: `${n.sentido * (30 + pseudo(i, 8) * 60)}px`,
            ['--giro' as string]: `${n.sentido * (10 + pseudo(i, 9) * 30)}deg`,
          }}
        >
          {n.simbolo}
        </span>
      ))}
    </div>
  );
}

/** Barras de equalizador animadas, como uma caixa de som. */
function Equalizador() {
  return (
    <div className="eq-grande" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${-pseudo(i, 11) * 1.6}s`, animationDuration: `${0.9 + pseudo(i, 12) * 1}s` }} />
      ))}
    </div>
  );
}

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
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      <div className="fundo-login absolute inset-0" />
      <FundoMusical />

      <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
        <aside className="hidden flex-col justify-between p-12 lg:flex">
          <Logo className="text-xl" />
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-bold text-brand">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Ao vivo, em cada mesa
            </p>
            <h2 className="max-w-lg text-balance text-5xl font-extrabold leading-[1.05] tracking-tight">
              Seu bar, <span className="texto-gradiente">sua trilha.</span>
              <br />A clientela escolhe.
            </h2>
            <p className="mt-5 max-w-md text-lg text-muted">Defina o estilo, monte o catálogo e deixe o público votar. Quem quiser furar a fila manda um super chat.</p>
          </div>
          <Equalizador />
        </aside>

        <main className="flex items-center justify-center px-5 py-10">
          <form onSubmit={enviar} className="cartao-vidro w-full max-w-sm space-y-4 rounded-3xl p-7 sm:p-8">
            <Logo className="text-lg lg:hidden" />
            <div>
              <h1 className="text-2xl font-extrabold">Entrar no painel</h1>
              <p className="mt-1 text-sm text-muted">Acesse com o e-mail cadastrado para o seu bar.</p>
            </div>
            <Campo rotulo="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="voce@seubar.com.br" />
            </Campo>
            <Campo rotulo="Senha">
              <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
            </Campo>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <Botao className="w-full" tamanho="lg" carregando={enviando}>Entrar</Botao>
            <p className="text-center text-xs text-faint">Não tem acesso? Peça o cadastro do seu bar ao administrador da plataforma.</p>
            <p className="text-center text-sm"><Link to="/" className="text-faint hover:text-white">← Voltar para a página inicial</Link></p>
            <div className="lg:hidden"><Equalizador /></div>
          </form>
        </main>
      </div>
    </div>
  );
}
