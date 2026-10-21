-- Spotify Bar — schema inicial

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null unique,
  senha_hash text not null,
  criado_em timestamptz not null default now()
);

-- Contas Spotify pertencem ao usuário (dono) e podem ser escolhidas por qualquer bar dele.
create table spotify_contas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  spotify_user_id text not null,
  nome text not null,
  email text,
  produto text,                        -- premium | free | open
  access_token_enc text not null,
  refresh_token_enc text not null,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now(),
  unique (usuario_id, spotify_user_id)
);

create table bares (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  nome text not null,
  slug text not null unique,
  cnpj text,
  telefone text,
  email text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  latitude double precision,
  longitude double precision,
  raio_metros integer not null default 150,
  qr_token text not null,
  ativo boolean not null default true,

  -- plano
  plano text not null default 'free',
  plano_expira_em timestamptz,

  -- regras musicais
  estilos text[] not null default '{}',
  max_pedidos_por_sessao integer not null default 3,
  cooldown_repeticao_min integer not null default 30,
  superchat_valor_centavos integer not null default 1000,

  -- player (conta + dispositivo Spotify selecionados)
  spotify_conta_id uuid references spotify_contas(id) on delete set null,
  spotify_device_id text,
  spotify_device_nome text,

  -- recebimento Pix do superchat
  pix_provider text not null default 'estatico',   -- estatico | mercadopago
  pix_chave text,
  pix_titular text,
  mp_access_token_enc text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index bares_usuario_idx on bares(usuario_id);
create index bares_geo_idx on bares(latitude, longitude);

create table catalogo (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references bares(id) on delete cascade,
  spotify_track_id text not null,
  uri text not null,
  nome text not null,
  artistas text not null,
  album text,
  capa_url text,
  duracao_ms integer not null,
  estilo text not null,
  criado_em timestamptz not null default now(),
  unique (bar_id, spotify_track_id)
);

create table fila (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references bares(id) on delete cascade,
  catalogo_id uuid references catalogo(id) on delete set null,
  spotify_track_id text not null,
  uri text not null,
  nome text not null,
  artistas text not null,
  capa_url text,
  duracao_ms integer not null,
  -- aguardando_pagamento | pendente | enviada | tocando | tocada | removida
  status text not null,
  super boolean not null default false,
  super_pago_em timestamptz,
  solicitante_sessao text not null,
  solicitante_apelido text,
  criado_em timestamptz not null default now(),
  enviada_em timestamptz,
  iniciada_em timestamptz,
  finalizada_em timestamptz
);
create index fila_bar_status_idx on fila(bar_id, status);

create table votos (
  fila_id uuid not null references fila(id) on delete cascade,
  sessao_id text not null,
  criado_em timestamptz not null default now(),
  primary key (fila_id, sessao_id)
);

create table player_estado (
  bar_id uuid primary key references bares(id) on delete cascade,
  track_id text,
  nome text,
  artistas text,
  capa_url text,
  duracao_ms integer,
  progresso_ms integer,
  tocando boolean not null default false,
  dispositivo_online boolean not null default false,
  erro text,
  atualizado_em timestamptz not null default now()
);

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                  -- superchat | assinatura
  bar_id uuid not null references bares(id) on delete cascade,
  fila_id uuid references fila(id) on delete set null,
  plano text,
  sessao_id text,
  valor_centavos integer not null,
  provider text not null,              -- mock | estatico | mercadopago
  provider_id text,
  txid text not null,
  brcode text not null,
  qr_base64 text,
  status text not null default 'pendente',   -- pendente | pago | expirado | cancelado
  expira_em timestamptz not null,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index pagamentos_bar_idx on pagamentos(bar_id, status);
create index pagamentos_provider_idx on pagamentos(provider, provider_id);

-- Configurações globais (reservado para o painel da plataforma)
create table configuracoes (
  chave text primary key,
  valor jsonb not null
);
