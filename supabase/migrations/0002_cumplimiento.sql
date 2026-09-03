-- ============================================================================
--  Plan 70.3 — cumplimiento
--
--  Dos tablas mas, con el mismo prefijo rutina_. No tocan nada existente.
--  Idempotente: se puede correr dos veces.
-- ============================================================================

-- --------------------------------------------------------- actividades reales
-- Lo que de verdad se entreno, importado desde Strava.
create table if not exists public.rutina_actividad (
  strava_id      bigint primary key,
  fecha          date not null,
  disciplina     text not null,          -- nado | bici | corre | fuerza | caminata | otro
  sport_type     text,                   -- el tipo crudo de Strava, por si hace falta
  nombre         text,
  metros         integer  not null default 0,
  segundos       integer  not null default 0,
  desnivel       integer  not null default 0,
  calorias       integer,
  esfuerzo       integer,                -- relative effort
  importado_en   timestamptz not null default now()
);

comment on table public.rutina_actividad is
  'Actividades reales importadas de Strava, para comparar contra el plan.';

create index if not exists rutina_actividad_fecha_idx
  on public.rutina_actividad (fecha desc);

create index if not exists rutina_actividad_disc_idx
  on public.rutina_actividad (disciplina, fecha desc);

-- ------------------------------------------------------------ estado del dia
-- Distingue "no lo hice" de "decidi descansar". Sin esto, un descanso
-- deliberado se ve igual que un incumplimiento, y el cumplimiento miente.
create table if not exists public.rutina_dia (
  fecha          date primary key,
  descanso       boolean not null default false,
  nota           text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_dia is
  'Estado declarado del dia. descanso = true lo saca del calculo de cumplimiento.';

-- ------------------------------------------------------------------ seguridad
-- Igual que las otras: RLS encendido y sin politicas. Solo la secret key entra.
alter table public.rutina_actividad enable row level security;
alter table public.rutina_dia       enable row level security;

drop trigger if exists rutina_dia_touch on public.rutina_dia;
create trigger rutina_dia_touch
  before update on public.rutina_dia
  for each row execute function public.rutina_touch();

-- ---------------------------------------------------------------- comprobar
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'rutina_%';
-- Deben salir 6: actividad, dia, nota_semana, peso, sesion, wod.
