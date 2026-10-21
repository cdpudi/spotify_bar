import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q1 } from '../db.js';
import { ErroHttp } from '../lib/erros.js';
import { conferirSenha } from '../lib/seguranca.js';

// Não há cadastro público: o administrador da plataforma cria os responsáveis (ver routes/admin.ts).
export async function rotasAuth(app: FastifyInstance) {
  const emitir = (u: { id: string; nome: string; email: string; papel: string }) => ({
    token: app.jwt.sign({ tipo: 'usuario', sub: u.id, papel: u.papel }, { expiresIn: '7d' }),
    usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel },
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req) => {
    const d = z.object({ email: z.string().trim().toLowerCase(), senha: z.string() }).parse(req.body);
    const u = await q1('select * from usuarios where email=$1', [d.email]);
    // mesma mensagem para e-mail inexistente, senha errada ou conta desativada
    if (!u || !u.ativo || !(await conferirSenha(d.senha, u.senha_hash))) throw new ErroHttp(401, 'E-mail ou senha inválidos');
    return emitir(u);
  });

  app.get('/api/auth/me', { preHandler: app.exigirUsuario }, async (req) => {
    const u = await q1('select id,nome,email,papel from usuarios where id=$1 and ativo', [req.user.sub]);
    if (!u) throw new ErroHttp(401, 'Usuário não existe mais');
    return u;
  });
}
