export class ErroApi extends Error {
  constructor(
    public status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T = any>(metodo: Metodo, caminho: string, corpo?: unknown, token?: string | null): Promise<T> {
  let r: Response;
  try {
    r = await fetch(caminho, {
      method: metodo,
      headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor. Verifique sua internet.');
  }
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, dados?.erro ?? `Erro ${r.status}`);
  return dados as T;
}

export const mensagemErro = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado');
