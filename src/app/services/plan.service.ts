import { Injectable, computed, signal, inject, effect } from '@angular/core';
import { SEMANAS, INICIO_PLAN, type Semana } from '../data/plan.data';
import { SEMANA_BASE, type DiaBase } from '../data/sesiones.data';
import { CARRERAS, type Carrera } from '../data/carreras.data';
import { TIPOS_DIA, MENUS } from '../data/nutricion.data';
import { StorageService } from './storage.service';
import {
  calcularAdaptacion, aplicarAdaptacion, SIN_AJUSTE, type Adaptacion,
} from '../data/adaptacion';

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function desdeIso(s: string): Date {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}
export function diasEntre(a: Date, b: Date): number {
  const ms = desdeIso(iso(b)).getTime() - desdeIso(iso(a)).getTime();
  return Math.round(ms / 86400000);
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fechaCorta(s: string): string {
  const d = desdeIso(s);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}
export function fechaLarga(s: string): string {
  const d = desdeIso(s);
  return `${d.getDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.getMonth()]} de ${d.getFullYear()}`;
}

const CLAVE_ADAPTAR = 'rutina703.adaptar';

function leerAdaptar(): boolean {
  try { return localStorage.getItem(CLAVE_ADAPTAR) !== '0'; } catch { return true; }
}

@Injectable({ providedIn: 'root' })
export class PlanService {
  private store = inject(StorageService);

  /** Fecha "de hoy". Se puede mover para revisar otros días del plan. */
  readonly hoy = signal<string>(iso(new Date()));

  /**
   * Si el plan se sube solo cuando entrena de más. Encendido por defecto.
   * Vive en el navegador porque es una preferencia de cómo mirar el plan, no un
   * dato: perderla no pierde nada, el ajuste se recalcula igual desde Strava.
   */
  readonly adaptar = signal<boolean>(leerAdaptar());

  constructor() {
    effect(() => {
      try { localStorage.setItem(CLAVE_ADAPTAR, this.adaptar() ? '1' : '0'); } catch { /* sin persistencia */ }
    });
  }

  /** Cuánto subió el plan por lo que realmente entrenó, y de dónde salió. */
  readonly adaptacion = computed<Adaptacion>(() =>
    this.adaptar()
      ? calcularAdaptacion(SEMANAS, this.store.actividades(), this.hoy())
      : { factores: SIN_AJUSTE, pasos: [] });

  /** Las 60 semanas con los objetivos ya ajustados. */
  readonly semanas = computed<Semana[]>(() => {
    const f = this.adaptacion().factores;
    return SEMANAS.map(s => aplicarAdaptacion(s, f));
  });

  readonly semanaActual = computed<Semana>(() => {
    const h = desdeIso(this.hoy());
    const d = diasEntre(desdeIso(INICIO_PLAN), h);
    const n = Math.floor(d / 7) + 1;
    const ss = this.semanas();
    if (n < 1) return ss[0];
    if (n > ss.length) return ss[ss.length - 1];
    return ss[n - 1];
  });

  /** true cuando la fecha de hoy cae antes de que arranque el plan. */
  readonly antesDelPlan = computed(() => diasEntre(desdeIso(INICIO_PLAN), desdeIso(this.hoy())) < 0);

  readonly diaSemana = computed<number>(() => {
    const wd = desdeIso(this.hoy()).getDay();   // 0 = domingo
    return wd === 0 ? 7 : wd;
  });

  readonly diaBaseHoy = computed<DiaBase>(
    () => SEMANA_BASE.find(d => d.dow === this.diaSemana()) ?? SEMANA_BASE[0]
  );

  readonly macrosHoy = computed(() => TIPOS_DIA[this.diaBaseHoy().tipoDia]);
  readonly menuHoy = computed(() => MENUS[this.diaBaseHoy().tipoDia]);

  /** Fechas de cada día de la semana actual, de lunes a domingo. */
  readonly fechasSemana = computed<string[]>(() => {
    const ini = desdeIso(this.semanaActual().inicio);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ini);
      d.setDate(ini.getDate() + i);
      return iso(d);
    });
  });

  readonly carrerasOrdenadas = computed<(Carrera & { faltan: number })[]>(() => {
    const h = desdeIso(this.hoy());
    return CARRERAS
      .map(c => ({ ...c, faltan: diasEntre(h, desdeIso(c.fecha)) }))
      .sort((a, b) => a.faltan - b.faltan);
  });

  readonly proximaCarrera = computed(
    () => this.carrerasOrdenadas().find(c => c.faltan >= 0) ?? null
  );

  /** Sustituye los marcadores de la sesión larga por lo que toca esta semana. */
  sesionesDelDia(dow: number, semana: Semana) {
    const base = SEMANA_BASE.find(d => d.dow === dow);
    if (!base) return [];
    return base.sesiones.map(s => {
      if (dow === 6 && s.disciplina === 'nado') {
        return { ...s, titulo: `Natación larga — ${semana.nadoLargo}` };
      }
      if (dow === 7 && s.disciplina === 'bici') {
        return { ...s, titulo: `Bici larga — ${semana.biciLarga}` };
      }
      if (dow === 7 && s.disciplina === 'brick' && semana.correLarga.startsWith('CARRERA')) {
        return { ...s, titulo: semana.correLarga };
      }
      if (dow === 5 && s.disciplina === 'corre') {
        // En semana de carrera, correLarga es la carrera del domingo. Pegarla
        // acá dejaba un "Trote suave — CARRERA 21.1 km" el viernes.
        return semana.correLarga.startsWith('CARRERA')
          ? { ...s, titulo: 'Trote suave — soltar piernas' }
          : { ...s, titulo: `Trote suave — ${semana.correLarga}` };
      }
      return s;
    });
  }
}
