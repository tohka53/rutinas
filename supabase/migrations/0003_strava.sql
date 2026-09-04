-- ============================================================================
--  Plan 70.3 — conexion con Strava
--
--  Una tabla de configuracion para guardar los tokens de OAuth. Van aca y no
--  en variables de entorno de Vercel por dos razones:
--    1. Son dos variables menos que configurar a mano.
--    2. Strava puede rotar el refresh token al renovarlo. Una variable de
--       entorno no se puede reescribir sola; una fila si.
--
--  Prefijo rutina_ como todo lo demas. RLS deny-all: solo la secret key entra,
--  y esa vive del lado del servidor.
-- ============================================================================

create table if not exists public.rutina_config (
  clave          text primary key,
  valor          text,
  actualizado_en timestamptz not null default now()
);

comment on table public.rutina_config is
  'Configuracion interna. Guarda los tokens de Strava (refresh, access, expiracion) '
  'y la marca del ultimo sync. Nunca se expone al navegador.';

alter table public.rutina_config enable row level security;

drop trigger if exists rutina_config_touch on public.rutina_config;
create trigger rutina_config_touch
  before update on public.rutina_config
  for each row execute function public.rutina_touch();

-- ---------------------------------------------------------------- comprobar
-- select table_name from information_schema.tables
--  where table_schema = 'public' and table_name like 'rutina_%';
-- Deben salir 7: actividad, config, dia, nota_semana, peso, sesion, wod.
