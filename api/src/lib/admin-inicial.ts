import { config } from '../config.js';
import { q1 } from '../db.js';
import { hashSenha } from './seguranca.js';

/** Garante o administrador da plataforma (ADMIN_EMAIL / ADMIN_SENHA). Não altera senha de quem já existe. */
export async function garantirAdmin() {
  const { adminEmail, adminSenha } = config;
  if (!adminEmail || !adminSenha) {
    console.warn('[admin] ADMIN_EMAIL/ADMIN_SENHA não definidos: nenhum administrador será criado automaticamente.');
    return;
  }
  const existe = await q1('select id from usuarios where email=$1', [adminEmail.toLowerCase()]);
  if (existe) {
    await q1("update usuarios set papel='admin', ativo=true where id=$1", [existe.id]);
    return;
  }
  await q1("insert into usuarios (nome,email,senha_hash,papel) values ('Administrador',$1,$2,'admin')", [adminEmail.toLowerCase(), await hashSenha(adminSenha)]);
  console.log(`[admin] administrador criado: ${adminEmail}`);
}
