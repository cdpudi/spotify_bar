import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function q<T = any>(texto: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(texto, params as any[]);
  return r.rows as T[];
}

export async function q1<T = any>(texto: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(texto, params))[0];
}

export async function transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

/** Aplica as migrations de /migrations em ordem, uma única vez cada. */
export async function migrar(): Promise<void> {
  await pool.query(
    `create table if not exists schema_migrations (nome text primary key, aplicada_em timestamptz not null default now())`,
  );
  const dir = new URL('../migrations/', import.meta.url);
  const arquivos = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const nome of arquivos) {
    const ja = await q1('select 1 from schema_migrations where nome=$1', [nome]);
    if (ja) continue;
    const sql = await readFile(new URL(nome, dir), 'utf8');
    await transacao(async (c) => {
      await c.query(sql);
      await c.query('insert into schema_migrations(nome) values ($1)', [nome]);
    });
    console.log(`[db] migration aplicada: ${nome}`);
  }
}
