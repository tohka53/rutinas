import type { Actividad } from './cumplimiento';

/**
 * VO2max y zonas cardíacas, calculados desde lo que ya hay en Strava.
 *
 * Esto sale del estudio base del 7 sep 2026 (claude/estudio-base-7-sep.md).
 * Vive en la app y no en el documento por una razón concreta: un número escrito
 * a mano envejece en silencio. El VDOT que sale de una carrera de agosto deja de
 * ser cierto en noviembre, y el máximo cardíaco observado cambia el día que
 * aparezca una sesión más dura. Recalculado desde `rutina_actividad`, el
 * diagnóstico se corrige solo.
 *
 * Nada de esto reemplaza una prueba de laboratorio, y el módulo lo dice en cada
 * salida: `estimado`, `advertencias`, y el conteo de actividades detrás de cada
 * número, para que se pueda juzgar cuánta confianza merece.
 */

// ============================================================== VO2max / VDOT

/**
 * VDOT de Daniels: el VO2max que explicaría un rendimiento en carrera.
 *
 * Dos curvas empíricas de Daniels & Gilbert:
 *   - cuánto oxígeno cuesta correr a una velocidad (ml/kg/min)
 *   - qué porcentaje del VO2max se puede sostener durante un tiempo dado
 * El VDOT es la división de una entre la otra.
 *
 * Solo tiene sentido en esfuerzos de verdad. Un trote de recuperación da un
 * VDOT bajísimo y no significa que se haya perdido capacidad — significa que se
 * iba suave. Por eso `vdotDe` calcula y `estimarVO2max` filtra.
 */
export function vdotDe(metros: number, segundos: number): number | null {
  if (!(metros > 0) || !(segundos > 0)) return null;
  const vel = metros / (segundos / 60);        // m/min
  const min = segundos / 60;
  if (vel < 50 || vel > 500) return null;      // fuera de rango humano corriendo

  const pctMax = 0.8
    + 0.1894393 * Math.exp(-0.012778 * min)
    + 0.2989558 * Math.exp(-0.1932605 * min);
  const vo2 = -4.60 + 0.182258 * vel + 0.000104 * vel * vel;

  const vdot = vo2 / pctMax;
  return vdot > 0 && Number.isFinite(vdot) ? vdot : null;
}

/** Distancia mínima para que un VDOT signifique algo. Menos es ruido. */
export const METROS_MINIMOS_VDOT = 3000;

/** Cuántos días de historial se miran para el VO2max actual. */
export const VENTANA_VDOT_DIAS = 120;

export interface CarreraVdot {
  fecha: string;
  metros: number;
  segundos: number;
  vdot: number;
  /** Segundos por km, para poder mostrar el ritmo. */
  ritmo: number;
  nombre: string | null;
}

export interface EstimacionVO2max {
  /** El mejor VDOT de la ventana. Es el que mejor representa el techo. */
  vo2max: number | null;
  /** El rango observado: dice cuánto ruido hay detrás del número. */
  min: number | null;
  max: number | null;
  /** Las carreras que entraron, de mejor a peor. */
  carreras: CarreraVdot[];
  /** Consumo absoluto en L/min, si se conoce el peso. */
  litrosMin: number | null;
  /** Lo que marcaría el mismo motor al peso meta. */
  vo2maxEnMeta: number | null;
  /** Cuánto sube solo por bajar de peso, en %. */
  gananciaPorPeso: number | null;
  advertencias: string[];
}

/**
 * Estima el VO2max desde las carreras del historial.
 *
 * Se toma el **mejor** VDOT de la ventana, no el promedio. El VDOT mide un
 * techo: una carrera suave no dice que el techo bajó, dice que ese día no se
 * fue a buscarlo. Promediar mezcla intención con capacidad y siempre da de
 * menos. El rango min–max queda a la vista para no esconder la dispersión.
 */
export function estimarVO2max(
  actividades: readonly Actividad[],
  hoy: string,
  pesoKg: number | null,
  metaKg: number | null,
): EstimacionVO2max {
  const desde = restarDias(hoy, VENTANA_VDOT_DIAS);
  const carreras: CarreraVdot[] = [];

  for (const a of actividades) {
    if (a.disciplina !== 'corre') continue;
    if (a.fecha < desde || a.fecha > hoy) continue;
    if (a.metros < METROS_MINIMOS_VDOT) continue;
    const vdot = vdotDe(a.metros, a.segundos);
    if (vdot === null) continue;
    carreras.push({
      fecha: a.fecha, metros: a.metros, segundos: a.segundos, vdot,
      ritmo: a.segundos / (a.metros / 1000),
      nombre: a.nombre ?? null,
    });
  }
  carreras.sort((x, y) => y.vdot - x.vdot);

  const advertencias: string[] = [];
  if (!carreras.length) {
    advertencias.push(
      `No hay carreras de ${(METROS_MINIMOS_VDOT / 1000).toFixed(0)} km o más en los últimos ` +
      `${VENTANA_VDOT_DIAS} días. Con una sola alcanza para estimarlo.`);
    return {
      vo2max: null, min: null, max: null, carreras: [],
      litrosMin: null, vo2maxEnMeta: null, gananciaPorPeso: null, advertencias,
    };
  }

  const vo2max = carreras[0].vdot;
  const min = carreras[carreras.length - 1].vdot;

  if (carreras.length === 1) {
    advertencias.push('Sale de una sola carrera. Con dos o tres el número es más confiable.');
  }
  if (pesoKg && pesoKg > 100) {
    advertencias.push(
      'El VDOT desde carrera subestima a un corredor pesado: tu economía de carrera ' +
      'es peor que la del modelo. Tomalo como piso, no como techo.');
  }

  const litrosMin = pesoKg ? (vo2max * pesoKg) / 1000 : null;
  const vo2maxEnMeta = pesoKg && metaKg ? (vo2max * pesoKg) / metaKg : null;
  const gananciaPorPeso = vo2maxEnMeta ? ((vo2maxEnMeta / vo2max) - 1) * 100 : null;

  return {
    vo2max, min, max: vo2max, carreras,
    litrosMin, vo2maxEnMeta, gananciaPorPeso, advertencias,
  };
}

// ============================================================ zonas cardíacas

/** Las zonas que Strava tiene configuradas, tal como las devuelve su API. */
export interface ZonaConfigurada { min: number; max: number | null; }

/**
 * Los cortes por defecto de Strava sobre el máximo: 65 / 80 / 87 / 95 %.
 *
 * Sirven para dos cosas: deducir qué máximo asume una tabla dada, y proponer
 * una tabla nueva cuando se conozca el máximo real.
 */
export const CORTES_MAX = [0.65, 0.80, 0.87, 0.95] as const;

/** Cortes sobre la FC de umbral (Friel), que es el ancla que sí se puede medir. */
export const CORTES_LTHR = [0.85, 0.89, 0.94, 1.00] as const;

export const NOMBRES_ZONA = ['Z1 · Recuperación', 'Z2 · Aeróbico', 'Z3 · Tempo', 'Z4 · Umbral', 'Z5 · VO2max'];

export interface Zona { n: number; nombre: string; min: number; max: number | null; }

/** Construye las cinco zonas a partir de un ancla y sus cortes. */
export function zonasDesde(ancla: number, cortes: readonly number[]): Zona[] {
  const limites = cortes.map(c => Math.round(ancla * c));
  return NOMBRES_ZONA.map((nombre, i) => ({
    n: i + 1, nombre,
    min: i === 0 ? 0 : limites[i - 1] + 1,
    max: i < limites.length ? limites[i] : null,
  }));
}

/**
 * De qué máximo salió una tabla de zonas.
 *
 * Se promedian las estimaciones de cada corte en vez de usar uno solo: los
 * límites vienen redondeados a enteros, y despejar desde un único corte arrastra
 * ese redondeo. Con cuatro, el error se cancela.
 */
export function maxImplicito(zonas: readonly ZonaConfigurada[]): number | null {
  const tops = zonas.map(z => z.max).filter((x): x is number => typeof x === 'number');
  if (tops.length < CORTES_MAX.length) return null;
  const est = CORTES_MAX.map((c, i) => tops[i] / c);
  return Math.round(est.reduce((a, b) => a + b, 0) / est.length);
}

export interface SesionFC {
  fecha: string; nombre: string | null; disciplina: string;
  segundos: number; fcMedia: number | null; fcMax: number;
}

export interface AnalisisZonas {
  /** true cuando ninguna actividad trae FC: hay que resincronizar. */
  sinDatos: boolean;
  /** Cuántas actividades traen FC, sobre cuántas hay. */
  conFC: number; total: number;
  /** El máximo que se ha visto de verdad. */
  maxObservado: number | null;
  /** El máximo que asume la tabla configurada. */
  maxAsumido: number | null;
  /** Diferencia entre lo asumido y lo observado, en lpm. */
  brecha: number | null;
  /** Las sesiones más exigentes, para poder auditar el máximo. */
  masDuras: SesionFC[];
  /** Cuánto tiempo se pasó en cada zona de la tabla configurada, en horas. */
  horasPorZona: number[];
  /** Zonas que no se tocaron nunca. Si hay, la tabla no describe su entreno. */
  zonasVacias: number[];
  /** El diagnóstico en una frase. */
  veredicto: 'sin-datos' | 'sin-zonas' | 'coherente' | 'desalineada';
  advertencias: string[];
}

/** Con cuánta diferencia se considera que la tabla ya no describe su entreno. */
export const BRECHA_TOLERADA = 8;

/**
 * Contrasta las zonas configuradas contra la FC que se registró de verdad.
 *
 * El hallazgo que este análisis existe para detectar: una tabla que asume un
 * máximo de 192 cuando el máximo real observado es 171 deja las dos zonas de
 * arriba fuera de alcance, y empuja todo el entreno duro a lo que la gráfica
 * llama "tempo". No es un detalle cosmético — es la diferencia entre creer que
 * se entrenó suave y haber entrenado al 93 %.
 *
 * Lo que NO hace, a propósito: proponer un máximo nuevo y reescribir las zonas
 * con él. Que la FC nunca pase de 171 admite dos lecturas —que ese sea el
 * máximo, o que el límite sea muscular y no cardíaco a 127 kg, con un sensor
 * óptico que además sub-registra en intensidad alta— y con estos datos no se
 * distinguen. Construir el plan sobre la equivocada es peor que no tener tabla.
 * El módulo señala la incoherencia y remite al test de umbral, que sí se mide.
 */
export function analizarZonas(
  actividades: readonly Actividad[],
  zonas: readonly ZonaConfigurada[] | null,
): AnalisisZonas {
  const total = actividades.length;
  const conFCLista = actividades.filter(
    a => typeof a.fc_max === 'number' && a.fc_max > 0);
  const conFC = conFCLista.length;

  const advertencias: string[] = [];
  const maxAsumido = zonas?.length ? maxImplicito(zonas) : null;

  if (!conFC) {
    return {
      sinDatos: true, conFC: 0, total, maxObservado: null, maxAsumido,
      brecha: null, masDuras: [], horasPorZona: [], zonasVacias: [],
      veredicto: 'sin-datos',
      advertencias: ['Ninguna actividad tiene frecuencia cardíaca guardada. ' +
                     'Resincronizá el historial completo para traerla de Strava.'],
    };
  }

  const maxObservado = Math.max(...conFCLista.map(a => a.fc_max as number));

  const masDuras: SesionFC[] = [...conFCLista]
    .sort((a, b) => (b.fc_max as number) - (a.fc_max as number)
      || b.segundos - a.segundos)
    .slice(0, 6)
    .map(a => ({
      fecha: a.fecha, nombre: a.nombre ?? null, disciplina: a.disciplina,
      segundos: a.segundos, fcMedia: a.fc_media ?? null, fcMax: a.fc_max as number,
    }));

  // El tiempo por zona se reparte con la FC media, que es una aproximación
  // gruesa —una sesión de series pasa por varias zonas y acá cuenta entera en
  // una— pero alcanza de sobra para lo que se quiere ver: si hay zonas donde
  // nunca cae nada. El detalle real necesitaría los streams de Strava, una
  // petición por actividad.
  const horasPorZona = zonas?.length ? new Array(zonas.length).fill(0) : [];
  if (zonas?.length) {
    for (const a of actividades) {
      const fc = a.fc_media;
      if (typeof fc !== 'number' || !(fc > 0)) continue;
      const i = zonas.findIndex(z => fc >= z.min && (z.max === null || fc <= z.max));
      if (i >= 0) horasPorZona[i] += a.segundos / 3600;
    }
  }
  const zonasVacias = horasPorZona
    .map((h, i) => ({ h, n: i + 1 }))
    .filter(x => x.h < 0.01)
    .map(x => x.n);

  if (!zonas?.length) {
    advertencias.push('No hay zonas configuradas en Strava para comparar.');
    return {
      sinDatos: false, conFC, total, maxObservado, maxAsumido: null, brecha: null,
      masDuras, horasPorZona: [], zonasVacias: [], veredicto: 'sin-zonas', advertencias,
    };
  }

  const brecha = maxAsumido === null ? null : maxAsumido - maxObservado;
  const desalineada = brecha !== null && brecha > BRECHA_TOLERADA;

  if (desalineada) {
    advertencias.push(
      `La tabla asume un máximo de ${maxAsumido} lpm y en ${conFC} actividades nunca ` +
      `pasaste de ${maxObservado}. Las zonas altas quedan fuera de alcance y lo duro ` +
      'se lee como suave.');
    advertencias.push(
      'No se puede saber desde acá si tu máximo real es ese o si el límite es ' +
      'muscular y no cardíaco (el sensor de muñeca además sub-registra en ' +
      'intensidad alta). Por eso no se reescriben las zonas solas.');
    advertencias.push(
      'La salida es medir la FC de umbral: 30 min sostenidos, la media de los ' +
      'últimos 20 es tu LTHR. No exige ir al máximo.');
  }
  if (zonasVacias.length) {
    advertencias.push(
      `Nunca entrenaste en ${zonasVacias.length === 1 ? 'la zona' : 'las zonas'} ` +
      zonasVacias.map(n => `Z${n}`).join(', ') + '.');
  }

  return {
    sinDatos: false, conFC, total, maxObservado, maxAsumido, brecha,
    masDuras, horasPorZona, zonasVacias,
    veredicto: desalineada ? 'desalineada' : 'coherente',
    advertencias,
  };
}

// ================================================= qué zonas poner en Strava

/** Duración mínima para que un esfuerzo sirva de piso del umbral. */
export const MINUTOS_ESFUERZO_LARGO = 60;

/** Cuánto por encima del esfuerzo sostenido se estima el umbral. */
export const MARGEN_LTHR = 1.015;

export interface EstimacionLTHR {
  /** El umbral estimado, en lpm. null si no hay con qué. */
  lthr: number | null;
  /** Piso: nadie sostiene por encima del umbral durante horas. */
  piso: number | null;
  /** Techo: el máximo que se ha visto. */
  techo: number | null;
  /** El esfuerzo largo del que salió el piso. */
  origen: SesionFC | null;
  advertencias: string[];
}

/**
 * Estima la FC de umbral desde el esfuerzo largo más duro del historial.
 *
 * El razonamiento, que es lo que hace que este número valga más que el máximo
 * teórico: **nadie sostiene una FC por encima de su umbral durante horas.** Si
 * promedió 159 lpm en una media maratón de tres horas, su umbral no puede ser
 * menor que 159 — eso es un piso medido, no una fórmula. Y no puede ser mayor
 * que el máximo que alguna vez registró. El umbral queda encerrado entre los
 * dos, y ese intervalo es información de verdad.
 *
 * Se estima cerca del piso a propósito. Un umbral bajo hace que cada pulsación
 * caiga en una zona más alta, así que uno se frena antes: si el número está mal,
 * el error empuja a entrenar más suave, que es el lado seguro para arrancar 60
 * semanas. Un umbral alto haría lo contrario, y ese error no se nota hasta que
 * ya se acumuló.
 *
 * Esto es un puente hasta el test de 30 minutos, no un reemplazo.
 */
export function estimarLTHR(actividades: readonly Actividad[]): EstimacionLTHR {
  const advertencias: string[] = [];
  const conFC = actividades.filter(
    a => typeof a.fc_media === 'number' && (a.fc_media as number) > 0);

  if (!conFC.length) {
    return {
      lthr: null, piso: null, techo: null, origen: null,
      advertencias: ['Sin frecuencia cardíaca en el historial no se puede estimar el umbral.'],
    };
  }

  const conMax = conFC.filter(a => typeof a.fc_max === 'number' && (a.fc_max as number) > 0);
  const techo = conMax.length ? Math.max(...conMax.map(a => a.fc_max as number)) : null;

  // El esfuerzo largo con la FC media más alta: es el que más apretó el techo
  // durante más tiempo, y por lo tanto el piso más alto que se puede defender.
  const largos = conFC.filter(a => a.segundos >= MINUTOS_ESFUERZO_LARGO * 60);
  const mejor = largos.length
    ? largos.reduce((x, y) => (y.fc_media as number) > (x.fc_media as number) ? y : x)
    : null;

  if (!mejor) {
    advertencias.push(
      `No hay ningún esfuerzo de más de ${MINUTOS_ESFUERZO_LARGO} min con frecuencia ` +
      'cardíaca. Sin eso, el umbral no se puede acotar por abajo.');
    return { lthr: null, piso: null, techo, origen: null, advertencias };
  }

  const piso = Math.round(mejor.fc_media as number);
  let lthr = Math.round(piso * MARGEN_LTHR);
  if (techo !== null && lthr > techo) {
    lthr = techo;
    advertencias.push(
      `La estimación tocó el máximo observado (${techo}), así que quedó ahí. ` +
      'Es otra señal de que el máximo registrado se está quedando corto.');
  }

  advertencias.push(
    `Estimado entre ${piso} (lo que sostuviste ${Math.round(mejor.segundos / 60)} min ` +
    `el ${mejor.fecha}) y ${techo ?? '—'} (tu máximo registrado). Es un puente: ` +
    'el test de 30 minutos lo mide de verdad.');

  const origen: SesionFC = {
    fecha: mejor.fecha, nombre: mejor.nombre ?? null, disciplina: mejor.disciplina,
    segundos: mejor.segundos, fcMedia: mejor.fc_media ?? null,
    fcMax: (mejor.fc_max as number) ?? 0,
  };
  return { lthr, piso, techo, origen, advertencias };
}

/**
 * La tabla que conviene tener puesta en Strava, anclada en el umbral.
 *
 * Anclar en el umbral y no en el máximo no es una preferencia de estilo. El
 * máximo es el único número de la fisiología que no se puede medir sin ir a un
 * esfuerzo total —caro y riesgoso a 127 kg— y que además se suele adivinar con
 * "220 menos la edad", que tiene un error de ±12 lpm. El umbral se mide con una
 * sesión dura pero controlada, y es el que decide de verdad dónde está el
 * límite entre lo aeróbico y lo que no se sostiene.
 *
 * Los cortes son los de Friel, redondeados para que las bandas sean anchas y
 * usables: una Z2 de siete pulsaciones es imposible de mantener en la calle.
 */
export const CORTES_ZONAS = [0.85, 0.92, 0.97, 1.03] as const;

export function zonasRecomendadas(lthr: number): Zona[] {
  return zonasDesde(lthr, CORTES_ZONAS);
}

/** Qué se entrena en cada zona, para que la tabla se pueda usar sin traducir. */
export const PARA_QUE_SIRVE: string[] = [
  'Trote y nado de soltar. Recuperación entre días duros.',
  'Donde vive el fondo: la bici larga del domingo y el nado continuo. La mayor parte del plan va acá.',
  'Ritmo cómodo-duro. Se usa poco y con intención.',
  'Umbral. Las series de la bici y los bloques largos de calidad.',
  'Máximo. Solo en el CrossFit y en algún tramo corto de carrera.',
];

// --------------------------------------------------------------------- utils

function restarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  f.setUTCDate(f.getUTCDate() - n);
  return f.toISOString().slice(0, 10);
}

/** Etiqueta de población para un VO2max. Orientativa, no diagnóstica. */
export function nivelVO2max(v: number): string {
  if (v < 25) return 'bajo';
  if (v < 33) return 'regular';
  if (v < 42) return 'bueno';
  if (v < 50) return 'muy bueno';
  return 'excelente';
}
