# Rutina 70.3 — Miguel

Panel de entrenamiento y nutrición para un macrociclo de 60 semanas
(7 sep 2026 → 31 oct 2027) con cuatro carreras:

| Semana | Fecha | Carrera |
|---|---|---|
| 9 | 8 nov 2026 | Triatlón olímpico (primera vez sobre los tres deportes seguidos) |
| 22 | 7 feb 2027 | Segundo olímpico — El Salvador, para probar sensaciones |
| 32 | ~18 abr 2027 | **Primer 70.3** — Monterrey |
| 59 | ~24 oct 2027 | Segundo 70.3 — Miami / Nueva York |

Angular 21 standalone, sin dependencias más allá del framework.

## Correrlo

```bash
npm install
npm start          # http://localhost:4200
```

Con `ng serve` no corren las funciones de `/api`, así que la app arranca en modo
local (todo en `localStorage`). Para probar con backend: `npx vercel dev`.

## Dónde se guarda el progreso

Peso, sesiones marcadas, WOD, notas, comidas y actividades viven en **Supabase**,
en el proyecto `AppCompe`. Las tablas llevan prefijo `rutina_` y no tocan nada de
lo que ya existía ahí.

El navegador **nunca** ve las llaves de Supabase. La app le pega a `/api/datos`,
una función serverless que valida el código de acceso y recién ahí habla con la
base usando la secret key desde variables de entorno:

```
Angular ──fetch + header x-codigo──▶ /api/datos ──secret key──▶ Supabase (RLS deny-all)
```

`localStorage` sigue existiendo, pero como caché: si el servidor está caído, el
dato se guarda igual y queda en una cola que se vacía sola cuando vuelve la
conexión. El indicador en la barra de navegación dice en qué modo estás.

### Puesta en marcha

1. Corré en el SQL Editor de Supabase, en orden:
   `supabase/migrations/0001_rutina_703.sql`, `0002_cumplimiento.sql`, `0003_strava.sql`.
2. En Vercel → Settings → Environment Variables, agregá dos:

   | Variable | Dónde sale |
   |---|---|
   | `SUPABASE_SECRET_KEY` | Settings → API Keys → Secret keys (`sb_secret_…`) |
   | `CODIGO_ACCESO` | El código que escribís al entrar |

3. Redeploy. Al abrir la app te pide el código una sola vez por dispositivo.

`SUPABASE_URL` es opcional: si falta, se usa la del proyecto que está en el
código (no es un secreto, viaja en el bundle de cualquier app de Supabase).

## Conectar Strava

Todo se hace desde la app, en **Cumplimiento**. No hay que tocar Vercel ni
volver a desplegar.

1. Creá una aplicación en [strava.com/settings/api](https://www.strava.com/settings/api):

   | Campo | Valor |
   |---|---|
   | Application Name | Rutina 70.3 |
   | Category | Training |
   | Website | `https://rutinas-two.vercel.app` |
   | **Authorization Callback Domain** | `rutinas-two.vercel.app` |

   Sin `https://` ni barras en el callback domain — solo el dominio. La propia
   app te muestra el valor exacto que corresponde al dominio desde el que la
   estás abriendo.

2. Pegá el **Client ID** y el **Client Secret** en el formulario de Cumplimiento
   y tocá *Guardar y conectar*. Autorizás una vez en Strava y listo.

Las credenciales y el token viven en `rutina_config`, en tu Supabase — no en
variables de entorno de Vercel. Dos razones:

- Una variable de entorno obliga a pasar por el panel o la CLI y a redesplegar.
  Un formulario escribe en la base y hace efecto en el acto.
- Strava puede rotar el refresh token al renovarlo. Una fila se reescribe sola;
  una variable de entorno no.

Si ya tenías `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` en Vercel siguen
sirviendo como respaldo. Gana lo que esté en la base, que es lo que se puede
corregir sin desplegar.

Después de conectar, la app sincroniza sola al abrirla, con tope de una vez cada
6 horas para no agotar el límite de peticiones de Strava. También hay un botón
manual y uno para desconectar.

### Y antes de conectar

`src/app/data/historial.seed.ts` trae 113 actividades reales de junio a
septiembre de 2026 dentro del bundle, para que **Cumplimiento sirva desde el
primer minuto**. Sin eso la página se vería vacía —como si no hubieras
entrenado— hasta terminar el trámite de OAuth. Cuando Strava esté conectado, lo
que baja de la API manda; la semilla solo rellena los huecos, deduplicada por
`strava_id`.

## Desplegarlo en Vercel

```bash
npx vercel --prod
```

`vercel.json` ya trae la configuración correcta (`outputDirectory: dist/rutina703/browser`
y el rewrite de SPA para que las rutas profundas no den 404). Si está conectado
a Git, con hacer push a `main` alcanza.

## Qué hay adentro

| Ruta | Qué muestra |
|---|---|
| `/` | Las sesiones de hoy, macros del día, campo para pegar el WOD de CrossFit |
| `/semana` | Los 7 días; al marcar se descuenta el volumen, comparación con Strava y el ajuste automático del plan |
| `/plan` | Las 60 semanas por bloques, zonas de FC y ritmos actuales vs. meta |
| `/nutricion` | Menús por tipo de día, registro de lo que comiste y suma corrida |
| `/peso` | Gráfica SVG de curva objetivo vs. registros reales |
| `/carreras` | Cuenta regresiva y proyección de tiempos por segmento |
| `/cumplimiento` | Lo planificado contra lo que dice Strava, día por día |

## Estructura

```
api/
├── datos.mjs               # única puerta a Supabase; valida el código de acceso
└── strava.mjs              # OAuth, refresco de token y sync incremental
supabase/migrations/
├── 0001_rutina_703.sql     # peso, sesion, wod, nota_semana + RLS deny-all
├── 0002_cumplimiento.sql   # actividad y dia (descanso + comidas)
└── 0003_strava.sql         # config: credenciales y tokens de Strava
src/app/
├── data/
│   ├── plan.data.ts        # 60 semanas y 15 bloques — GENERADO por gen_plan.py
│   ├── volumen.ts          # reparte el volumen semanal entre las sesiones
│   ├── adaptacion.ts       # sube el plan cuando entrena por encima de la meta
│   ├── nutricion.data.ts   # macros y menús — GENERADO por gen_data.py
│   ├── historial.seed.ts   # historial de Strava — GENERADO por gen_semilla.py
│   ├── comidas.ts          # normaliza los 4 menús para poder mezclarlos
│   ├── cumplimiento.ts     # veredicto de cada día contra el plan
│   ├── sesiones.data.ts    # biblioteca de sesiones y estructura semanal
│   └── carreras.data.ts    # carreras, proyecciones y punto de decisión
├── services/
│   ├── plan.service.ts     # qué semana/día es hoy, cuentas regresivas
│   ├── api.service.ts      # cliente de /api/datos y estado de conexión
│   ├── strava.service.ts   # configuración, autorización y sync
│   └── storage.service.ts  # caché local + cola de reintentos + sincronización
└── pages/                  # una por ruta, lazy-loaded
```

Los tres archivos marcados como GENERADO salen de scripts de Python que calculan
y **validan** los números: los menús caen dentro de ±3 % de su objetivo de kcal,
las fechas de carrera se verifican con asserts y el plan no deja más de cuatro
semanas de carga seguidas sin descarga. Si querés cambiar algo, es mejor tocar
el script y regenerar que editar el `.ts` a mano.

## Pruebas

```bash
node scripts/probar-api.mjs      # /api/datos contra un PostgREST simulado
node scripts/probar-strava.mjs   # OAuth, refresco y sync contra Strava simulada
node scripts/probar-volumen.mjs     # el reparto de volumen cuadra en las 60 semanas
node scripts/probar-adaptacion.mjs  # el plan sube cuando toca, y los frenos aguantan
```

Las dos levantan servidores de mentira en localhost: no tocan Supabase ni Strava
de verdad, y no necesitan credenciales.

## Recalibración del 4 sep 2026

El plan original salió de un diagnóstico conservador. Dos correcciones con datos reales:

- **Nado.** La larga del sábado arrancaba en 2,000 m. El historial de Strava muestra
  sesiones de 4,000 / 3,525 / 3,500 m y semanas de 7,150 / 6,700 / 5,100 m — 2,000 m
  está por debajo de lo que ya hace un sábado cualquiera. Se subió el piso 1,000 m en
  semanas de carga y 600 en descarga, con techo de 4,200 m. Las semanas de carrera no
  se tocaron: el sábado previo a competir es afinar, no acumular.
- **Bici.** Una clase de spinning son ~18 km, no los 12.5 que salían de repartir el
  total. Con dos clases fijas por semana, el total es `biciLarga + 36`. Sube las
  semanas iniciales (S1: 55 → 66 km, kilómetros que ya hacía y no se contaban) y baja
  las finales (S55: 170 → 146 km, que pedían un tercer día de bici que su agenda no
  tiene). En Strava el spinning entra con distancia 0, así que se estima a 18 km/h y
  la app dice cuántos km del total son estimados.

Ambas viven en `gen_plan.py` como un paso explícito sobre la tabla original, con
asserts que verifican que se aplicó.

## El plan se ajusta solo

Si entrena por encima de la meta, el plan sube. Es idea de Miguel y es como funciona el
entrenamiento de verdad: la carga se calibra contra lo que el cuerpo ya demostró, no contra
una tabla escrita hace meses.

También es la parte peligrosa. Un plan que sube cada vez que te pasás y que nunca baja
**compone**: +20 % semanal sostenido triplica el volumen en dos meses. Por eso hay tres frenos:

| Freno | Qué hace |
|---|---|
| `TOPE_SEMANAL` = 1.20 | El factor no crece más de 20 % de una semana a la otra, por mucho que se haya pasado |
| `TECHO_FACTOR` = 1.50 | Nunca se aleja más de 50 % del plan diseñado. Más que eso es rehacer el plan, no dejarlo escalar |
| `TECHOS` | Topes absolutos por semana, por si los dos anteriores fallan |

Y dos reglas que no se negocian: **las semanas de descarga y de carrera no se ajustan**
(si la recuperación sube con el resto deja de ser recuperación), y **el factor nunca baja**
— una semana floja no castiga.

No guarda estado: se recalcula desde `rutina_actividad` cada vez, así que si una actividad se
borra o se corrige en Strava, el ajuste se corrige solo. Se puede apagar desde la vista Semana.

## De dónde salen los números

Los ritmos no son genéricos: están calibrados con las actividades reales de
Strava. Natación mucho más sólida de lo que parecía (sesiones de 3.5–4 km a
2:12–2:20/100 m, semanas de hasta 7,150 m), media maratón del 23 ago 2026, y la bici como el punto débil
real — salidas de 16 a 19 km con 150–200 m de desnivel. El plan carga ahí.
