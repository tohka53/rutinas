import type { Disciplina } from './plan.data';

export interface Actividad {
  strava_id: number;
  fecha: string;
  disciplina: string;
  sport_type?: string | null;
  nombre?: string | null;
  metros: number;
  segundos: number;
  desnivel?: number;
  calorias?: number | null;
  esfuerzo?: number | null;
}

/** Cómo se traduce cada sport_type de Strava a las disciplinas del plan. */
export const MAPA_STRAVA: Record<string, Disciplina | 'caminata' | 'otro'> = {
  Swim: 'nado',
  Ride: 'bici', VirtualRide: 'bici', EBikeRide: 'bici', MountainBikeRide: 'bici',
  GravelRide: 'bici', Handcycle: 'bici',
  Run: 'corre', TrailRun: 'corre', VirtualRun: 'corre',
  HighIntensityIntervalTraining: 'fuerza', WeightTraining: 'fuerza',
  Crossfit: 'fuerza', Workout: 'fuerza', Elliptical: 'fuerza', StairStepper: 'fuerza',
  Walk: 'caminata', Hike: 'caminata',
};

export function disciplinaDe(sportType: string): string {
  return MAPA_STRAVA[sportType] ?? 'otro';
}

/** Las que cuentan para el plan. Caminar suma salud, pero no es una sesión. */
export const DEL_PLAN = new Set(['nado', 'bici', 'corre', 'fuerza', 'brick']);

/**
 * Actividades que Strava tiene pero que no deben contar.
 *
 * El 5 de julio la misma salida quedo grabada dos veces, con 24 segundos de
 * diferencia entre una y otra (18.2 km y 19.4 km del mismo recorrido). Sumar las
 * dos infla la semana en 18 km de bici, justo la disciplina que hay que medir
 * con mas cuidado. Se descarta la mas corta, que es la que corto antes.
 *
 * La lista se aplica al leer, no al guardar: si manana Strava borra la copia, la
 * fila sobrante desaparece sola y esto no estorba.
 */
export const IDS_IGNORADOS = new Set<number>([
  19190203128,   // 5 jul 2026 — copia de la salida 19190209951
]);

export type Veredicto = 'completo' | 'parcial' | 'descanso' | 'nada' | 'extra' | 'futuro';

export const ETIQUETA_VEREDICTO: Record<Veredicto, string> = {
  completo: 'Cumplido',
  parcial: 'A medias',
  descanso: 'Descanso',
  nada: 'Sin registrar',
  extra: 'Fuera de plan',
  futuro: 'Por venir',
};

export const COLOR_VEREDICTO: Record<Veredicto, string> = {
  completo: 'ok', parcial: 'warn', descanso: 'dim',
  nada: 'bad', extra: 'nado', futuro: 'dim',
};

export interface DiaCumplido {
  fecha: string;
  nombre: string;
  planificadas: { disciplina: string; titulo: string }[];
  hechas: Actividad[];
  faltantes: string[];
  fueraDePlan: string[];
  descanso: boolean;
  veredicto: Veredicto;
}

/**
 * Compara lo planificado contra lo que dice Strava.
 *
 * El brick cuenta como carrera: en Strava una salida de bici seguida de un
 * trote son dos actividades, no una etiqueta especial.
 */
export function evaluarDia(
  fecha: string,
  nombre: string,
  planificadas: { disciplina: string; titulo: string }[],
  actividades: Actividad[],
  descanso: boolean,
  hoy: string,
): DiaCumplido {
  const hechas = actividades.filter(a => a.fecha === fecha);
  const hechasDisc = new Set(hechas.map(a => a.disciplina === 'brick' ? 'corre' : a.disciplina));

  const requeridas = [...new Set(
    planificadas
      .map(p => (p.disciplina === 'brick' ? 'corre' : p.disciplina))
      .filter(d => DEL_PLAN.has(d))
  )];

  const faltantes = requeridas.filter(d => !hechasDisc.has(d));
  const fueraDePlan = [...hechasDisc].filter(
    d => DEL_PLAN.has(d) && !requeridas.includes(d)
  );

  let veredicto: Veredicto;
  if (descanso) veredicto = 'descanso';
  else if (fecha > hoy) veredicto = 'futuro';
  else if (!requeridas.length) veredicto = hechas.length ? 'extra' : 'descanso';
  else if (!faltantes.length) veredicto = 'completo';
  else if (faltantes.length === requeridas.length) {
    veredicto = fueraDePlan.length ? 'extra' : 'nada';
  } else veredicto = 'parcial';

  return { fecha, nombre, planificadas, hechas, faltantes, fueraDePlan, descanso, veredicto };
}

/** Una clase de spinning de una hora son ~18 km (dato de Miguel, aproximado). */
export const KM_HORA_INDOOR = 18;

export interface TotalesSemana {
  nadoM: number; biciKm: number; correKm: number; sesionesFuerza: number; horas: number;
  /** Rodillo y spinning: cuentan tiempo pero Strava no les da distancia. */
  biciIndoorN: number; biciIndoorH: number; biciIndoorKm: number;
}

/**
 * Suma el volumen de una lista de actividades.
 *
 * El detalle que importa: una sesion de spinning o de rodillo entra en Strava
 * como Ride con distance = 0. Si solo se miran kilometros, una semana con dos
 * spinnings se ve identica a una semana sin tocar la bici — y el panel estaria
 * mintiendo justo en la disciplina mas floja.
 *
 * Se estiman a 18 km/h, que es lo que marca la clase. Es una estimacion y se
 * dice que lo es: se guarda aparte en biciIndoorKm para poder mostrar cuanto
 * del total no viene del GPS. La alternativa —no contarlos— era peor: dejaba en
 * cero una semana en la que si pedaleo dos horas.
 */
export function totalizar(actividades: Actividad[]): TotalesSemana {
  const t: TotalesSemana = {
    nadoM: 0, biciKm: 0, correKm: 0, sesionesFuerza: 0, horas: 0,
    biciIndoorN: 0, biciIndoorH: 0, biciIndoorKm: 0,
  };
  for (const a of actividades) {
    if (a.disciplina === 'nado') t.nadoM += a.metros;
    else if (a.disciplina === 'bici') {
      if (a.metros === 0) {
        const horas = a.segundos / 3600;
        const km = horas * KM_HORA_INDOOR;
        t.biciIndoorN += 1; t.biciIndoorH += horas; t.biciIndoorKm += km;
        t.biciKm += km;
      } else {
        t.biciKm += a.metros / 1000;
      }
    }
    else if (a.disciplina === 'corre') t.correKm += a.metros / 1000;
    else if (a.disciplina === 'fuerza') t.sesionesFuerza += 1;
    if (a.disciplina !== 'caminata') t.horas += a.segundos / 3600;
  }
  return {
    nadoM: Math.round(t.nadoM),
    biciKm: +t.biciKm.toFixed(1),
    correKm: +t.correKm.toFixed(1),
    sesionesFuerza: t.sesionesFuerza,
    horas: +t.horas.toFixed(1),
    biciIndoorN: t.biciIndoorN,
    biciIndoorH: +t.biciIndoorH.toFixed(1),
    biciIndoorKm: +t.biciIndoorKm.toFixed(1),
  };
}

export function pct(hecho: number, objetivo: number): number {
  if (!objetivo) return hecho ? 100 : 0;
  return Math.round((hecho / objetivo) * 100);
}

export function duracion(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.round((segundos % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

export const ICONO: Record<string, string> = {
  nado: '🏊', bici: '🚴', corre: '🏃', fuerza: '💪',
  brick: '🔁', caminata: '🚶', otro: '•',
};
