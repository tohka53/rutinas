import { Injectable, computed, signal } from '@angular/core';
import { SEMANAS, INICIO_PLAN, type Semana } from '../data/plan.data';
import { SEMANA_BASE, type DiaBase } from '../data/sesiones.data';
import { CARRERAS, type Carrera } from '../data/carreras.data';
import { TIPOS_DIA, MENUS } from '../data/nutricion.data';

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

@Injectable({ providedIn: 'root' })
export class PlanService {
  /** Fecha "de hoy". Se puede mover para revisar otros días del plan. */
  readonly hoy = signal<string>(iso(new Date()));

  readonly semanaActual = computed<Semana>(() => {
    const h = desdeIso(this.hoy());
    const d = diasEntre(desdeIso(INICIO_PLAN), h);
    const n = Math.floor(d / 7) + 1;
    if (n < 1) return SEMANAS[0];
    if (n > SEMANAS.length) return SEMANAS[SEMANAS.length - 1];
    return SEMANAS[n - 1];
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
        return { ...s, titulo: `Trote suave — ${semana.correLarga}` };
      }
      return s;
    });
  }
}
