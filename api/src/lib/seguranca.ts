import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scryptAsync = promisify(scrypt) as (s: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashSenha(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scryptAsync(senha, salt, 64);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}

export async function conferirSenha(senha: string, armazenado: string): Promise<boolean> {
  const [saltHex, hashHex] = armazenado.split(':');
  if (!saltHex || !hashHex) return false;
  const h = await scryptAsync(senha, Buffer.from(saltHex, 'hex'), 64);
  const esperado = Buffer.from(hashHex, 'hex');
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

const chave = () => createHash('sha256').update(config.encryptionKey).digest();

/** AES-256-GCM: formato iv.tag.dados (base64url). Usado para tokens do Spotify e do Mercado Pago. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.');
}

export function decifrar(cifrado: string): string {
  const [iv, tag, dados] = cifrado.split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
}

export const tokenAleatorio = (bytes = 18) => randomBytes(bytes).toString('base64url');
