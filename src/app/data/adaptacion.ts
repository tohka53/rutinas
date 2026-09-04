import type { Semana } from './plan.data';
import { totalizar, type Actividad } from './cumplimiento';

/**
 * El plan se sube solo cuando Miguel entrena por encima de lo que pedía.
 *
 * La idea es suya: "si hago más metros, que lo revise con Strava y aumente la
 * cantidad que hice". Es como funciona el entrenamiento de verdad — la carga se
 * calibra contra lo que el cuerpo ya demostró, no contra una tabla escrita hace
 * meses. El plan original ya se quedó corto una vez: pedía 2,000 m de nado un
 * sábado cuando él ya había hecho 4,000.
 *
 * Y también es la parte peligrosa. Un plan que sube cada vez que te pasás, y
 * que nunca baja, compone: +20 % semanal sostenido triplica el volumen en dos
 * meses. Por eso hay tres frenos, y los tres importan:
 *
 *   1. TOPE_SEMANAL — el factor no puede crecer más de 20 % de una semana a la
 *      otra, por mucho que se haya pasado. Un sábado enorme no reescribe el mes.
 *   2. TECHO_FACTOR — nunca se aleja más de 50 % del plan diseñado. Si hace
 *      falta más que eso, el plan está mal y hay que rehacerlo a mano, no
 *      dejarlo escalar solo.
 *   3. TECHOS — topes absolutos por semana, por si los dos anteriores fallan.
 *
 * Y dos reglas que no se negocian:
 *
 *   - Las semanas de descarga y de carrera NO se ajustan. Si la recuperación
 *     sube con el resto, deja de ser recuperación y el plan pierde lo único
 *     que evita que se rompa.
 *   - El factor nunca baja. Una semana floja no castiga: eso ya lo decidió
 *     Miguel para el cumplimiento y vale igual acá.
 *
 * No guarda nada. Se recalcula desde `rutina_actividad` cada vez, así que si
 * una actividad se borra o se corrige en Strava, el ajuste se corrige solo.
 */

/** Cuánto puede crecer el factor de una semana a la siguiente. */
export const TOPE_SEMANAL = 1.20;

/** Cuánto puede alejarse, como máximo, del plan diseñado. */
export const TECHO_FACTOR = 1.50;

/** Topes absolutos por semana. La última red, en las unidades de cada campo. */
export const TECHOS = { nadoM: 10000, biciKm: 220, correKm: 50, horas: 18 } as const;

export type CampoAjustable = 'nadoM' | 'biciKm' | 'correKm' | 'horas';
export const CAMPOS: CampoAjustable[] = ['nadoM', 'biciKm', 'correKm', 'horas'];

export const ETIQUETA_CAMPO: Record<CampoAjustable, string> = {
  nadoM: 'Natación', biciKm: 'Bici', correKm: 'Carrera', horas: 'Horas',
};

export type Factores = Record<CampoAjustable, number>;
export const SIN_AJUSTE: Factores = { nadoM: 1, biciKm: 1, correKm: 1, horas: 1 };

/** Una subida concreta, para poder mostrar de dónde salió el ajuste. */
export interface PasoAdaptacion {
  semana: number;
  fin: string;
  campo: CampoAjustable;
  pedido: number;
  real: number;
  antes: number;
  despues: number;
  /** true si el freno de +20 % le impidió llegar a lo que hizo de verdad. */
  frenado: boolean;
}

export interface Adaptacion {
  factores: Factores;
  pasos: PasoAdaptacion[];
}

function realesDe(s: Semana, actividades: readonly Actividad[]): Factores | null {
  const dentro = actividades.filter(a => a.fecha >= s.inicio && a.fecha <= s.fin);
  if (!dentro.length) return null;
  const t = totalizar(dentro);
  return { nadoM: t.nadoM, biciKm: t.biciKm, correKm: t.correKm, horas: t.horas };
}

/**
 * Recorre las semanas ya cerradas y va subiendo el factor de cada disciplina.
 *
 * Se camina semana por semana en vez de mirar solo la última: así el tope de
 * +20 % se aplica tantas veces como semanas pasaron, que es lo que hace que la
 * subida sea gradual y no un salto.
 */
export function calcularAdaptacion(
  semanas: readonly Semana[],
  actividades: readonly Actividad[],
  hoy: string,
): Adaptacion {
  const f: Factores = { ...SIN_AJUSTE };
  const pasos: PasoAdaptacion[] = [];

  for (const s of semanas) {
    if (s.fin >= hoy) break;                 // la semana todavía no cierra
    if (s.descarga || s.carrera) continue;   // descarga y carrera no mueven nada
    const real = realesDe(s, actividades);
    if (!real) continue;                     // sin datos no se concluye nada

    for (const campo of CAMPOS) {
      const base = s[campo];
      if (!base) continue;
      const pedido = base * f[campo];
      if (real[campo] <= pedido) continue;   // no se pasó: el factor queda igual

      const deseado = real[campo] / base;
      const topado = Math.min(deseado, f[campo] * TOPE_SEMANAL, TECHO_FACTOR);
      if (topado <= f[campo] + 1e-9) continue;

      pasos.push({
        semana: s.n, fin: s.fin, campo,
        pedido: redondear(campo, pedido),
        real: redondear(campo, real[campo]),
        antes: f[campo], despues: topado,
        frenado: topado < deseado - 1e-9,
      });
      f[campo] = topado;
    }
  }
  return { factores: f, pasos };
}

function redondear(campo: CampoAjustable, v: number): number {
  return campo === 'nadoM' ? Math.round(v) : +v.toFixed(1);
}

/**
 * Escala el primer número de un texto como "50 km Z2 + 15' trote".
 *
 * `paso` es a cuánto se redondea: 100 para metros de nado, 1 para kilómetros.
 * Un "35.9 km Z2" en el título no le sirve a nadie arriba de la bici.
 */
function escalarTexto(txt: string, factor: number, paso: number): string {
  return txt.replace(/\d+(?:\.\d+)?/, m =>
    String(Math.round((Number(m) * factor) / paso) * paso));
}

/**
 * Devuelve la semana con los objetivos ya ajustados.
 *
 * Las sesiones largas suben en la misma proporción que su disciplina, con el
 * factor ya recortado por los techos: si el total se topó, la larga también,
 * y el reparto de `volumen.ts` sigue cuadrando.
 */
export function aplicarAdaptacion(s: Semana, f: Factores): Semana {
  if (s.descarga || s.carrera) return s;
  if (CAMPOS.every(c => f[c] === 1)) return s;

  const tope = (campo: CampoAjustable, v: number) =>
    Math.min(TECHOS[campo], v * f[campo]);

  const nadoM = Math.round(tope('nadoM', s.nadoM) / 100) * 100;
  const biciKm = Math.round(tope('biciKm', s.biciKm));
  const correKm = Math.round(tope('correKm', s.correKm));
  const horas = +tope('horas', s.horas).toFixed(1);

  // El factor efectivo es el que sobrevivió a los techos y al redondeo. Usar el
  // crudo dejaría la sesión larga pidiendo más de lo que suma la semana.
  const ef = (campo: CampoAjustable, ajustado: number) =>
    s[campo] ? ajustado / s[campo] : 1;

  return {
    ...s,
    nadoM, biciKm, correKm, horas,
    nadoLargo: escalarTexto(s.nadoLargo, ef('nadoM', nadoM), 100),
    biciLarga: escalarTexto(s.biciLarga, ef('biciKm', biciKm), 1),
    correLarga: escalarTexto(s.correLarga, ef('correKm', correKm), 1),
  };
}

/** Resumen legible: qué disciplinas subieron y cuánto. */
export function resumen(f: Factores): { campo: CampoAjustable; pct: number }[] {
  return CAMPOS
    .filter(c => f[c] > 1.001)
    .map(c => ({ campo: c, pct: Math.round((f[c] - 1) * 100) }));
}
