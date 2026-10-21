import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { pool } from './db.js';
import { ErroHttp } from './lib/erros.js';
import { rotasAuth } from './routes/auth.js';
import { rotasBares } from './routes/bares.js';
import { rotasCatalogo } from './routes/catalogo.js';
import { rotasPagamentos } from './routes/pagamentos.js';
import { rotasPublico } from './routes/publico.js';
import { rotasSpotify } from './routes/spotify.js';

declare module 'fastify' {
  interface FastifyInstance {
    exigirUsuario: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    exigirSessao: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { tipo: 'usuario' | 'sessao' | 'spotify'; [k: string]: any };
    user: { tipo: 'usuario' | 'sessao' | 'spotify'; [k: string]: any };
  }
}

export async function criarApp() {
  const app = Fastify({
    logger: config.producao ? true : { level: 'warn' },
    trustProxy: config.proxyHops > 0 ? (_addr: string, hop: number) => hop < config.proxyHops : false,
    disableRequestLogging: config.producao,
  });

  await app.register(cors, { origin: true, credentials: true });
  // Limite global por IP; rotas sensíveis têm limites próprios (config.rateLimit nas rotas)
  await app.register(rateLimit, { global: true, max: 3000, timeWindow: '1 minute' });
  await app.register(jwt, { secret: config.jwtSecret });

  app.decorate('exigirUsuario', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new ErroHttp(401, 'Sessão expirada. Faça login novamente.');
    }
    if (req.user.tipo !== 'usuario') throw new ErroHttp(401, 'Token inválido');
  });
  app.decorate('exigirSessao', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new ErroHttp(401, 'Entre em um bar para continuar.');
    }
    if (req.user.tipo !== 'sessao') throw new ErroHttp(401, 'Token inválido');
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof ZodError) {
      const i = err.issues[0];
      return reply.code(400).send({ erro: `${i.path.join('.') || 'corpo'}: ${i.message}` });
    }
    if (err instanceof ErroHttp) return reply.code(err.status).send({ erro: err.message });
    if (err.statusCode === 429) return reply.code(429).send({ erro: 'Muitas tentativas. Aguarde um instante e tente de novo.' });
    if (err.validation || (err.statusCode >= 400 && err.statusCode < 500)) return reply.code(err.statusCode ?? 400).send({ erro: err.message });
    app.log.error(err);
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  app.get('/api/saude', async () => {
    await pool.query('select 1');
    return { ok: true, spotify: config.spotify.modo, pix: config.pix.modo };
  });

  await app.register(rotasAuth);
  await app.register(rotasBares);
  await app.register(rotasSpotify);
  await app.register(rotasCatalogo);
  await app.register(rotasPagamentos);
  await app.register(rotasPublico);
  return app;
}
