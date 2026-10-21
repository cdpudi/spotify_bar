/**
 * Dados de demonstração para desenvolvimento (usa o Spotify simulado):
 *   login: demo@spotifybar.dev / demo12345
 * Execute com `npm run seed` (idempotente).
 */
import { pool, migrar, q1 } from '../db.js';
import { hashSenha, cifrar } from '../lib/seguranca.js';
import { BIBLIOTECA_MOCK } from '../spotify/mock.js';

const ESTILO_POR_FAIXA: Record<number, string> = {
  1: 'Sertanejo', 2: 'Sertanejo', 3: 'Sertanejo', 4: 'MPB', 5: 'MPB', 6: 'Rock Nacional', 7: 'Rock Nacional',
  8: 'Rock Internacional', 9: 'Rock Internacional', 10: 'Rock Internacional', 11: 'Rock Internacional', 12: 'Pop',
  13: 'Pagode', 14: 'Pagode', 15: 'Funk', 16: 'Funk', 17: 'Forró', 18: 'Forró', 19: 'Eletrônica', 20: 'Eletrônica',
  21: 'Reggae', 22: 'Reggae', 23: 'Pop', 24: 'Pop', 25: 'Sertanejo', 26: 'Sertanejo',
};

await migrar();

let u = await q1('select * from usuarios where email=$1', ['demo@spotifybar.dev']);
if (!u) u = await q1('insert into usuarios (nome,email,senha_hash) values ($1,$2,$3) returning *', ['Dono Demo', 'demo@spotifybar.dev', await hashSenha('demo12345')]);

let conta = await q1('select * from spotify_contas where usuario_id=$1 limit 1', [u.id]);
if (!conta) {
  conta = await q1(
    `insert into spotify_contas (usuario_id, spotify_user_id, nome, email, produto, access_token_enc, refresh_token_enc, expira_em)
     values ($1,'mock-demo','Conta Demo','demo@spotify.mock','premium',$2,$3, now() + interval '1 hour') returning *`,
    [u.id, cifrar('mock-demo'), cifrar('mock-demo')],
  );
}

let bar = await q1('select * from bares where usuario_id=$1 limit 1', [u.id]);
if (!bar) {
  bar = await q1(
    `insert into bares (usuario_id, nome, slug, cidade, uf, bairro, logradouro, numero, latitude, longitude, raio_metros, qr_token, estilos,
       plano, plano_expira_em, spotify_conta_id, spotify_device_id, spotify_device_nome, pix_chave, pix_titular)
     values ($1,'Bar do Zé (Demo)','bar-do-ze-demo','São Paulo','SP','Pinheiros','Rua dos Pinheiros','100',-23.5614,-46.6823,200,'demo-qr-token',
       $2,'mensal', now() + interval '30 days', $3, $4, 'Celular do Bar (demo)', 'demo@pix.local', 'BAR DO ZE') returning *`,
    [u.id, [...new Set(Object.values(ESTILO_POR_FAIXA))], conta.id, 'celular-bar:mock-demo'],
  );
}
for (const f of BIBLIOTECA_MOCK) {
  const n = Number(f.id.replace('mock', ''));
  await pool.query(
    `insert into catalogo (bar_id, spotify_track_id, uri, nome, artistas, album, capa_url, duracao_ms, estilo)
     values ($1,$2,$3,$4,$5,$6,null,$7,$8) on conflict do nothing`,
    [bar.id, f.id, f.uri, f.nome, f.artistas, f.album, f.duracao_ms, ESTILO_POR_FAIXA[n] ?? 'Pop'],
  );
}
console.log(`Seed ok. Login: demo@spotifybar.dev / demo12345 — sala: /b/${bar.slug}?q=${bar.qr_token}`);
await pool.end();
