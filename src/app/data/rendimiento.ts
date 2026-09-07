import { SEMANAS, type Semana } from './plan.data';
import { KM_HORA_INDOOR, type Actividad } from './cumplimiento';

/**
 * Agrupa el historial en semanas para poder comparar una contra otra.
 *
 * La pregunta que responde no es "¿cuánto entrené?" —eso ya lo contesta
 * Cumplimiento— sino "¿estoy mejorando?". Son cosas distintas: una semana de
 * 7,000 m de nado a 2:50/100 m es más volumen y peor rendimiento que una de
 * 5,000 m a 2:20.
 *
 * Por eso cada disciplina trae volumen Y una medida de calidad:
 *
 *   nado    metros  +  ritmo por 100 m   (menos es mejor)
 *   bici    km      +  velocidad media   (más es mejor)
 *   corre   km      +  ritmo por km      (menos es mejor)
 *   fuerza  sesiones + minutos por sesión
 *
 * CrossFit no lleva medida de calidad y no es un olvido: Strava no guarda el
 * WOD ni las cargas, así que lo único comparable de verdad es cuántas veces
 * fuiste y cuánto duró. Inventar un índice de "intensidad" con los datos que
 * hay sería darle precisión falsa a una corazonada.
 *
 * Tres decisiones que cambian los números y conviene tener presentes:
 *
 *  1. El ritmo y la velocidad salen SOLO de las sesiones con distancia. Un
 *     spinning entra en Strava con distance = 0; si contara para la velocidad
 *     media, arrastraría el promedio a cero y una semana buena de ruta se vería
 *     mal por haber ido a spinning.
 *
 *  2. Los kilómetros de spinning y rodillo SÍ cuentan para el volumen, a 18
 *     km/h, que es lo que marca la clase. Se guardan aparte en `indoorKm` para
 *     que la pantalla pueda decir cuánto del total es estimado y cuánto es GPS.
 *     No contarlos dejaba en cero una semana en la que sí pedaleó dos horas.
 *
 *  3. Las semanas vacías aparecen igual. Un hueco es información: nueve semanas
 *     seguidas sin bici es justo lo que hay que ver, y saltárselas dibujaría una
 *     línea continua donde no hubo nada.
 */

export interface MetricaNado {
  sesiones: number; metros: number; segundos: number;
  /** Segundos por 100 m. null si no hubo nado con distancia. */
  ritmo: number | null;
  /** El mejor ritmo de la semana, para ver el techo y no solo el promedio. */
  mejorRitmo: number | null;
}

export interface MetricaBici {
  sesiones: number; km: number; horas: number;
  /** km/h de las salidas con distancia. null si la semana fue toda indoor. */
  velocidad: number | null;
  /** Solo los kilómetros medidos por GPS. Es el peso de `velocidad`. */
  kmRuta: number;
  /** Cuánto del total es estimado a 18 km/h y no medido. */
  indoorKm: number; indoorSesiones: number;
}

export interface MetricaCorre {
  sesiones: number; km: number; horas: number;
  /** Segundos por km. */
  ritmo: number | null;
  mejorRitmo: number | null;
}

export interface MetricaFuerza {
  sesiones: number; minutos: number;
  /** Mediana de duración. Más honesta que el promedio con sesiones de 10 y de 64. */
  medianaMin: number | null;
  esfuerzo: number;
}

export interface SemanaRendimiento {
  /** Lunes de la semana, en ISO. Es la clave. */
  lunes: string;
  domingo: string;
  /** Número de semana del plan, o null si cae antes de que el plan arranque. */
  n: number | null;
  /** Lo que el plan pedía esa semana, si la semana pertenece al plan. */
  objetivo: Semana | null;
  nado: MetricaNado;
  bici: MetricaBici;
  corre: MetricaCorre;
  fuerza: MetricaFuerza;
  /** Horas de entrenamiento. Las caminatas no cuentan. */
  horas: number;
  /** false cuando no se registró absolutamente nada. */
  hubo: boolean;
}

export type ClaveDisciplina = 'nado' | 'bici' | 'corre' | 'fuerza';

// --------------------------------------------------------------------- fechas

function aFecha(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana a la que pertenece una fecha. */
export function lunesDe(iso: string): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return aIso(d);
}

function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
}

/** Todos los lunes entre dos fechas, inclusive. */
function lunesEntre(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  let l = lunesDe(desde);
  const fin = lunesDe(hasta);
  // Tope defensivo: 10 años. Una fecha corrupta no debe colgar la pestaña.
  for (let i = 0; l <= fin && i < 520; i++) {
    salida.push(l);
    l = sumarDias(l, 7);
  }
  return salida;
}

// ------------------------------------------------------------------ agregación

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function vacia(lunes: string): SemanaRendimiento {
  const n = SEMANAS.findIndex(s => s.inicio === lunes);
  return {
    lunes, domingo: sumarDias(lunes, 6),
    n: n >= 0 ? SEMANAS[n].n : null,
    objetivo: n >= 0 ? SEMANAS[n] : null,
    nado: { sesiones: 0, metros: 0, segundos: 0, ritmo: null, mejorRitmo: null },
    bici: { sesiones: 0, km: 0, horas: 0, velocidad: null, kmRuta: 0, indoorKm: 0, indoorSesiones: 0 },
    corre: { sesiones: 0, km: 0, horas: 0, ritmo: null, mejorRitmo: null },
    fuerza: { sesiones: 0, minutos: 0, medianaMin: null, esfuerzo: 0 },
    horas: 0, hubo: false,
  };
}

/**
 * Arma la tabla semana por semana.
 *
 * `hasta` existe para que la última semana en curso aparezca aunque todavía no
 * tenga nada cargado — si no, un lunes por la mañana la pantalla se vería como
 * si la semana no existiera.
 */
export function porSemana(
  actividades: readonly Actividad[],
  hasta: string,
): SemanaRendimiento[] {
  if (!actividades.length) return [];

  const fechas = actividades.map(a => a.fecha).sort();
  const primera = fechas[0];
  const ultima = fechas[fechas.length - 1] > hasta ? fechas[fechas.length - 1] : hasta;

  const mapa = new Map<string, SemanaRendimiento>();
  for (const l of lunesEntre(primera, ultima)) mapa.set(l, vacia(l));

  // Acumuladores que no viven en la fila final pero hacen falta para promediar.
  const crudo = new Map<string, {
    nadoM: number; nadoS: number; nadoRitmos: number[];
    biciKm: number; biciS: number;    // solo con distancia, para la velocidad
    correKm: number; correS: number; correRitmos: number[];
    fuerzaMin: number[];
  }>();
  const crudoDe = (l: string) => {
    let c = crudo.get(l);
    if (!c) {
      c = { nadoM: 0, nadoS: 0, nadoRitmos: [], biciKm: 0, biciS: 0, correKm: 0, correS: 0, correRitmos: [], fuerzaMin: [] };
      crudo.set(l, c);
    }
    return c;
  };

  for (const a of actividades) {
    const l = lunesDe(a.fecha);
    const s = mapa.get(l);
    if (!s) continue;   // fuera del rango: no debería pasar, pero no rompe
    const c = crudoDe(l);
    const horas = a.segundos / 3600;

    if (a.disciplina !== 'caminata') { s.horas += horas; s.hubo = true; }

    if (a.disciplina === 'nado') {
      s.nado.sesiones++; s.nado.metros += a.metros; s.nado.segundos += a.segundos;
      if (a.metros > 0 && a.segundos > 0) {
        c.nadoM += a.metros; c.nadoS += a.segundos;
        c.nadoRitmos.push(a.segundos / (a.metros / 100));
      }
    } else if (a.disciplina === 'bici') {
      s.bici.sesiones++; s.bici.horas += horas;
      if (a.metros > 0) {
        s.bici.km += a.metros / 1000;
        s.bici.kmRuta += a.metros / 1000;
        c.biciKm += a.metros / 1000; c.biciS += a.segundos;
      } else {
        // Indoor: sin distancia. Se estima para el volumen, no para la velocidad.
        const km = horas * KM_HORA_INDOOR;
        s.bici.km += km; s.bici.indoorKm += km; s.bici.indoorSesiones++;
      }
    } else if (a.disciplina === 'corre') {
      s.corre.sesiones++; s.corre.horas += horas;
      s.corre.km += a.metros / 1000;
      if (a.metros > 0 && a.segundos > 0) {
        c.correKm += a.metros / 1000; c.correS += a.segundos;
        c.correRitmos.push(a.segundos / (a.metros / 1000));
      }
    } else if (a.disciplina === 'fuerza') {
      s.fuerza.sesiones++;
      s.fuerza.minutos += a.segundos / 60;
      s.fuerza.esfuerzo += a.esfuerzo ?? 0;
      c.fuerzaMin.push(a.segundos / 60);
    }
  }

  const salida: SemanaRendimiento[] = [];
  for (const [l, s] of [...mapa].sort(([a], [b]) => a.localeCompare(b))) {
    const c = crudo.get(l);
    if (c) {
      if (c.nadoM > 0) {
        s.nado.ritmo = c.nadoS / (c.nadoM / 100);
        s.nado.mejorRitmo = Math.min(...c.nadoRitmos);
      }
      if (c.biciS > 0) s.bici.velocidad = c.biciKm / (c.biciS / 3600);
      if (c.correKm > 0) {
        s.corre.ritmo = c.correS / c.correKm;
        s.corre.mejorRitmo = Math.min(...c.correRitmos);
      }
      s.fuerza.medianaMin = mediana(c.fuerzaMin);
    }
    s.nado.metros = Math.round(s.nado.metros);
    s.bici.km = +s.bici.km.toFixed(1);
    s.bici.kmRuta = +s.bici.kmRuta.toFixed(1);
    s.bici.indoorKm = +s.bici.indoorKm.toFixed(1);
    s.bici.horas = +s.bici.horas.toFixed(2);
    s.corre.km = +s.corre.km.toFixed(1);
    s.corre.horas = +s.corre.horas.toFixed(2);
    s.fuerza.minutos = Math.round(s.fuerza.minutos);
    s.horas = +s.horas.toFixed(1);
    salida.push(s);
  }
  return salida;
}

// -------------------------------------------------------------------- tendencia

export interface Tendencia {
  /** Promedio del bloque reciente y del anterior, en la unidad de la métrica. */
  reciente: number | null;
  previo: number | null;
  /** Cambio en %, con el signo ya orientado: positivo = mejor. */
  cambioPct: number | null;
  /** Cuántas semanas con dato entraron en cada bloque. */
  nReciente: number; nPrevio: number;
}

/**
 * Compara los últimos `ventana` bloques contra los `ventana` anteriores.
 *
 * Cuatro semanas contra cuatro y no la última contra la anterior: una semana
 * suelta la mueve cualquier cosa —un viaje, un resfriado, un domingo de lluvia—
 * y lo que interesa acá es si la curva va para arriba.
 *
 * Solo entran las semanas que tienen dato de esa métrica. Una semana sin nadar
 * no es "nado a ritmo cero", es una semana sin información de nado, y meterla
 * como cero haría ver una mejora donde solo hubo ausencia.
 *
 * `peso` es lo que evita el error más fácil de cometer acá. El ritmo es una
 * razón —segundos entre distancia—, y el promedio simple de razones no es la
 * razón del total: una semana de recuperación de 1,100 m votaría igual que una
 * de 7,150 m, y bastaría un sábado suave para que la tarjeta dijera que va más
 * lento. Ponderando por distancia, el promedio del bloque es exactamente
 * "segundos totales entre metros totales", que es el número que significa algo.
 *
 * Sin `peso` promedia normal, que es lo correcto para un conteo como las
 * sesiones de CrossFit.
 */
export function tendencia(
  semanas: readonly SemanaRendimiento[],
  valor: (s: SemanaRendimiento) => number | null,
  masEsMejor: boolean,
  ventana = 4,
  peso?: (s: SemanaRendimiento) => number,
): Tendencia {
  const conDato = semanas.filter(s => {
    const v = valor(s);
    return v !== null && Number.isFinite(v);
  });
  const recientes = conDato.slice(-ventana);
  const previos = conDato.slice(-ventana * 2, -ventana);

  const prom = (bloque: readonly SemanaRendimiento[]): number | null => {
    if (!bloque.length) return null;
    if (!peso) {
      return bloque.reduce((a, s) => a + (valor(s) as number), 0) / bloque.length;
    }
    let num = 0, den = 0;
    for (const s of bloque) {
      const w = peso(s);
      if (!Number.isFinite(w) || w <= 0) continue;
      num += (valor(s) as number) * w; den += w;
    }
    // Todos los pesos en cero (no debería pasar si hay dato) — se cae al promedio
    // simple antes que devolver null y perder la comparación.
    if (den <= 0) return bloque.reduce((a, s) => a + (valor(s) as number), 0) / bloque.length;
    return num / den;
  };

  const reciente = prom(recientes), previo = prom(previos);

  let cambioPct: number | null = null;
  if (reciente !== null && previo !== null && previo !== 0) {
    const bruto = ((reciente - previo) / previo) * 100;
    cambioPct = +(masEsMejor ? bruto : -bruto).toFixed(1);
  }
  return { reciente, previo, cambioPct, nReciente: recientes.length, nPrevio: previos.length };
}

// -------------------------------------------------------------------- formato

/** Segundos a "m:ss". Para ritmos. */
export function mmss(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return '—';
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

export function miles(n: number): string {
  return n.toLocaleString('es-GT');
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "7 sep" a partir de un ISO, sin depender de la zona horaria del navegador. */
export function etiquetaSemana(lunes: string): string {
  const [, m, d] = lunes.split('-').map(Number);
  return `${d} ${MESES[m - 1]}`;
}

export interface PuntoSerie { x: number; y: number; v: number; i: number; }

export interface Serie {
  /** Un `points` por tramo continuo: cada uno va en su propio <polyline>. */
  tramos: string[];
  puntos: PuntoSerie[];
  min: number; max: number;
}

/**
 * Convierte una serie con huecos en coordenadas para un sparkline.
 *
 * Los huecos **cortan** la línea en vez de interpolarla, y por eso salen varios
 * tramos y no uno solo: dibujar un segmento recto sobre una semana sin datos
 * sugeriría un entrenamiento que no existió. Los puntos van aparte para que una
 * semana suelta entre dos huecos —que no forma tramo— siga siendo visible.
 */
export function serie(
  valores: (number | null)[],
  ancho: number, alto: number, pad = 4,
): Serie {
  const validos = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  const min = validos.length ? Math.min(...validos) : 0;
  const max = validos.length ? Math.max(...validos) : 1;
  const rango = max - min || 1;
  const paso = valores.length > 1 ? (ancho - pad * 2) / (valores.length - 1) : 0;
  const posY = (v: number) => alto - pad - ((v - min) / rango) * (alto - pad * 2);

  const tramos: string[] = [];
  const puntos: PuntoSerie[] = [];
  let actual: string[] = [];

  valores.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (actual.length > 1) tramos.push(actual.join(' '));
      actual = [];
      return;
    }
    const x = pad + i * paso, y = posY(v);
    actual.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    puntos.push({ x: +x.toFixed(1), y: +y.toFixed(1), v, i });
  });
  if (actual.length > 1) tramos.push(actual.join(' '));

  return { tramos, puntos, min, max };
}
