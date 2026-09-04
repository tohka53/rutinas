import type { Semana } from './plan.data';
import { SEMANA_BASE } from './sesiones.data';

/**
 * Cuánto volumen le toca a cada sesión dentro de la semana.
 *
 * El plan trae el total semanal (4,500 m de nado, 55 km de bici…) pero no dice
 * cuánto sale de cada sesión. Sin ese reparto no se puede descontar lo que ya
 * se hizo, y el encabezado de la semana se queda mostrando el objetivo entero
 * aunque ya lleves tres sesiones encima.
 *
 * El reparto no se inventa: la sesión larga se lleva lo que dice la semana
 * (`nadoLargo`, `biciLarga`, `correLarga`) y el resto se divide entre las demás
 * sesiones de esa disciplina en proporción a su duración. Es la misma cuenta
 * con la que se armó el plan, al revés.
 */
export interface VolumenSesion {
  nadoM: number;
  biciKm: number;
  correKm: number;
  horas: number;
}

const CERO: VolumenSesion = { nadoM: 0, biciKm: 0, correKm: 0, horas: 0 };

/** Clave de una sesión dentro de la semana base: día de la semana + posición. */
export function claveSesion(dow: number, indice: number): string {
  return `${dow}:${indice}`;
}

/** Primer número de un texto como "50 km Z2 + 15' trote" → 50. */
function primerNumero(texto: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(texto ?? '');
  return m ? Number(m[1]) : null;
}

interface Ref { dow: number; indice: number; min: number; }

/** Todas las sesiones de la semana base, aplanadas y con su duración. */
function sesiones(): Ref[] {
  const out: Ref[] = [];
  for (const d of SEMANA_BASE) {
    d.sesiones.forEach((s, indice) => out.push({ dow: d.dow, indice, min: s.min }));
  }
  return out;
}

function esDisciplina(dow: number, indice: number, disciplinas: string[]): boolean {
  const s = SEMANA_BASE.find(d => d.dow === dow)?.sesiones[indice];
  return !!s && disciplinas.includes(s.disciplina);
}

/**
 * Reparte `total` entre `refs`: la sesión `larga` se lleva `fijo` y el resto se
 * divide en proporción a los minutos. Si no hay sesión larga identificable
 * (semanas de carrera, "lo que te pida el cuerpo"), va todo proporcional.
 */
function repartir(
  total: number,
  refs: Ref[],
  larga: Ref | null,
  fijo: number | null,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!refs.length || total <= 0) return out;

  let resto = refs;
  let porRepartir = total;

  if (larga && fijo !== null && fijo > 0) {
    // El fijo nunca puede pasarse del total: en semanas de descarga o de taper
    // la larga sola puede ser casi toda la semana, y no debe quedar negativo.
    const asignado = Math.min(fijo, total);
    out.set(claveSesion(larga.dow, larga.indice), asignado);
    porRepartir = total - asignado;
    resto = refs.filter(r => !(r.dow === larga.dow && r.indice === larga.indice));
  }

  const minutos = resto.reduce((a, r) => a + r.min, 0);
  if (!resto.length || minutos <= 0 || porRepartir <= 0) return out;
  for (const r of resto) {
    out.set(claveSesion(r.dow, r.indice), (porRepartir * r.min) / minutos);
  }
  return out;
}

function buscar(dow: number, disciplinas: string[]): Ref | null {
  const dia = SEMANA_BASE.find(d => d.dow === dow);
  if (!dia) return null;
  const indice = dia.sesiones.findIndex(s => disciplinas.includes(s.disciplina));
  return indice < 0 ? null : { dow, indice, min: dia.sesiones[indice].min };
}

export function volumenPorSesion(semana: Semana): Map<string, VolumenSesion> {
  const todas = sesiones();
  const deNado = todas.filter(r => esDisciplina(r.dow, r.indice, ['nado']));
  const deBici = todas.filter(r => esDisciplina(r.dow, r.indice, ['bici']));
  // El brick es carrera: en Strava es un trote, y en el plan cuenta como tal.
  const deCorre = todas.filter(r => esDisciplina(r.dow, r.indice, ['corre', 'brick']));

  // En semana de carrera la larga no es el trote del viernes: es la carrera del
  // domingo. `sesionesDelDia` hace el mismo cambio con el título.
  const esCarrera = (semana.correLarga ?? '').startsWith('CARRERA');
  const largaCorre = esCarrera ? buscar(7, ['brick']) : buscar(5, ['corre']);

  const nado = repartir(semana.nadoM, deNado, buscar(6, ['nado']), primerNumero(semana.nadoLargo));
  const bici = repartir(semana.biciKm, deBici, buscar(7, ['bici']), primerNumero(semana.biciLarga));
  const corre = repartir(semana.correKm, deCorre, largaCorre, primerNumero(semana.correLarga));

  // Las horas se reparten a prorrata de la duración de cada sesión. Es una
  // proporción, no la duración real: la suma de los minutos de la semana base
  // no coincide con `horas`, y lo que tiene que cuadrar es el total.
  const minutos = todas.reduce((a, r) => a + r.min, 0);

  const out = new Map<string, VolumenSesion>();
  for (const r of todas) {
    const k = claveSesion(r.dow, r.indice);
    out.set(k, {
      nadoM: nado.get(k) ?? 0,
      biciKm: bici.get(k) ?? 0,
      correKm: corre.get(k) ?? 0,
      horas: minutos > 0 ? (semana.horas * r.min) / minutos : 0,
    });
  }
  return out;
}

export function sumar(vs: Iterable<VolumenSesion>): VolumenSesion {
  const t = { ...CERO };
  for (const v of vs) {
    t.nadoM += v.nadoM; t.biciKm += v.biciKm;
    t.correKm += v.correKm; t.horas += v.horas;
  }
  return t;
}

/** Etiqueta corta para mostrar al lado de la sesión: "1,250 m", "27.5 km". */
export function etiquetaVolumen(v: VolumenSesion | undefined): string {
  if (!v) return '';
  if (v.nadoM >= 1) return `${Math.round(v.nadoM).toLocaleString('es-GT')} m`;
  const km = v.biciKm || v.correKm;
  if (km >= 0.1) return `${km.toFixed(1)} km`;
  return '';
}
