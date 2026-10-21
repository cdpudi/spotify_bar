-- Vários aplicativos Spotify (Client ID/Secret) e regras de capacidade
create table spotify_apps (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  client_id text not null unique,
  client_secret_enc text not null,
  limite_usuarios integer not null default 5,   -- "lugares" do app em modo de desenvolvimento (User Management)
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table spotify_contas add column app_id uuid references spotify_apps(id) on delete restrict;
alter table spotify_contas add column plano_spotify text not null default 'individual';  -- individual | duo | familia
alter table spotify_contas add column grupo_familia text;

-- Uma conta Spotify toca em um único lugar por vez: no máximo um bar por conta
create unique index bares_conta_unica on bares(spotify_conta_id) where spotify_conta_id is not null;
