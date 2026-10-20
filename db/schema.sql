-- Schema do Neon (Postgres) — já aplicado no projeto "buteco-fiotoes"
create table if not exists players (
  pid text primary key,
  token text not null,
  name text not null,
  look jsonb not null,
  drink_started_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists scores (
  day date not null,
  pid text not null references players(pid) on delete cascade,
  beers integer not null default 0,
  last_beer_at timestamptz,
  primary key (day, pid)
);
create index if not exists scores_day_beers_idx on scores (day, beers desc);

-- v2.1: economia (garrafa -> copo -> pontos), pod/vape e campeão do dia
alter table players add column if not exists bottle integer not null default 0;  -- garrafa esperando no balcão
alter table players add column if not exists glass integer not null default 0;   -- copo cheio na mão
alter table players add column if not exists spent integer not null default 0;   -- pontos gastos na loja
alter table players add column if not exists vape integer not null default 0;    -- usos restantes do cigarro eletrônico
create table if not exists daily_winners (
  day date primary key,
  pid text not null references players(pid) on delete cascade,
  beers integer not null,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

-- v2.2: contas com senha
alter table players add column if not exists name_key text;
alter table players add column if not exists pass_salt text;
alter table players add column if not exists pass_hash text;
create unique index if not exists players_name_key_uidx on players (name_key) where name_key is not null;
