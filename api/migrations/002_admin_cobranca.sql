-- Papéis (admin da plataforma x dono do bar), bloqueio por falta de pagamento e gestão de recebimentos

alter table usuarios add column papel text not null default 'dono';   -- admin | dono
alter table usuarios add column ativo boolean not null default true;

alter table bares add column bloqueado boolean not null default false;
alter table bares add column bloqueado_em timestamptz;
alter table bares add column motivo_bloqueio text;

-- Como o valor foi recebido (pix, dinheiro, transferencia, outro) e quem registrou
alter table pagamentos add column forma text not null default 'pix';
alter table pagamentos add column observacao text;
alter table pagamentos add column registrado_por uuid references usuarios(id) on delete set null;
alter table pagamentos add column referencia_inicio timestamptz;   -- vigência coberta (assinaturas)
alter table pagamentos add column referencia_fim timestamptz;
create index pagamentos_tipo_idx on pagamentos(tipo, status, pago_em);
create index fila_track_idx on fila(bar_id, spotify_track_id);
