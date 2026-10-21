import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

interface Usuario {
  id: string;
  nome: string;
  email: string;
}
interface Ctx {
  token: string | null;
  usuario: Usuario | null;
  carregando: boolean;
  entrar(email: string, senha: string): Promise<void>;
  registrar(nome: string, email: string, senha: string): Promise<void>;
  sair(): void;
  /** chamada autenticada; derruba a sessão em 401 */
  req<T = any>(metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', caminho: string, corpo?: unknown): Promise<T>;
}

const AuthCtx = createContext<Ctx>(null as never);
const CHAVE = 'sb:admin-token';

const ler = () => {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(ler);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(!!ler());

  const sair = useCallback(() => {
    try {
      localStorage.removeItem(CHAVE);
    } catch {
      /* ignore */
    }
    setToken(null);
    setUsuario(null);
  }, []);

  const guardar = (t: string, u: Usuario) => {
    try {
      localStorage.setItem(CHAVE, t);
    } catch {
      /* ignore */
    }
    setToken(t);
    setUsuario(u);
  };

  useEffect(() => {
    if (!token) return setCarregando(false);
    api<Usuario>('GET', '/api/auth/me', undefined, token)
      .then(setUsuario)
      .catch(sair)
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valor = useMemo<Ctx>(
    () => ({
      token,
      usuario,
      carregando,
      async entrar(email, senha) {
        const r = await api('POST', '/api/auth/login', { email, senha });
        guardar(r.token, r.usuario);
      },
      async registrar(nome, email, senha) {
        const r = await api('POST', '/api/auth/registrar', { nome, email, senha });
        guardar(r.token, r.usuario);
      },
      sair,
      async req(metodo, caminho, corpo) {
        try {
          return await api(metodo, caminho, corpo, token);
        } catch (e: any) {
          if (e?.status === 401) sair();
          throw e;
        }
      },
    }),
    [token, usuario, carregando, sair],
  );
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
