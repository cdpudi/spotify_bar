import { useEffect, useState } from 'react';
import { api } from './api';

interface Saude {
  ok: boolean;
  spotify: 'mock' | 'real';
  pix: 'mock' | 'real';
}

let cache: Promise<Saude> | null = null;

/** Modos de operação do servidor (demonstração x produção). */
export function useModo() {
  const [m, setM] = useState<Saude | null>(null);
  useEffect(() => {
    cache ??= api<Saude>('GET', '/api/saude');
    cache.then(setM).catch(() => setM(null));
  }, []);
  return m;
}
