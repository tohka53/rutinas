-- ============================================================================
--  Plan 70.3 — migraciones 0002 y 0003 en un solo bloque
--
--  Pegar TODO esto en el SQL Editor de Supabase (proyecto AppCompe) y correr.
--  Se puede correr mas de una vez sin romper nada: todo va con
--  "if not exists" / "drop ... if exists".
--
--  Crea tres tablas, todas con prefijo rutina_ y RLS deny-all:
--    rutina_actividad  lo que baja de Strava
--    rutina_dia        descanso deliberado + comidas registradas del dia
--    rutina_config     credenciales y tokens de Strava
--
--  No toca ninguna tabla que ya existiera en el proyecto.
--  Requiere que 0001_rutina_703.sql ya haya corrido (de ahi sale rutina_touch).
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

-- Que comio en cada tiempo, mezclando menus de distinto tipo de dia.
-- Formato: {"desayuno": "ligero|Desayuno", "cena": "fuerte|Cena post-entreno"}
-- Va como jsonb y no como tabla aparte porque siempre se lee junto con el dia.
alter table public.rutina_dia
  add column if not exists comidas jsonb not null default '{}'::jsonb;

-- ------------------------------------------------- configuracion de Strava
-- Client id, client secret y tokens. Van aca y no en variables de entorno de
-- Vercel por dos razones: son variables menos que configurar a mano, y Strava
-- puede rotar el refresh token al renovarlo. Una variable de entorno no se
-- reescribe sola; una fila si.
create table if not exists public.rutina_config (
  clave          text primary key,
  valor          text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_config is
  'Configuracion interna: credenciales y tokens de Strava, y la marca del '
  'ultimo sync. Nunca se expone al navegador.';

-- ------------------------------------------------------------------ seguridad
-- Igual que las otras: RLS encendido y sin politicas. Solo la secret key entra,
-- y esa vive del lado del servidor.
alter table public.rutina_actividad enable row level security;
alter table public.rutina_dia       enable row level security;
alter table public.rutina_config    enable row level security;

drop trigger if exists rutina_dia_touch on public.rutina_dia;
create trigger rutina_dia_touch
  before update on public.rutina_dia
  for each row execute function public.rutina_touch();

drop trigger if exists rutina_config_touch on public.rutina_config;
create trigger rutina_config_touch
  before update on public.rutina_config
  for each row execute function public.rutina_touch();

-- ------------------------------------------------------------------ comprobar
-- Esto corre al final y te muestra el resultado. Tienen que salir 7 filas:
-- actividad, config, dia, nota_semana, peso, sesion, wod.
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name like 'rutina_%'
 order by table_name;
