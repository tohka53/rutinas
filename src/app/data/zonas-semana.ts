import type { Actividad } from './cumplimiento';
import { lunesDe } from './rendimiento';
import { zonaDe, type ZonaConfigurada } from './fisiologia';

/**
 * Cómo se repartió la intensidad, semana a semana.
 *
 * La tarjeta de zonas dice cuántas horas cayeron en cada zona en todo el
 * historial. Eso sirve una vez, para descubrir que la tabla estaba mal
 * calibrada, y después deja de decir nada: un total de 13 semanas no distingue
 * una semana bien repartida de una mal repartida, solo las promedia.
 *
 * Lo que sí se puede corregir cada lunes es el reparto de ESTA semana. Y el
 * error que más frecuentemente arruina un plan de resistencia no es entrenar
 * poco: es entrenar todo a intensidad media. El fondo sale demasiado rápido
 * para ser fondo, las series salen demasiado suaves para ser series, y el
 * resultado es mucho cansancio con poca adaptación. Tiene nombre —la zona
 * gris— y solo se ve mirando la distribución, nunca el volumen.
 *
 * Por eso las cinco zonas se agrupan en tres bandas:
 *
 *   fácil  Z1 + Z2   donde debe vivir la mayor parte del plan
 *   medio  Z3        la zona gris: cuanto menos, mejor
 *   duro   Z4 + Z5   el trabajo de calidad, que tiene que ser poco y de verdad
 *
 * Tres bandas y no cinco porque es lo que se puede leer de un vistazo y lo que
 * se puede accionar: cinco segmentos apilados por semana se vuelven un adorno.
 * El detalle por zona sigue estando en la tabla.
 */

/** Qué banda le toca a cada zona, por índice (Z1 = 0). */
export const BANDA_DE_ZONA: readonly ('facil' | 'medio' | 'duro')[] =
  ['facil', 'facil', 'medio', 'duro', 'duro'];

export type Banda = 'facil' | 'medio' | 'duro';
export const BANDAS: Banda[] = ['facil', 'medio', 'duro'];

export const ETIQUETA_BANDA: Record<Banda, string> = {
  facil: 'Fácil', medio: 'Medio', duro: 'Duro',
};

export const DESCRIPCION_BANDA: Record<Banda, string> = {
  facil: 'Z1–Z2 · fondo, rodaje, nado continuo',
  medio: 'Z3 · la zona gris',
  duro: 'Z4–Z5 · umbral y series',
};

/**
 * El reparto al que conviene apuntar.
 *
 * Es el modelo polarizado que sale del trabajo de Seiler sobre atletas de
 * resistencia: la mayor parte del tiempo claramente fácil, una porción chica
 * claramente dura, y lo mínimo posible en el medio. No es una ley — es una
 * referencia contra la que mirar el reparto propio, y por eso la pantalla la
 * muestra como banda y no como aprobado/reprobado.
 */
export const OBJETIVO_REPARTO: Record<Banda, number> = {
  facil: 0.75, medio: 0.10, duro: 0.15,
};

/** Cuánto puede alejarse del objetivo antes de que valga la pena señalarlo. */
export const TOLERANCIA_REPARTO = 0.12;

export interface SemanaIntensidad {
  lunes: string;
  /** Horas en cada zona, en el orden de la tabla configurada. */
  porZona: number[];
  /** Horas por banda. */
  facil: number; medio: number; duro: number;
  /** Horas totales con frecuencia cardíaca. */
  total: number;
  /** Fracción de cada banda sobre el total. 0 si la semana está vacía. */
  pctFacil: number; pctMedio: number; pctDuro: number;
  /** Sesiones que aportaron, y las que no por no tener FC. */
  sesiones: number; sinFC: number;
  /** true cuando no hubo ni una sesión con FC. */
  vacia: boolean;
}

/**
 * Reparte las horas de cada semana entre las zonas configuradas.
 *
 * Usa la FC media de cada sesión, que es una aproximación gruesa y conviene
 * tenerlo presente: una sesión de series pasa por varias zonas y acá cuenta
 * entera en una sola. Alcanza para lo que se quiere ver —si el reparto está
 * aplastado en el medio— y el detalle real exigiría los streams de Strava, una
 * petición por actividad.
 *
 * Las sesiones sin FC se cuentan aparte en vez de descartarse en silencio: si
 * media semana no trae pulsómetro, el reparto que se ve no describe la semana
 * y hay que poder saberlo.
 */
export function distribucionPorSemana(
  actividades: readonly Actividad[],
  zonas: readonly ZonaConfigurada[] | null,
  desde: string,
  hasta: string,
): SemanaIntensidad[] {
  if (!zonas?.length) return [];

  const mapa = new Map<string, SemanaIntensidad>();
  const nueva = (lunes: string): SemanaIntensidad => ({
    lunes, porZona: new Array(zonas.length).fill(0),
    facil: 0, medio: 0, duro: 0, total: 0,
    pctFacil: 0, pctMedio: 0, pctDuro: 0,
    sesiones: 0, sinFC: 0, vacia: true,
  });

  for (const a of actividades) {
    if (a.fecha < desde || a.fecha > hasta) continue;
    if (a.disciplina === 'caminata') continue;   // salud, no entrenamiento

    const l = lunesDe(a.fecha);
    let s = mapa.get(l);
    if (!s) { s = nueva(l); mapa.set(l, s); }

    const fc = a.fc_media;
    if (typeof fc !== 'number' || !(fc > 0)) { s.sinFC++; continue; }

    const i = zonaDe(fc, zonas);
    if (i < 0) { s.sinFC++; continue; }

    const horas = a.segundos / 3600;
    s.porZona[i] += horas;
    s[BANDA_DE_ZONA[i] ?? 'medio'] += horas;
    s.total += horas;
    s.sesiones++;
    s.vacia = false;
  }

  const salida = [...mapa.values()].sort((a, b) => a.lunes.localeCompare(b.lunes));
  for (const s of salida) {
    if (s.total > 0) {
      s.pctFacil = s.facil / s.total;
      s.pctMedio = s.medio / s.total;
      s.pctDuro = s.duro / s.total;
    }
    s.porZona = s.porZona.map(h => +h.toFixed(2));
    s.facil = +s.facil.toFixed(2);
    s.medio = +s.medio.toFixed(2);
    s.duro = +s.duro.toFixed(2);
    s.total = +s.total.toFixed(2);
  }
  return salida;
}

export interface ResumenIntensidad {
  /** El reparto medio de las últimas semanas, ponderado por horas. */
  pctFacil: number; pctMedio: number; pctDuro: number;
  semanas: number;
  horas: number;
  /** Qué se aleja del objetivo, si algo. */
  avisos: string[];
}

/**
 * El reparto de las últimas semanas, para juzgar la tendencia y no una semana.
 *
 * Ponderado por horas y no promediando porcentajes: una semana de 1 hora no
 * puede pesar lo mismo que una de 12 al decir cómo se reparte el entrenamiento.
 * Es el mismo error que ya se había corregido en las tendencias de ritmo.
 */
export function resumenIntensidad(
  semanas: readonly SemanaIntensidad[],
  ventana = 4,
): ResumenIntensidad {
  const conDatos = semanas.filter(s => !s.vacia).slice(-ventana);
  const horas = conDatos.reduce((a, s) => a + s.total, 0);
  const avisos: string[] = [];

  if (!horas) {
    return { pctFacil: 0, pctMedio: 0, pctDuro: 0, semanas: 0, horas: 0,
             avisos: ['Todavía no hay semanas con frecuencia cardíaca para comparar.'] };
  }

  const facil = conDatos.reduce((a, s) => a + s.facil, 0) / horas;
  const medio = conDatos.reduce((a, s) => a + s.medio, 0) / horas;
  const duro = conDatos.reduce((a, s) => a + s.duro, 0) / horas;

  if (medio > OBJETIVO_REPARTO.medio + TOLERANCIA_REPARTO) {
    avisos.push(
      `${Math.round(medio * 100)} % del tiempo cae en la zona gris (objetivo: ` +
      `${Math.round(OBJETIVO_REPARTO.medio * 100)} %). Es el reparto que más cansa ` +
      'y menos adapta: el fondo sale rápido y las series salen flojas.');
  }
  if (facil < OBJETIVO_REPARTO.facil - TOLERANCIA_REPARTO) {
    avisos.push(
      `Solo ${Math.round(facil * 100)} % del tiempo es claramente fácil (objetivo: ` +
      `${Math.round(OBJETIVO_REPARTO.facil * 100)} %). La base aeróbica se construye ahí.`);
  }
  if (duro > OBJETIVO_REPARTO.duro + TOLERANCIA_REPARTO) {
    avisos.push(
      `${Math.round(duro * 100)} % en duro es mucho para sostener 60 semanas. ` +
      'La intensidad rinde cuando es poca y de verdad.');
  }

  return {
    pctFacil: facil, pctMedio: medio, pctDuro: duro,
    semanas: conDatos.length, horas: +horas.toFixed(1), avisos,
  };
}

/**
 * Rampa ordinal para las tres bandas: un solo tono, claridad creciente.
 *
 * Las bandas tienen orden —fácil, medio, duro es una escala de intensidad, no
 * tres categorías sueltas—, así que el color tiene que dejarlo ver: mismo tono,
 * más claro cuanto más duro. Colores distintos por banda dirían "son tres cosas
 * diferentes" en vez de "son tres puntos de la misma escala".
 *
 * Sobre fondo oscuro la escala va de apagado a brillante, así una barra sana se
 * ve mayormente apagada y una barra mal repartida salta a la vista sola.
 *
 * Validados contra el fondo #131a22: claridad monótona (OKLab L 0.51 · 0.71 ·
 * 0.91), separación ΔE 19+ entre bandas contiguas —tanto en visión normal como
 * simulando protanopía y deuteranopía— y contraste ≥ 3:1 en las tres.
 */
export const COLOR_BANDA: Record<Banda, string> = {
  facil: '#7f6130',
  medio: '#cf9524',
  duro: '#ffdc7d',
};
