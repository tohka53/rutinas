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
src/app/
├── data/
│   ├── plan.data.ts        # 26 semanas — GENERADO por gen_plan.py
│   ├── nutricion.data.ts   # macros y menús — GENERADO por gen_data.py
│   ├── sesiones.data.ts    # biblioteca de sesiones y estructura semanal
│   └── carreras.data.ts    # carreras, proyecciones y punto de decisión
├── services/
│   ├── plan.service.ts     # qué semana/día es hoy, cuentas regresivas
│   └── storage.service.ts  # localStorage con try/catch
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
