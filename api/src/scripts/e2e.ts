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
const admin = login.j.token as string; // dono do bar demo
let adm = (await http('POST', '/api/auth/login', { email: 'admin@spotifybar.dev', senha: 'admin12345' })).j.token as string; // administrador da plataforma
const bares = (await http('GET', '/api/bares', undefined, admin)).j;
const bar = bares[0];
// estado limpo: sem histórico de fila/pagamentos do bar demo (o cooldown depende dele)
await pool.query('delete from fila where bar_id=$1', [bar.id]);
await pool.query('delete from pagamentos where bar_id=$1', [bar.id]);
const slug = bar.slug as string;
let A = '', B = '', C = '';
const sidA = crypto.randomUUID(), sidB = crypto.randomUUID(), sidC = crypto.randomUUID();
let cat: any[] = [];

await passo('auth: senha errada é rejeitada e não há cadastro público', async () => {
  assert.equal((await http('POST', '/api/auth/login', { email: 'demo@spotifybar.dev', senha: 'errada123' })).status, 401);
  assert.equal((await http('POST', '/api/auth/registrar', { nome: 'Xy', email: 'demo@spotifybar.dev', senha: '12345678' })).status, 404, 'sem cadastro público');
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
  await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: null, device_id: null }, adm);
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

await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: bar.spotify_conta_id, device_id: `celular-bar:e2e-${sufixo}`, device_nome: 'Celular E2E' }, adm);
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

await passo('admin: login, papel e criação de responsável; sem cadastro público', async () => {
  const l = await http('POST', '/api/auth/login', { email: 'admin@spotifybar.dev', senha: 'admin12345' });
  assert.equal(l.status, 200);
  assert.equal(l.j.usuario.papel, 'admin');
  adm = l.j.token;
  assert.equal((await http('POST', '/api/auth/registrar', { nome: 'Xy', email: `x-${sufixo}@t.dev`, senha: '12345678' })).status, 404);
  const novo = await http('POST', '/api/admin/usuarios', { nome: 'Dono Dois', email: `dono2-${sufixo}@teste.dev`, senha: 'senha12345' }, adm);
  assert.equal(novo.status, 201);
  assert.equal(novo.j.papel, 'dono');
  assert.equal((await http('POST', '/api/admin/usuarios', { nome: 'Dono Dois', email: `dono2-${sufixo}@teste.dev`, senha: 'senha12345' }, adm)).status, 409);
});

let dono2 = '', donoId = '', bar2: any;
await passo('permissões: dono só altera o catálogo; dados, Spotify, Pix e criação de bar são do administrador', async () => {
  const l = await http('POST', '/api/auth/login', { email: `dono2-${sufixo}@teste.dev`, senha: 'senha12345' });
  dono2 = l.j.token;
  donoId = l.j.usuario.id;
  const corpo = { nome: 'Boteco Free', cidade: 'Campinas', uf: 'sp', latitude: -22.9, longitude: -47.06, estilos: ['Samba'], usuario_id: donoId };
  assert.equal((await http('POST', '/api/bares', corpo, dono2)).status, 403, 'dono não cria bar');
  const criado = await http('POST', '/api/bares', corpo, adm);
  assert.equal(criado.status, 201);
  bar2 = criado.j;
  assert.equal(bar2.plano_efetivo, 'free');
  assert.equal(bar2.situacao, 'gratuito');
  assert.equal(bar2.uf, 'SP');
  assert.equal((await http('PUT', `/api/bares/${bar2.id}`, corpo, dono2)).status, 403);
  assert.equal((await http('PUT', `/api/bares/${bar2.id}/pix`, { pix_provider: 'estatico', pix_chave: 'a@b.com' }, dono2)).status, 403);
  assert.equal((await http('PUT', `/api/bares/${bar2.id}/spotify`, { conta_id: null, device_id: null }, dono2)).status, 403);
  assert.equal((await http('GET', '/api/spotify/contas', undefined, dono2)).status, 403);
  assert.equal((await http('POST', `/api/bares/${bar2.id}/qr/regenerar`, undefined, dono2)).status, 403);
  assert.equal((await http('GET', '/api/admin/bares', undefined, dono2)).status, 403);
  // o dono enxerga só o próprio bar e edita o catálogo
  const meus = (await http('GET', '/api/bares', undefined, dono2)).j;
  assert.deepEqual(meus.map((b: any) => b.id), [bar2.id]);
  assert.equal((await http('GET', `/api/bares/${bar.id}`, undefined, dono2)).status, 404, 'bar de outro dono');
  assert.equal((await http('GET', `/api/bares/${bar.id}/fila`, undefined, dono2)).status, 404);
  const base = { spotify_track_id: 'x1', uri: 'spotify:track:x1', nome: 'Música', artistas: 'Artista', duracao_ms: 1000 };
  assert.equal((await http('POST', `/api/bares/${bar2.id}/catalogo`, { ...base, estilo: 'Funk' }, dono2)).status, 400, 'estilo fora do permitido');
  assert.equal((await http('POST', `/api/bares/${bar2.id}/catalogo`, { ...base, estilo: 'Samba' }, dono2)).status, 201);
  for (let i = 2; i <= 30; i++) await http('POST', `/api/bares/${bar2.id}/catalogo`, { ...base, spotify_track_id: `x${i}`, uri: `spotify:track:x${i}`, estilo: 'Samba' }, dono2);
  assert.equal((await http('POST', `/api/bares/${bar2.id}/catalogo`, { ...base, spotify_track_id: 'x31', uri: 'spotify:track:x31', estilo: 'Samba' }, dono2)).status, 402);
  // token de sessão não serve como token de admin e vice-versa
  assert.equal((await http('GET', '/api/bares', undefined, A)).status, 401);
  assert.equal((await http('GET', `/api/public/bares/${slug}/catalogo`, undefined, adm)).status, 401);
});

await passo('cobrança: mensalidade em dinheiro com próximo vencimento, situação, assinatura por Pix e bloqueio', async () => {
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'dinheiro' }, dono2)).status, 403);
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'cheque' }, adm)).status, 400);
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'dinheiro', proximo_vencimento: '2020-01-01' }, adm)).status, 400, 'vencimento no passado');
  const r = await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'dinheiro', proximo_vencimento: em3dias, observacao: 'recibo 12' }, adm);
  assert.equal(r.status, 201);
  assert.equal(r.j.bar.plano_efetivo, 'mensal');
  assert.equal(r.j.bar.situacao, 'vence_em_breve');
  assert.ok(r.j.bar.dias_para_vencer >= 3 && r.j.bar.dias_para_vencer <= 4);
  // renovação sem data: soma 30 dias ao vencimento atual e fica em dia
  const r2 = await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'pix' }, adm);
  assert.equal(r2.j.bar.situacao, 'em_dia');
  assert.ok(r2.j.bar.dias_para_vencer >= 32);
  // assinatura online (Pix simulado) também entra como forma pix
  assert.equal((await http('POST', `/api/bares/${bar2.id}/assinar`, { plano: 'semestral' }, dono2)).status, 403, 'dono não troca de plano');
  const ass = await http('POST', `/api/bares/${bar2.id}/assinar`, { plano: 'semestral' }, adm);
  assert.equal(ass.j.valor_centavos, 100000);
  await http('POST', `/api/pagamentos/${ass.j.id}/simular`);
  assert.equal((await http('GET', `/api/bares/${bar2.id}`, undefined, dono2)).j.plano_efetivo, 'semestral');

  // bloquear: o bar some para o público e o dono vê o bloqueio
  const lista = (await http('GET', '/api/admin/bares', undefined, adm)).j.find((b: any) => b.id === bar2.id);
  assert.equal(lista.ultimo_pagamento.forma, 'pix');
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/bloquear`, { motivo: 'Mensalidade em atraso' }, dono2)).status, 403);
  const bl = await http('POST', `/api/admin/bares/${bar2.id}/bloquear`, { motivo: 'Mensalidade em atraso' }, adm);
  assert.equal(bl.j.situacao, 'bloqueado');
  assert.equal((await http('GET', `/api/public/bares/${bar2.slug}/estado`)).status, 403);
  assert.equal((await http('POST', `/api/public/bares/${bar2.slug}/entrar`, { q: bar2.qr_token })).status, 403);
  const prox = (await http('GET', `/api/public/bares/proximos?lat=-22.9&lng=-47.06&km=5`)).j;
  assert.ok(!prox.some((b: any) => b.slug === bar2.slug), 'bloqueado não aparece na busca por GPS');
  assert.equal((await http('GET', `/api/bares/${bar2.id}`, undefined, dono2)).j.bloqueado, true);
  // registrar pagamento desbloqueia
  const pg = await http('POST', `/api/admin/bares/${bar2.id}/mensalidades`, { plano: 'mensal', forma: 'dinheiro' }, adm);
  assert.equal(pg.j.bar.bloqueado, false);
  assert.equal((await http('GET', `/api/public/bares/${bar2.slug}/estado`)).status, 200);
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/bloquear`, {}, adm)).j.bloqueado, true);
  assert.equal((await http('POST', `/api/admin/bares/${bar2.id}/desbloquear`, undefined, adm)).j.bloqueado, false);
});

await passo('pagamentos: administrador vê todos; dono vê só os do seu bar; totais por forma', async () => {
  const todos = await http('GET', '/api/admin/pagamentos', undefined, adm);
  assert.equal(todos.status, 200);
  assert.ok(todos.j.itens.some((p: any) => p.bar_id === bar.id && p.tipo === 'superchat'));
  assert.ok(todos.j.itens.some((p: any) => p.bar_id === bar2.id && p.tipo === 'assinatura'));
  assert.equal((await http('GET', '/api/admin/pagamentos', undefined, dono2)).status, 403);
  const formas = (await http('GET', '/api/admin/pagamentos?tipo=assinatura', undefined, adm)).j.totais.map((t: any) => t.forma);
  assert.ok(formas.includes('dinheiro') && formas.includes('pix'));
  const so = await http('GET', `/api/admin/pagamentos?forma=dinheiro&tipo=assinatura&bar_id=${bar2.id}`, undefined, adm);
  assert.ok(so.j.itens.length >= 2 && so.j.itens.every((p: any) => p.forma === 'dinheiro'));
  const meus = (await http('GET', `/api/bares/${bar2.id}/pagamentos`, undefined, dono2)).j;
  assert.ok(meus.itens.length >= 3 && meus.itens.every((p: any) => p.bar_id === bar2.id));
  assert.ok(meus.itens.every((p: any) => p.tipo === 'assinatura'), 'pagamentos do bar = mensalidades à plataforma');
  assert.equal((await http('GET', `/api/bares/${bar.id}/pagamentos`, undefined, dono2)).status, 404);
  // super chat confirmado manualmente pelo bar, informando como recebeu
  const alvo = musica('Garota de Ipanema');
  const sp = await http('POST', `/api/public/bares/${slug}/superchat`, { catalogo_id: alvo.id }, B);
  assert.equal(sp.status, 201);
  const conf = await http('POST', `/api/bares/${bar.id}/pagamentos/${sp.j.id}/confirmar`, { forma: 'dinheiro' }, admin);
  assert.equal(conf.j.forma, 'dinheiro');
  assert.equal(conf.j.status, 'pago');
  // lista de super chats do bar: recebidos x aguardando
  const sp2 = await http('POST', `/api/public/bares/${slug}/superchat`, { catalogo_id: musica('Faz Gostoso').id }, C);
  const lista = (await http('GET', `/api/bares/${bar.id}/superchats`, undefined, admin)).j;
  assert.ok(lista.resumo.recebidos >= 2 && lista.resumo.aguardando >= 1);
  assert.ok(lista.itens.some((i: any) => i.musica === 'Garota de Ipanema' && i.status === 'pago' && i.forma === 'dinheiro'));
  assert.ok(lista.itens.some((i: any) => i.id === sp2.j.id && i.status === 'pendente'));
  assert.equal((await http('GET', `/api/bares/${bar.id}/superchats?status=pendente`, undefined, admin)).j.itens.every((i: any) => i.status === 'pendente'), true);
  assert.equal((await http('GET', `/api/bares/${bar.id}/superchats`, undefined, dono2)).status, 404);
});

await passo('estatísticas: pedidos, mais pedidas, por bar e período', async () => {
  const e = (await http('GET', `/api/bares/${bar.id}/estatisticas`, undefined, admin)).j;
  assert.ok(e.resumo.pedidos >= 5 && e.resumo.tocadas >= 1 && e.resumo.superchats >= 2);
  assert.ok(e.top.length > 0 && e.top[0].pedidos >= e.top[e.top.length - 1].pedidos);
  assert.ok(e.top.some((t: any) => t.nome === 'Three Little Birds' && t.superchats >= 1));
  assert.ok(e.por_dia.length >= 1);
  const geral = (await http('GET', '/api/admin/estatisticas', undefined, adm)).j;
  assert.ok(geral.por_bar.some((b: any) => b.id === bar.id));
  assert.equal((await http('GET', '/api/admin/estatisticas', undefined, dono2)).status, 403);
  assert.equal((await http('GET', `/api/bares/${bar.id}/estatisticas`, undefined, dono2)).status, 404);
  const futuro = (await http('GET', `/api/bares/${bar.id}/estatisticas?de=2999-01-01`, undefined, admin)).j;
  assert.equal(futuro.resumo.pedidos, 0);
});

await passo('playlist automática: sem pedidos toca o catálogo aleatoriamente; pedido do público tem prioridade', async () => {
  // fila vazia + dispositivo novo (estado limpo)
  await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: null, device_id: null }, adm);
  // esvazia a fila preservando o histórico (as estatísticas dependem dele)
  await pool.query("update fila set status='removida' where bar_id=$1 and status in ('pendente','enviada')", [bar.id]);
  await pool.query("update fila set status='tocada', finalizada_em=now() where bar_id=$1 and status='tocando'", [bar.id]);
  await http('PUT', `/api/bares/${bar.id}/spotify`, { conta_id: bar.spotify_conta_id, device_id: `celular-bar:e2e-auto-${sufixo}`, device_nome: 'Celular E2E Auto' }, adm);
  const est = await ate(async () => {
    const e = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j;
    return e.tocando?.automatica ? e : false;
  }, 25000);
  assert.ok(cat.some((m) => m.nome === est.tocando.nome), 'toca uma música do catálogo');
  const { rows } = await pool.query("select automatica from fila where bar_id=$1 and status='tocando'", [bar.id]);
  assert.equal(rows[0]?.automatica, true);

  // o pedido de um cliente passa a ser a próxima, no lugar do sorteio
  const alvo = ['Xote dos Milagres', 'Levels', 'Get Lucky'].map(musica).find((m) => m.nome !== est.tocando.nome);
  assert.equal((await http('POST', `/api/public/bares/${slug}/fila`, { catalogo_id: alvo.id }, A)).status, 201);
  const prox = await ate(async () => {
    const e = (await http('GET', `/api/public/bares/${slug}/estado`, undefined, A)).j;
    return e.fila[0]?.status === 'enviada' ? e.fila[0] : false;
  }, 75000);
  assert.equal(prox.nome, alvo.nome);
  assert.equal(prox.automatica, false);

  // desligada, não sorteia: a playlist automática é configurável por bar
  const dados = (await http('GET', `/api/bares/${bar.id}`, undefined, adm)).j;
  assert.equal(dados.playlist_automatica, true);
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os passos passaram');
await pool.end();
process.exit(falhas ? 1 : 0);
