-- Playlist automática: com a fila vazia, o player toca músicas do catálogo em ordem aleatória
alter table bares add column playlist_automatica boolean not null default true;
alter table fila add column automatica boolean not null default false;
