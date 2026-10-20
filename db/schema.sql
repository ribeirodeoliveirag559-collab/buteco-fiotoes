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
