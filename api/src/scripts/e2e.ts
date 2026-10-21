/**
 * Teste ponta a ponta contra uma API rodando em modo mock (SPOTIFY_MODE=mock, PIX_MODE=mock),
 * com o seed aplicado e PLAYER_POLL_MS=1000. Uso: `npm run e2e`
 */
import assert from 'node:assert/strict';
import { pool } from '../db.js';

const API = process.env.E2E_API ?? 'http://localhost:3002';
let falhas = 0;
const ok = (nome: string) => console.log(`  ✓ ${nome}`);

async function http(metodo: string, caminho: string, corpo?: unknown, token?: string) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j: any = await r.json().catch(() => null);
  return { status: r.status, j };
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function ate<T>(fn: () => Promise<T | false | undefined>, ms = 15000): Promise<T> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const v = await fn();
    if (v) return v as T;
    await esperar(400);
  }
  throw new Error('timeout aguardando condição');
}
async function passo(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    ok(nome);
  } catch (e) {
    falhas++;
    console.log(`  ✗ ${nome}\n      ${(e as Error).message}`);
  }
}

const sufixo = Date.now().toString(36);
console.log('E2E Spotify Bar');

const login = await http('POST', '/api/auth/login', { email: 'demo@spotifybar.dev', senha: 'demo12345' });
const admin = login.j.token as string;
const bares = (await http('GET', '/api/bares', undefined, admin)).j;
const bar = bares[0];
// estado limpo: sem histórico de fila/pagamentos do bar demo (o cooldown depende dele)
await pool.query('delete from fila where bar_id=$1', [bar.id]);
await pool.query('delete from pagamentos where bar_id=$1', [bar.id]);
const slug = bar.slug as string;
let A = '', B = '', C = '';
const sidA = crypto.randomUUID(), sidB = crypto.randomUUID(), sidC = crypto.randomUUID();
let cat: any[] = [];

await passo('auth: senha errada é rejeitada, registro duplicado também', async () => {
  assert.equal((await http('POST', '/api/auth/login', { email: 'demo@spotifybar.dev', senha: 'errada123' })).status, 401);
  assert.equal((await http('POST', '/api/auth/registrar', { nome: 'Xy', email: 'demo@spotifybar.dev', senha: '12345678' })).status, 409);
  assert.equal((await http('GET', '/api/bares')).status, 401);
});

await passo('GPS: longe do bar é negado, perto é aceito, QR entra sem GPS, QR inválido nega', async () => {
  const longe = await http('POST', `/api/public/bares/${slug}/entrar`, { lat: -22.9, lng: -43.2 });
  assert.equal(longe.status, 403);
  const semGps = await http('POST', `/api/public/bares/${slug}/entrar`, {});
  assert.equal(semGps.status, 400);
  const perto = await http('POST', `/api/public/bares/${slug}/entrar`, { lat: bar.latitude + 0.0003, lng: bar.longitude, sid: sidA });
  assert.equal(perto.status, 200);
  assert.equal(perto.j.via, 'gps');
  A = perto.j.token;
  const qr = await http('POST', `/api/public/bares/${slug}/entrar`, { q: bar.qr_token, sid: sidB });
  assert.equal(qr.j.via, 'qr');
  B = qr.j.token;
  C = (await http('POST', `/api/public/bares/${slug}/entrar`, { q: bar.qr_token, sid: sidC })).j.token;
  assert.equal((await http('POST', `/api/public/bares/${slug}/entrar`, { q: 'errado' })).status, 403);
});

await passo('bares próximos por GPS (com distância e raio)', async () => {
  const r = await http('GET', `/api/public/bares/proximos?lat=${bar.latitude}&lng=${bar.longitude}&km=5`);
  const meu = r.j.find((b: any) => b.slug === slug);
  assert.ok(meu && meu.dentro_do_raio && meu.distancia_m < 5);
  const vazio = await http('GET', '/api/public/bares/proximos?lat=-3.1&lng=-60.0&km=5');
  assert.equal(vazio.j.length, 0);
});

await passo('catálogo público exige sessão e filtra por estilo', async () => {
  assert.equal((await http('GET', `/api/public/bares/${slug}/catalogo`)).status, 401);
  cat = (await http('GET', `/api/public/bares/${slug}/catalogo`, undefined, A)).j;
  assert.ok(cat.length >= 20);
  const rock = (await http('GET', `/api/public/bares/${slug}/catalogo?estilo=Reggae`, undefined, A)).j;
  assert.ok(rock.length > 0 && rock.every((m: any) => m.estilo === 'Reggae'));
});

const musica = (nome: string) => cat.find((m) => m.nome.includes(nome));

await passo('fila: pedido, voto de outros, ordem por votos e depois por antiguidade', async () => {
  const wonder = musica('Wonderwall'), evid = musica('Evidências'), onda = musica('Como Uma Onda');
  // desliga o player do bar para a ordem da fila ser determinística
  await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: null, device_id: null }, admin);
  // limpa a fila de execuções anteriores
  const f0 = (await http('GET', `/api/bares/${bar.id}/fila`, undefined, admin)).j.fila;
  for (const f of f0) await http('DELETE', `/api/bares/${bar.id}/fila/${f.id}`, undefined, admin);

  assert.equal((await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: wonder.id }, A)).j.acao, 'pedido');
  await esperar(50);
  const e = await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: evid.id }, B);
  assert.equal(e.j.acao, 'pedido');
  await esperar(50);
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: onda.id }, C)).j.acao, 'pedido');

  // empate 1x1x1 -> ordem de chegada
  let fila = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j.fila;
  assert.deepEqual(fila.map((f: any) => f.nome), ['Wonderwall', 'Evidências', 'Como Uma Onda']);

  // A e C votam em Evidências -> vai para o topo
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila/${e.j.id}/voto`, undefined, A)).status, 201);
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila/${e.j.id}/voto`, undefined, C)).status, 201);
  fila = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j.fila;
  assert.equal(fila[0].nome, 'Evidências');
  assert.equal(fila[0].votos, 3);
  assert.equal(fila[0].meu_voto, true);

  // voto duplicado e pedir música já na fila (vira voto duplicado)
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila/${e.j.id}/voto`, undefined, A)).status, 409);
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: evid.id }, A)).status, 409);
  // desfazer voto
  await http('DELETE', `/api/public/bares/${slug}/fila/${e.j.id}/voto`, undefined, C);
  fila = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j.fila;
  assert.equal(fila[0].votos, 2);
});

await passo('limite de pedidos por visitante', async () => {
  const r = [];
  for (const nome of ['Dancing Queen', 'Shape of You', 'Levels', 'Get Lucky']) {
    r.push((await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: musica(nome).id }, A)).status);
  }
  assert.ok(r.includes(429), `esperava 429, obteve ${r}`);
});

await passo('super chat: Pix gerado, pago e a música passa na frente de todas', async () => {
  const alvo = musica('Three Little Birds');
  const p = await http('POST', `/api/public/bares/${slug}/superchat`, { catalogo_id: alvo.id }, B);
  assert.equal(p.status, 201);
  assert.ok(p.j.brcode.startsWith('000201') && p.j.status === 'pendente');
  let fila = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, B)).j.fila;
  assert.ok(!fila.some((f: any) => f.nome === 'Three Little Birds'), 'não entra na fila antes de pagar');
  // outro visitante não enxerga o pagamento alheio
  assert.equal((await http('GET', `/api/public/pagamentos/${p.j.id}`, undefined, A)).status, 404);
  const pago = await http('POST', `/api/pagamentos/${p.j.id}/simular`);
  assert.equal(pago.j.status, 'pago');
  fila = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, B)).j.fila;
  assert.equal(fila[0].nome, 'Three Little Birds');
  assert.equal(fila[0].super, true);
  assert.equal((await http('POST', `/api/pagamentos/${p.j.id}/simular`)).j.status, 'pago', 'idempotente');
});

await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: bar.spotify_conta_id, device_id: `celular-bar:e2e-${sufixo}`, device_nome: 'Celular E2E' }, admin);
await passo('player: toca a 1ª da fila e agenda a seguinte antes do fim (super chat primeiro)', async () => {
  const est = await ate(async () => {
    const e = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j;
    return e.tocando?.nome === 'Three Little Birds' ? e : false;
  });
  assert.equal(est.tocando.nome, 'Three Little Birds');
  // a próxima da fila precisa estar "enviada" ao Spotify (Evidências, mais votada)
  const prox = await ate(async () => {
    const e = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j;
    return e.fila[0]?.status === 'enviada' ? e.fila[0] : false;
  }, 60000);
  assert.equal(prox.nome, 'Evidências');
});

await passo('player: avança sozinho para a música enviada e registra no histórico', async () => {
  await ate(async () => {
    const e = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j;
    return e.tocando?.nome === 'Evidências' ? e : false;
  }, 40000);
  const fila = (await http('GET', `/api/bares/${bar.id}/fila`, undefined, admin)).j;
  assert.ok(!fila.fila.some((f: any) => f.nome === 'Evidências'), 'tocando sai da fila de espera');
});

await passo('cooldown: música que acabou de tocar não pode ser pedida de novo', async () => {
  const r = await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: musica('Three Little Birds').id }, C);
  assert.equal(r.status, 429);
});

await passo('painel: pausar/retomar/pular e remover da fila', async () => {
  assert.equal((await http('POST', `/api/bares/${bar.id}/player/pausar`, undefined, admin)).status, 200);
  assert.equal((await http('POST', `/api/bares/${bar.id}/player/retomar`, undefined, admin)).status, 200);
  assert.equal((await http('POST', `/api/bares/${bar.id}/player/xyz`, undefined, admin)).status, 404);
  const fila = (await http('GET', `/api/bares/${bar.id}/fila`, undefined, admin)).j.fila;
  if (fila[0]) assert.equal((await http('DELETE', `/api/bares/${bar.id}/fila/${fila[0].id}`, undefined, admin)).status, 200);
});

await passo('multi-tenant: outro dono não acessa o bar', async () => {
  const outro = (await http('POST', '/api/auth/registrar', { nome: 'Outro', email: `outro-${sufixo}@teste.dev`, senha: 'senha12345' })).j.token;
  assert.equal((await http('GET', `/api/bares/${bar.id}`, undefined, outro)).status, 404);
  assert.equal((await http('GET', `/api/bares/${bar.id}/fila`, undefined, outro)).status, 404);
  // token de sessão não serve como token de admin e vice-versa
  assert.equal((await http('GET', '/api/bares', undefined, A)).status, 401);
  assert.equal((await http('GET', `/api/public/bares/${slug}/catalogo`, undefined, admin)).status, 401);
});

await passo('bar free: cadastro com lat/long, estilos, limite de catálogo e sem super chat', async () => {
  const dono = (await http('POST', '/api/auth/registrar', { nome: 'Dono Free', email: `free-${sufixo}@teste.dev`, senha: 'senha12345' })).j.token;
  const novo = await http('POST', '/api/bares', {
    nome: 'Boteco Free', cidade: 'Campinas', uf: 'sp', latitude: -22.9, longitude: -47.06, estilos: ['Samba'],
  }, dono);
  assert.equal(novo.status, 201);
  assert.equal(novo.j.plano_efetivo, 'free');
  assert.equal(novo.j.uf, 'SP');
  const id = novo.j.id;
  // estilo fora do permitido
  const base = { spotify_track_id: 'x1', uri: 'spotify:track:x1', nome: 'Música', artistas: 'Artista', duracao_ms: 1000 };
  assert.equal((await http('POST', `/api/bares/${id}/catalogo`, { ...base, estilo: 'Funk' }, dono)).status, 400);
  assert.equal((await http('POST', `/api/bares/${id}/catalogo`, { ...base, estilo: 'Samba' }, dono)).status, 201);
  for (let i = 2; i <= 30; i++) await http('POST', `/api/bares/${id}/catalogo`, { ...base, spotify_track_id: `x${i}`, uri: `spotify:track:x${i}`, estilo: 'Samba' }, dono);
  assert.equal((await http('POST', `/api/bares/${id}/catalogo`, { ...base, spotify_track_id: 'x31', uri: 'spotify:track:x31', estilo: 'Samba' }, dono)).status, 402);
  // assinatura gera Pix e ativa o plano
  const ass = await http('POST', `/api/bares/${id}/assinar`, { plano: 'semestral' }, dono);
  assert.equal(ass.j.valor_centavos, 100000);
  await http('POST', `/api/pagamentos/${ass.j.id}/simular`);
  const depois = (await http('GET', `/api/bares/${id}`, undefined, dono)).j;
  assert.equal(depois.plano_efetivo, 'semestral');
  assert.ok(new Date(depois.plano_expira_em).getTime() > Date.now() + 170 * 86400000);
  assert.equal((await http('POST', `/api/bares/${id}/catalogo`, { ...base, spotify_track_id: 'x31', uri: 'spotify:track:x31', estilo: 'Samba' }, dono)).status, 201);
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os passos passaram');
await pool.end();
process.exit(falhas ? 1 : 0);
