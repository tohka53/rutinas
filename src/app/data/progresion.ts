import { CARRERAS, type Carrera } from './carreras.data';

/**
 * Cuánto tenés que mejorar, para cuándo, y si eso es realista.
 *
 * La pantalla de Rendimiento contesta qué pasó. Esta parte contesta qué debería
 * pasar, que es otra pregunta y bastante más útil: un −2 % en el nado no
 * significa nada hasta que se sabe si hacía falta un −10 % o un −1 %.
 *
 * Los objetivos no se inventan acá. Cada carrera del plan ya trae su desglose
 * por segmento —"Bici 90 km: 3:06"— y de ahí sale el ritmo que hay que tener
 * ese día. Anclar en la carrera y no en una tabla genérica es lo que hace que
 * el número signifique algo: no es "deberías mejorar un 1 % al mes", es "para
 * terminar Monterrey en 6:38 necesitás 29 km/h, y hoy vas a 20".
 *
 * Y trae el contrapeso: si lo que hace falta se sale de lo que un cuerpo puede
 * mejorar en ese tiempo, el que está mal es el objetivo, no el entrenamiento.
 * Un plan que pide lo imposible y lo presenta como meta no es exigente, es
 * inútil — y termina en lesión o en abandono. Por eso `MEJORA_PLAUSIBLE`.
 */

export type Disciplina = 'nado' | 'bici' | 'corre';

export interface ObjetivoCarrera {
  carrera: Carrera;
  /** Segundos por 100 m. */
  nadoRitmo: number | null;
  /** Kilómetros por hora. */
  biciKmh: number | null;
  /** Segundos por km. */
  correRitmo: number | null;
}

/** Menos es mejor en los ritmos; más es mejor en la velocidad. */
export const MAS_ES_MEJOR: Record<Disciplina, boolean> = {
  nado: false, bici: true, corre: false,
};

export const ETIQUETA: Record<Disciplina, string> = {
  nado: 'Natación', bici: 'Bici', corre: 'Carrera',
};

export const UNIDAD: Record<Disciplina, string> = {
  nado: '/100 m', bici: 'km/h', corre: '/km',
};

/**
 * Cuánto puede mejorar de verdad alguien con su recorrido, sobre 6 meses.
 *
 * Son rangos de la literatura de entrenamiento, no promesas, y valen para
 * quien viene de poco: un atleta entrenado mejora mucho menos. Se usan para
 * juzgar si un objetivo es alcanzable, nunca como meta — apuntar al techo del
 * rango es la forma más rápida de lesionarse.
 *
 * Por qué la bici admite tanto más: es la disciplina donde menos base tiene
 * (54 km de ruta en 13 semanas), y lo que más rápido sube es lo que nunca se
 * entrenó. La natación es sobre todo técnica, así que mejora rápido al
 * principio y se estanca; la carrera es la más lenta de las tres porque el
 * impacto limita cuánto volumen se puede agregar sin romperse.
 *
 * El peso entra aparte y no está acá: bajar 18 kg mueve el ritmo de carrera
 * por sí solo, sin ganar un mililitro de VO2max.
 */
export const MEJORA_PLAUSIBLE: Record<Disciplina, { tipico: number; techo: number }> = {
  nado: { tipico: 0.08, techo: 0.18 },
  bici: { tipico: 0.20, techo: 0.45 },
  corre: { tipico: 0.07, techo: 0.15 },
};

/** Sobre cuántas semanas están medidos los rangos de arriba. */
export const SEMANAS_REFERENCIA = 26;

// -------------------------------------------------------------- los objetivos

/** "1:32" o "35:00" o "2:38" a segundos. Formato del desglose de las carreras. */
export function aSegundos(txt: string): number | null {
  const p = txt.trim().split(':').map(Number);
  if (p.some(n => !Number.isFinite(n))) return null;
  if (p.length === 2) {
    // Ambiguo a propósito en el origen: "1:32" en bici son horas:minutos y
    // "35:00" en natación son minutos:segundos. Se resuelve por magnitud —
    // ninguna bici de 40 km se hace en 1 min 32 s.
    return p[0] < 10 ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];
  }
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return null;
}

/** Los km que declara un segmento: "Bici 90 km" -> 90. */
function kmDe(segmento: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*km/i.exec(segmento);
  return m ? Number(m[1]) : null;
}

/**
 * Convierte el desglose de una carrera en los ritmos que hay que tener ese día.
 *
 * Devuelve null por disciplina cuando la carrera no la declara, en vez de un
 * cero: una carrera sin segmento de bici no es una carrera con bici a 0 km/h.
 */
export function objetivosDe(carrera: Carrera): ObjetivoCarrera {
  const o: ObjetivoCarrera = { carrera, nadoRitmo: null, biciKmh: null, correRitmo: null };
  for (const d of carrera.desglose ?? []) {
    const seg = d.segmento.toLowerCase();
    const km = kmDe(d.segmento);
    const s = aSegundos(d.tiempo);
    if (km === null || s === null || km <= 0 || s <= 0) continue;

    if (seg.includes('nataci')) o.nadoRitmo = s / (km * 10);          // por 100 m
    else if (seg.includes('bici')) o.biciKmh = km / (s / 3600);
    else if (seg.includes('carrera')) o.correRitmo = s / km;
  }
  return o;
}

export function valorObjetivo(o: ObjetivoCarrera, d: Disciplina): number | null {
  return d === 'nado' ? o.nadoRitmo : d === 'bici' ? o.biciKmh : o.correRitmo;
}

/** Los metros que declara el segmento de carrera a pie. */
export function metrosCarreraPie(c: Carrera): number | null {
  for (const d of c.desglose ?? []) {
    if (d.segmento.toLowerCase().includes('carrera')) {
      const km = kmDe(d.segmento);
      if (km) return km * 1000;
    }
  }
  return null;
}

/**
 * El ritmo que hoy podría sostener en la distancia de esa carrera.
 *
 * Esto es lo que evita la comparación tramposa. Su mejor marca es una media
 * maratón a 8:14/km y el objetivo del olímpico es un 10 km a 7:12/km: puestos
 * uno al lado del otro parece que le falta un 13 %, pero buena parte de esa
 * diferencia es solo que 21 km se corren más lento que 10. Con el VDOT
 * traducido a la distancia de la carrera, hoy da 7:38/km en 10 km, y lo que
 * falta de verdad es un 6 %.
 *
 * La diferencia entre 13 % y 6 % no es cosmética: decide si un objetivo se
 * declara fuera de alcance o alcanzable.
 */
export function ritmoEsperadoEnDistancia(
  tiempoParaDistancia: (vdot: number, metros: number) => number | null,
  vdot: number | null,
  metros: number | null,
): number | null {
  if (vdot === null || metros === null || !(metros > 0)) return null;
  const t = tiempoParaDistancia(vdot, metros);
  return t === null ? null : t / (metros / 1000);
}

// ------------------------------------------------------------- la comparación

export type Veredicto = 'ya-esta' | 'holgado' | 'exigente' | 'fuera-de-rango';

export interface Requerido {
  disciplina: Disciplina;
  actual: number | null;
  objetivo: number | null;
  semanas: number;
  /** Mejora total que hace falta, como fracción. 0.43 = 43 %. */
  totalPct: number | null;
  /** La misma mejora repartida por semana, compuesta. Es un promedio. */
  porSemanaPct: number | null;
  /** La misma mejora, escalada a la ventana de los rangos plausibles. */
  equivalente26: number | null;
  veredicto: Veredicto;
  /** Por qué ese veredicto, en una frase. */
  porQue: string;
}

/**
 * Cuánto hay que mejorar y si eso entra en lo posible.
 *
 * El porcentaje total se escala a la ventana de `MEJORA_PLAUSIBLE` antes de
 * compararlo — un 20 % en 8 semanas y un 20 % en 40 no son lo mismo, y
 * compararlos contra la misma banda diría que los dos son razonables.
 */
export function requerido(
  disciplina: Disciplina,
  actual: number | null,
  objetivo: number | null,
  semanas: number,
): Requerido {
  const base: Requerido = {
    disciplina, actual, objetivo, semanas,
    totalPct: null, porSemanaPct: null, equivalente26: null,
    veredicto: 'holgado', porQue: '',
  };
  if (actual === null || objetivo === null || !(actual > 0) || !(objetivo > 0)) {
    return { ...base, porQue: 'Todavía no hay con qué compararlo.' };
  }
  if (semanas <= 0) {
    return { ...base, porQue: 'La carrera ya pasó.' };
  }

  // Orientado: positivo siempre significa "hay que mejorar tanto".
  const mas = MAS_ES_MEJOR[disciplina];
  const totalPct = mas ? (objetivo - actual) / actual : (actual - objetivo) / actual;

  if (totalPct <= 0) {
    return {
      ...base, totalPct, equivalente26: 0, porSemanaPct: 0,
      veredicto: 'ya-esta',
      porQue: 'Ya estás en el objetivo. Lo que falta es sostenerlo el día de la carrera.',
    };
  }

  // Compuesto, no dividido: mejorar un 1 % sobre lo ya mejorado no es lo mismo
  // que un 1 % del punto de partida, y en 32 semanas la diferencia es grande.
  const porSemanaPct = Math.pow(1 + totalPct, 1 / semanas) - 1;
  const equivalente26 = Math.pow(1 + porSemanaPct, SEMANAS_REFERENCIA) - 1;

  const { tipico, techo } = MEJORA_PLAUSIBLE[disciplina];
  let veredicto: Veredicto; let porQue: string;
  if (equivalente26 <= tipico) {
    veredicto = 'holgado';
    porQue = `Entra dentro de lo que mejora alguien con tu recorrido sin forzar.`;
  } else if (equivalente26 <= techo) {
    veredicto = 'exigente';
    porQue = `Es alcanzable, pero está en la parte alta de lo que se puede mejorar. ` +
             `No sobra margen para semanas perdidas.`;
  } else {
    veredicto = 'fuera-de-rango';
    porQue = `Pide más de lo que un cuerpo mejora en ese tiempo. El que hay que ` +
             `revisar es el objetivo o la fecha, no el entrenamiento.`;
  }
  return { ...base, totalPct, porSemanaPct, equivalente26, veredicto, porQue };
}

// ------------------------------------------------------------------ los hitos

/**
 * Cuánta parte de la mejora total debería estar hecha a la semana `t`.
 *
 * No es lineal, y esa es toda la gracia. La adaptación es rápida al principio
 * —lo que nunca se entrenó sube solo— y se aplana después. Un plan que repartiera
 * la mejora en partes iguales estaría pidiendo de menos en la semana 4 y de más
 * en la 30, y en la 30 es cuando duele descubrir que vas atrasado.
 *
 * `k` gobierna cuánto se adelanta la curva. Con k = 2, a un tercio del camino
 * debería estar hecho el 56 % de la mejora, y a la mitad el 73 %.
 */
export const K_CURVA = 2;

export function fraccionEsperada(t: number, total: number, k = K_CURVA): number {
  if (total <= 0) return 1;
  const x = Math.max(0, Math.min(1, t / total));
  return (1 - Math.exp(-k * x)) / (1 - Math.exp(-k));
}

export interface Hito {
  semanas: number;
  fecha: string;
  /** Dónde deberías estar, en las unidades de la disciplina. */
  valor: number;
  /** Cuánto de la mejora total debería estar hecho. */
  fraccion: number;
}

/**
 * Los puntos de control entre hoy y la carrera.
 *
 * Se dan pocos y espaciados a propósito: revisar cada semana invita a leer
 * ruido como tendencia. Cuatro semanas es lo mínimo para que una mejora se
 * distinga de un buen día.
 */
export function hitos(
  actual: number, objetivo: number, semanas: number, disciplina: Disciplina,
  hoy: string, cada = 4,
): Hito[] {
  const salida: Hito[] = [];
  if (!(semanas > 0) || !(actual > 0) || !(objetivo > 0)) return salida;
  const mas = MAS_ES_MEJOR[disciplina];

  for (let t = cada; t <= semanas; t += cada) {
    const f = fraccionEsperada(t, semanas);
    const valor = mas ? actual + (objetivo - actual) * f
                      : actual - (actual - objetivo) * f;
    salida.push({ semanas: t, fecha: sumarSemanas(hoy, t), valor, fraccion: f });
  }
  // La carrera siempre cierra la lista, aunque no caiga en múltiplo de `cada`.
  const ultimo = salida[salida.length - 1];
  if (!ultimo || ultimo.semanas < semanas) {
    salida.push({ semanas, fecha: sumarSemanas(hoy, semanas), valor: objetivo, fraccion: 1 });
  }
  return salida;
}

/**
 * Compara la mejora real contra la que tocaba a esta altura.
 *
 * `desde` es dónde estaba cuando arrancó el plan. Sin eso no hay contra qué
 * medir: el valor de hoy solo dice dónde está, no si viene subiendo.
 */
export interface Avance {
  esperado: number;
  real: number;
  /** Fracción de la mejora que debería estar hecha, y la que está. */
  fraccionEsperada: number;
  fraccionReal: number;
  /** Positivo = adelantado. */
  diferenciaPct: number;
  alDia: boolean;
}

export function avance(
  desde: number, actual: number, objetivo: number,
  semanasHechas: number, semanasTotales: number, disciplina: Disciplina,
): Avance | null {
  if (!(desde > 0) || !(actual > 0) || !(objetivo > 0)) return null;
  if (!(semanasTotales > 0)) return null;
  const camino = objetivo - desde;
  if (Math.abs(camino) < 1e-9) return null;

  const fEsp = fraccionEsperada(Math.min(semanasHechas, semanasTotales), semanasTotales);
  const fReal = (actual - desde) / camino;
  const esperado = desde + camino * fEsp;

  return {
    esperado, real: actual,
    fraccionEsperada: fEsp, fraccionReal: fReal,
    diferenciaPct: +((fReal - fEsp) * 100).toFixed(1),
    alDia: fReal >= fEsp - 0.05,
  };
}

// -------------------------------------------------------------------- fechas

function sumarSemanas(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  f.setUTCDate(f.getUTCDate() + n * 7);
  return f.toISOString().slice(0, 10);
}

export function semanasHasta(hoy: string, fecha: string): number {
  const d = (iso: string) => {
    const [a, m, x] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, x);
  };
  return Math.round((d(fecha) - d(hoy)) / (7 * 86400000));
}

/** Las carreras que todavía no pasaron, de la más cercana a la más lejana. */
export function carrerasPendientes(hoy: string): Carrera[] {
  return CARRERAS.filter(c => c.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
