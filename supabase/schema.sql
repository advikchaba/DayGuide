-- DayGuide schema for Supabase Postgres.
--
-- The FastAPI backend creates these tables automatically on boot; this file is
-- here for teams who prefer to manage schema inside the Supabase SQL editor.
--
-- Access model: the API talks to Postgres with the service role (server-side),
-- so row level security is enabled with no public policies. Add read-only
-- policies here if you ever query these tables from the browser.

create table if not exists profiles (
  id                varchar(64) primary key,           -- matches auth.users.id
  email             varchar(255) not null unique,
  username          varchar(24) unique,
  username_changes  integer not null default 0,
  password_hash     varchar(255),                       -- only used by the local dev auth provider
  coins             integer not null default 0,
  elo               integer not null default 100,
  avatar_slug       varchar(48) not null default 'spark',
  avatar_path       varchar(300),                        -- uploaded profile picture object key
  theme_slug        varchar(48) not null default 'dark',
  streak            integer not null default 0,
  best_streak       integer not null default 0,
  routines_completed integer not null default 0,
  tasks_completed   integer not null default 0,
  matches_won       integer not null default 0,
  matches_played    integer not null default 0,
  last_perfect_on   date,
  created_at        timestamptz not null default now()
);
create index if not exists ix_profiles_username on profiles (username);
create index if not exists ix_profiles_elo on profiles (elo desc);

create table if not exists routines (
  id        serial primary key,
  user_id   varchar(64) not null references profiles(id) on delete cascade,
  name      varchar(80) not null,
  emoji     varchar(8) not null default '✅',
  is_ranked_ready boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ix_routines_user on routines (user_id);

create table if not exists tasks (
  id             serial primary key,
  routine_id     integer not null references routines(id) on delete cascade,
  title          varchar(120) not null,
  note           text,
  requires_proof boolean not null default false,
  coin_value     integer not null default 10,
  scheduled_time varchar(5) not null default '09:00',
  position       integer not null default 0
);
create index if not exists ix_tasks_routine on tasks (routine_id);

create table if not exists proofs (
  id             serial primary key,
  user_id        varchar(64) not null references profiles(id) on delete cascade,
  task_id        integer references tasks(id) on delete cascade,
  match_id       integer,
  match_task_id  integer,
  claimed        varchar(200) not null,
  image_path     varchar(300) not null,
  status         varchar(16) not null default 'pending',
  confidence     double precision not null default 0,
  reason         varchar(400) not null default '',
  reviewer       varchar(64) not null default 'auto',
  coins_awarded  integer not null default 0,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);
create index if not exists ix_proofs_user on proofs (user_id);
create index if not exists ix_proofs_status on proofs (status);

create table if not exists task_completions (
  id            serial primary key,
  task_id       integer not null references tasks(id) on delete cascade,
  user_id       varchar(64) not null references profiles(id) on delete cascade,
  done_on       date not null,
  source        varchar(16) not null default 'manual',
  coins_awarded integer not null default 0,
  elo_awarded   integer not null default 0,
  on_time       boolean not null default true,
  time_delta_minutes integer not null default 0,
  proof_id      integer references proofs(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint uq_task_user_day unique (task_id, user_id, done_on)
);
create index if not exists ix_completions_user_day on task_completions (user_id, done_on);

create table if not exists perfect_days (
  id            serial primary key,
  user_id       varchar(64) not null references profiles(id) on delete cascade,
  routine_id    integer not null references routines(id) on delete cascade,
  done_on       date not null,
  coins_awarded integer not null default 0,
  elo_awarded   integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint uq_perfect_user_routine_day unique (user_id, routine_id, done_on)
);

create table if not exists shop_items (
  slug        varchar(48) primary key,
  name        varchar(80) not null,
  kind        varchar(16) not null,          -- theme (profile pictures are uploaded)
  description varchar(200) not null default '',
  price       integer not null default 0,
  rarity      varchar(16) not null default 'common',
  is_free     boolean not null default false,
  sort_order  integer not null default 100,
  meta        jsonb not null default '{}'::jsonb
);

create table if not exists purchases (
  id         serial primary key,
  user_id    varchar(64) not null references profiles(id) on delete cascade,
  item_slug  varchar(48) not null references shop_items(slug) on delete cascade,
  price_paid integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_purchase_user_item unique (user_id, item_slug)
);

create table if not exists ledger_entries (
  id         serial primary key,
  user_id    varchar(64) not null references profiles(id) on delete cascade,
  delta      integer not null default 0,
  elo_delta  integer not null default 0,
  reason     varchar(120) not null,
  created_at timestamptz not null default now()
);
create index if not exists ix_ledger_user on ledger_entries (user_id, created_at desc);

create table if not exists matches (
  id           serial primary key,
  code         varchar(8) not null unique,
  creator_id   varchar(64) not null references profiles(id) on delete cascade,
  routine_id   integer references routines(id) on delete set null,
  routine_name varchar(80) not null default 'Ranked checklist',
  status       varchar(16) not null default 'waiting',   -- waiting | active | finished
  winner_id    varchar(64) references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index if not exists ix_matches_status on matches (status);

create table if not exists match_tasks (
  id         serial primary key,
  match_id   integer not null references matches(id) on delete cascade,
  title      varchar(120) not null,
  position   integer not null default 0
);

create table if not exists match_players (
  id          serial primary key,
  match_id    integer not null references matches(id) on delete cascade,
  user_id     varchar(64) not null references profiles(id) on delete cascade,
  elo_before  integer not null default 100,
  elo_after   integer,
  elo_delta   integer not null default 0,
  coins_won   integer not null default 0,
  joined_at   timestamptz not null default now(),
  finished_at timestamptz,
  constraint uq_match_player unique (match_id, user_id)
);

alter table proofs
  add constraint fk_proofs_match foreign key (match_id) references matches(id) on delete cascade;
alter table proofs
  add constraint fk_proofs_match_task foreign key (match_task_id) references match_tasks(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Row level security: the API uses the service role, so nothing is public.
-- ---------------------------------------------------------------------------
alter table profiles        enable row level security;
alter table routines        enable row level security;
alter table tasks           enable row level security;
alter table task_completions enable row level security;
alter table perfect_days    enable row level security;
alter table shop_items      enable row level security;
alter table purchases       enable row level security;
alter table ledger_entries  enable row level security;
alter table proofs          enable row level security;
alter table matches         enable row level security;
alter table match_tasks     enable row level security;
alter table match_players   enable row level security;

-- Optional: let a signed-in user read their own profile straight from Supabase.
drop policy if exists "users read own profile" on profiles;
create policy "users read own profile" on profiles
  for select using (auth.uid()::text = id);

drop policy if exists "users read own routines" on routines;
create policy "users read own routines" on routines
  for select using (auth.uid()::text = user_id);
