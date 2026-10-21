import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanciaMetros } from './geo.js';
import { crc16, gerarBrCode } from './pix.js';
import { PLANOS, planoEfetivo } from './planos.js';
import { cifrar, conferirSenha, decifrar, hashSenha } from './seguranca.js';

test('crc16 CCITT-FALSE do vetor padrão', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('BR Code termina com CRC válido e contém valor e chave', () => {
  const b = gerarBrCode({ chave: 'a@b.com', valorCentavos: 1050, titular: 'Bar do Zé', cidade: 'São Paulo', txid: 'abc123' });
  assert.match(b, /^000201/);
  assert.ok(b.includes('540510.50'));
  assert.ok(b.includes('a@b.com'));
  assert.equal(b.slice(-4), crc16(b.slice(0, -4)));
});

test('haversine: ~111 km por grau de latitude', () => {
  const d = distanciaMetros(0, 0, 1, 0);
  assert.ok(d > 110_000 && d < 112_000);
  assert.equal(Math.round(distanciaMetros(-23.5, -46.6, -23.5, -46.6)), 0);
});

test('planos: valores e expiração', () => {
  assert.equal(PLANOS.mensal.valorCentavos, 20000);
  assert.equal(PLANOS.semestral.valorCentavos, 100000);
  assert.equal(PLANOS.anual.valorCentavos, 180000);
  assert.equal(planoEfetivo('anual', new Date(Date.now() + 1e6)).id, 'anual');
  assert.equal(planoEfetivo('anual', new Date(Date.now() - 1e6)).id, 'free');
  assert.equal(planoEfetivo('mensal', null).id, 'free');
});

test('cifra e senha', async () => {
  assert.equal(decifrar(cifrar('segredo')), 'segredo');
  const h = await hashSenha('minhasenha');
  assert.ok(await conferirSenha('minhasenha', h));
  assert.ok(!(await conferirSenha('outra', h)));
});
