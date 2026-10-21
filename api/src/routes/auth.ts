import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q1 } from '../db.js';
import { ErroHttp } from '../lib/erros.js';
import { conferirSenha, hashSenha } from '../lib/seguranca.js';

const registro = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  senha: z.string().min(8, 'mínimo de 8 caracteres').max(200),
});

export async function rotasAuth(app: FastifyInstance) {
  const emitir = (u: { id: string; nome: string; email: string }) => ({
    token: app.jwt.sign({ tipo: 'usuario', sub: u.id }, { expiresIn: '7d' }),
    usuario: { id: u.id, nome: u.nome, email: u.email },
  });

  app.post('/api/auth/registrar', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const d = registro.parse(req.body);
    if (await q1('select 1 from usuarios where email=$1', [d.email])) throw new ErroHttp(409, 'Este e-mail já está cadastrado');
    const u = await q1('insert into usuarios (nome,email,senha_hash) values ($1,$2,$3) returning id,nome,email', [
      d.nome,
      d.email,
      await hashSenha(d.senha),
    ]);
    return reply.code(201).send(emitir(u));
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req) => {
    const d = z.object({ email: z.string().trim().toLowerCase(), senha: z.string() }).parse(req.body);
    const u = await q1('select * from usuarios where email=$1', [d.email]);
    // mesma mensagem para e-mail inexistente e senha errada
    if (!u || !(await conferirSenha(d.senha, u.senha_hash))) throw new ErroHttp(401, 'E-mail ou senha inválidos');
    return emitir(u);
  });

  app.get('/api/auth/me', { preHandler: app.exigirUsuario }, async (req) => {
    const u = await q1('select id,nome,email from usuarios where id=$1', [req.user.sub]);
    if (!u) throw new ErroHttp(401, 'Usuário não existe mais');
    return u;
  });
}
