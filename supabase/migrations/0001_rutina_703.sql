-- ============================================================================
--  Plan 70.3 — tablas de progreso
--  Proyecto Supabase: AppCompe (mlpdqxpdvxhpsgspkccn)
--
--  Todo lleva el prefijo `rutina_` para no chocar con nada de lo que ya existe
--  en este proyecto. Nada de este script toca tablas, tipos ni funciones ajenas.
--  Es idempotente: se puede correr dos veces sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------- peso
create table if not exists public.rutina_peso (
  fecha          date primary key,
  kg             numeric(5,1) not null check (kg > 40 and kg < 250),
  nota           text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_peso is
  'Registro de peso del plan 70.3. Una fila por fecha de pesaje.';

-- ---------------------------------------------------------------- sesiones
create table if not exists public.rutina_sesion (
  fecha          date not null,
  indice         smallint not null check (indice >= 0 and indice < 10),
  disciplina     text,
  titulo         text,
  hecha          boolean not null default false,
  nota           text,
  actualizado_en timestamptz not null default now(),
  primary key (fecha, indice)
);

comment on table public.rutina_sesion is
  'Sesiones marcadas como cumplidas. indice = posicion de la sesion dentro del dia.';

create index if not exists rutina_sesion_fecha_idx
  on public.rutina_sesion (fecha desc);

create index if not exists rutina_sesion_hecha_idx
  on public.rutina_sesion (hecha) where hecha;

-- ---------------------------------------------------------------- WOD
create table if not exists public.rutina_wod (
  fecha          date primary key,
  texto          text not null,
  escalado       text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_wod is
  'WOD de CrossFit pegado por dia, mas como se escalo.';

-- ---------------------------------------------------------- notas de semana
create table if not exists public.rutina_nota_semana (
  semana         smallint primary key check (semana between 1 and 26),
  sensaciones    text,
  sueno          smallint check (sueno between 1 and 5),
  energia        smallint check (energia between 1 and 5),
  molestias      text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_nota_semana is
  'Sensaciones, sueno, energia y molestias por semana del plan. Senal temprana de sobreentrenamiento.';

-- ============================================================================
--  Seguridad
--
--  RLS encendido y SIN politicas => la publishable key (sb_publishable_...)
--  no puede leer ni escribir absolutamente nada de estas tablas.
--
--  El unico acceso es con la secret key (sb_secret_...), que salta RLS y vive
--  exclusivamente en las variables de entorno de Vercel, del lado del servidor.
--  Nunca llega al navegador.
-- ============================================================================
alter table public.rutina_peso        enable row level security;
alter table public.rutina_sesion      enable row level security;
alter table public.rutina_wod         enable row level security;
alter table public.rutina_nota_semana enable row level security;

-- ------------------------------------------------- actualizado_en automatico
create or replace function public.rutina_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists rutina_peso_touch on public.rutina_peso;
create trigger rutina_peso_touch
  before update on public.rutina_peso
  for each row execute function public.rutina_touch();

drop trigger if exists rutina_sesion_touch on public.rutina_sesion;
create trigger rutina_sesion_touch
  before update on public.rutina_sesion
  for each row execute function public.rutina_touch();

drop trigger if exists rutina_wod_touch on public.rutina_wod;
create trigger rutina_wod_touch
  before update on public.rutina_wod
  for each row execute function public.rutina_touch();

drop trigger if exists rutina_nota_semana_touch on public.rutina_nota_semana;
create trigger rutina_nota_semana_touch
  before update on public.rutina_nota_semana
  for each row execute function public.rutina_touch();

-- ---------------------------------------------------------------- comprobar
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'rutina_%';
