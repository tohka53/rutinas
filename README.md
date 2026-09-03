# Rutina 70.3 — Miguel

Dashboard de entrenamiento y nutrición hacia el **Gran Jaguar 70.3** (Flores, Petén — 28 nov 2026),
con el triatlón olímpico del 8 de noviembre como carrera preparatoria.

Angular 21 standalone, sin dependencias externas más allá del framework. Todo el progreso se
guarda en `localStorage` del navegador.

## Correrlo

```bash
npm install
npm start          # http://localhost:4200
```

Con `ng serve` no corren las funciones de `/api`, así que la app arranca en modo
local (todo en `localStorage`). Para probar con backend: `npx vercel dev`.

## Dónde se guarda el progreso

Peso, sesiones marcadas, WOD y notas semanales viven en **Supabase**, en el proyecto
`AppCompe`. Las cuatro tablas llevan prefijo `rutina_` y no tocan nada de lo que ya
existía ahí.

El navegador **nunca** ve las llaves de Supabase. La app le pega a `/api/datos`, una
función serverless que valida el código de acceso y recién ahí habla con la base
usando la secret key desde variables de entorno:

```
Angular ──fetch + header x-codigo──▶ /api/datos ──secret key──▶ Supabase (RLS deny-all)
```

`localStorage` sigue existiendo, pero como caché: si el servidor está caído, el dato
se guarda igual y queda en una cola que se vacía sola cuando vuelve la conexión.
El indicador en la barra de navegación dice en qué modo estás.

### Puesta en marcha

1. Corré `supabase/migrations/0001_rutina_703.sql` en el SQL Editor de Supabase.
2. En Vercel → Settings → Environment Variables, agregá las tres:

   | Variable | Dónde sale |
   |---|---|
   | `SUPABASE_URL` | `https://<project-id>.supabase.co` |
   | `SUPABASE_SECRET_KEY` | Settings → API Keys → Secret keys (`sb_secret_…`) |
   | `CODIGO_ACCESO` | El código que escribís al entrar |

3. Redeploy. Al abrir la app te pide el código una sola vez por dispositivo.

Ninguno de esos tres valores va en el repo.

## Desplegarlo en Vercel

```bash
npx vercel --prod
```

`vercel.json` ya trae la configuración correcta (`outputDirectory: dist/rutina703/browser`
y el rewrite de SPA para que las rutas profundas no den 404).

Si preferís conectarlo a Git, subilo a un repo y desde el dashboard de Vercel importalo:
el framework se autodetecta como Angular y `vercel.json` hace el resto.

## Qué hay adentro

| Ruta | Qué muestra |
|---|---|
| `/` | Las sesiones de hoy, macros del día, campo para pegar el WOD de CrossFit |
| `/semana` | Los 7 días con checkboxes y barra de avance |
| `/plan` | Las 26 semanas completas, zonas de FC y ritmos actuales vs. meta |
| `/nutricion` | Menús por tipo de día, tabla de alimentos y calculadora de porciones |
| `/peso` | Gráfica SVG de curva objetivo vs. registros reales |
| `/carreras` | Cuenta regresiva y proyección de tiempos por segmento |

## Estructura

```
api/
└── datos.mjs               # única puerta a Supabase; valida el código de acceso
supabase/migrations/
└── 0001_rutina_703.sql     # las 4 tablas rutina_*, con RLS deny-all
src/app/
├── data/
│   ├── plan.data.ts        # 26 semanas — GENERADO por gen_plan.py
│   ├── nutricion.data.ts   # macros y menús — GENERADO por gen_data.py
│   ├── sesiones.data.ts    # biblioteca de sesiones y estructura semanal
│   └── carreras.data.ts    # carreras, proyecciones y punto de decisión
├── services/
│   ├── plan.service.ts     # qué semana/día es hoy, cuentas regresivas
│   ├── api.service.ts      # cliente de /api/datos y estado de conexión
│   └── storage.service.ts  # caché local + cola de reintentos + sincronización
└── pages/                  # una por ruta, lazy-loaded
```

Los dos archivos marcados como GENERADO salen de scripts de Python que calculan y **validan**
los números (los menús caen dentro de ±3 % de su objetivo de kcal, y las fechas de carrera se
verifican con asserts). Si querés cambiar el plan, es mejor tocar el script y regenerar que
editar el `.ts` a mano.

## De dónde salen los números

Los ritmos no son genéricos: están calibrados con las actividades reales de Strava
(natación de 2600 m a 2:14/100 m, media maratón del 23 ago, la única salida de bici de 12 km,
y las zonas de FC configuradas en el perfil).
