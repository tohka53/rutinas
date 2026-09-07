-- ============================================================================
--  Plan 70.3 — guardar todo lo que Strava devuelve de cada actividad
--
--  Por que hace falta.
--
--  El estudio del 7 sep 2026 encontro que las zonas cardiacas configuradas en
--  Strava asumen un maximo de ~192 lpm, y que en 113 actividades reales —una
--  media maraton de tres horas incluida— la FC nunca paso de 171. Ese hallazgo
--  cambia como se prescribe cada sesion, pero era un hallazgo de un documento,
--  no de la app: rutina_actividad guardaba distancia, tiempo, desnivel,
--  calorias y esfuerzo, y nada mas. Sin FC el dashboard no lo puede recalcular
--  solo, y un numero escrito a mano en el codigo envejece en silencio.
--
--  Ya que hay que tocar la tabla, se guarda TODO lo que el listado de
--  actividades de Strava trae y sirve para analizar. Son campos que ya vienen
--  en la misma respuesta: no cuestan ni una peticion extra, y cada uno que no
--  se guarda hoy es una pregunta que no se va a poder responder manana sobre el
--  historial viejo.
--
--  Lo que se agrega y por que:
--
--    fc_media, fc_max     Calibrar las zonas. El motivo original.
--    cadencia             Sirve en las tres disciplinas: brazadas por minuto
--                         nadando, pasos corriendo, rpm en la bici. Es la
--                         variable tecnica que mas rapido mejora.
--    vel_media, vel_max   Ritmo sin tener que dividir, y el pico de la sesion.
--    watts_medios,        Potencia en bici. Es lo que va a poner el FTP en su
--    watts_max,           lugar cuando haya medidor; hasta entonces queda null
--    watts_ponderados,    y se ve que falta.
--    kilojoules
--    watts_de_medidor     false = Strava los estimo. Un watt estimado no sirve
--                         para calcular FTP y hay que poder distinguirlo.
--    segundos_totales     Tiempo total contra tiempo en movimiento. La
--                         diferencia es descanso: en un WOD o en una serie eso
--                         es la mitad de la informacion.
--    indoor               Lo dice Strava (trainer). Hoy el rodillo y el
--                         spinning se detectan por "distancia = 0", que es una
--                         corazonada; esto es el dato.
--    tipo_entreno         Strava marca carrera / tirada larga / entreno. Una
--                         carrera no se compara contra un domingo suave.
--    inicio               Fecha y hora exactas. La hora del dia explica FC
--                         altas: no es lo mismo correr a las 6 que a mediodia.
--    equipo               Que bici o que zapatos. Kilometraje por par.
--    prs, logros          Cuando hubo record personal. Es la senal mas limpia
--                         de que una sesion fue de verdad buena.
--
--  Todos nulos permitidos a proposito: las actividades viejas no los traen
--  hasta que se resincronice, y una sesion sin banda, sin medidor o sin GPS
--  tampoco. El dashboard distingue "no hay dato" de "cero" y no promedia nulos.
--
--  Despues de correr esto hay que resincronizar el historial completo:
--  el boton "Traer todo de nuevo" de la pantalla de Cumplimiento, o
--      /api/strava?accion=sync&desde=<epoch>
-- ============================================================================

alter table public.rutina_actividad
  add column if not exists fc_media          numeric,
  add column if not exists fc_max            numeric,
  add column if not exists cadencia          numeric,
  add column if not exists vel_media         numeric,
  add column if not exists vel_max           numeric,
  add column if not exists watts_medios      numeric,
  add column if not exists watts_max         numeric,
  add column if not exists watts_ponderados  numeric,
  add column if not exists kilojoules        numeric,
  add column if not exists watts_de_medidor  boolean,
  add column if not exists segundos_totales  integer,
  add column if not exists indoor            boolean,
  add column if not exists tipo_entreno      integer,
  add column if not exists inicio            timestamptz,
  add column if not exists equipo            text,
  add column if not exists prs               integer,
  add column if not exists logros            integer;

comment on column public.rutina_actividad.fc_media is
  'Frecuencia cardiaca media, en lpm. Null si no se registro.';
comment on column public.rutina_actividad.fc_max is
  'Frecuencia cardiaca maxima, en lpm. El maximo observado sobre todas las '
  'actividades es lo que calibra las zonas.';
comment on column public.rutina_actividad.cadencia is
  'Cadencia media. Brazadas/min nadando, pasos/min corriendo, rpm en bici.';
comment on column public.rutina_actividad.vel_media is 'Velocidad media en m/s.';
comment on column public.rutina_actividad.vel_max is 'Velocidad maxima en m/s.';
comment on column public.rutina_actividad.watts_de_medidor is
  'true = potencia de un medidor real. false = Strava la estimo, no sirve para FTP.';
comment on column public.rutina_actividad.segundos_totales is
  'Tiempo total (elapsed). Contra segundos (moving), la diferencia es descanso.';
comment on column public.rutina_actividad.indoor is
  'Rodillo o spinning, segun Strava. Reemplaza la corazonada de "distancia = 0".';
comment on column public.rutina_actividad.tipo_entreno is
  'workout_type de Strava. Corriendo: 1 = carrera, 2 = tirada larga, 3 = entreno.';
comment on column public.rutina_actividad.inicio is
  'Fecha y hora local de inicio. La hora del dia explica FC altas por calor.';
comment on column public.rutina_actividad.equipo is
  'gear_id de Strava: que bici o que par de zapatos se uso.';

-- Consultar por fecha es lo que mas hace el dashboard, y la tabla ya crece.
create index if not exists rutina_actividad_fecha_idx
  on public.rutina_actividad (fecha desc);

-- ---------------------------------------------------------------- comprobar
-- select count(*) as total,
--        count(fc_max)   as con_fc,
--        count(cadencia) as con_cadencia,
--        count(*) filter (where watts_de_medidor) as con_medidor,
--        max(fc_max)     as fc_max_observada
--   from public.rutina_actividad;
--
-- Antes de resincronizar: con_fc = 0. Despues, con_fc deberia acercarse al
-- total y fc_max_observada rondar 171.
