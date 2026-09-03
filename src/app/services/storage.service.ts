import { Injectable, signal, effect, inject, computed } from '@angular/core';
import { ApiService } from './api.service';
import type { Actividad } from '../data/cumplimiento';

export interface RegistroPeso { fecha: string; kg: number; nota?: string | null; }
export interface NotaSemana { sensaciones?: string | null; sueno?: number | null; energia?: number | null; molestias?: string | null; }

export interface Estado {
  pesos: RegistroPeso[];
  hechas: Record<string, boolean>;   // "YYYY-MM-DD:indice"
  wods: Record<string, string>;      // "YYYY-MM-DD" -> texto
  notas: Record<number, NotaSemana>; // semana -> nota
  descansos: Record<string, boolean>; // "YYYY-MM-DD" -> descanso deliberado
  actividades: Actividad[];           // importadas de Strava
  comidas: Record<string, Record<string, string>>; // fecha -> tiempo -> id de opción
}

interface Pendiente { tipo: string; accion: 'guardar' | 'borrar'; datos: any; }

const CLAVE = 'rutina703.v2';
const CLAVE_COLA = 'rutina703.cola';
const VACIO: Estado = { pesos: [], hechas: {}, wods: {}, notas: {}, descansos: {}, actividades: [], comidas: {} };

function leerLocal<T>(clave: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? { ...porDefecto, ...JSON.parse(raw) } : structuredClone(porDefecto);
  } catch {
    return structuredClone(porDefecto);   // modo privado, storage bloqueado, JSON corrupto
  }
}

function escribirLocal(clave: string, valor: unknown) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin persistencia */ }
}

/**
 * Fuente de verdad para el progreso.
 *
 * Escribe SIEMPRE en localStorage primero, así nunca se pierde un dato aunque
 * el servidor esté caído. Después intenta mandarlo a Supabase; si falla, queda
 * en una cola que se vacía en la siguiente carga exitosa.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private api = inject(ApiService);

  readonly estado = signal<Estado>(leerLocal(CLAVE, VACIO));
  readonly cola = signal<Pendiente[]>(leerLocal<Pendiente[]>(CLAVE_COLA, []));
  readonly sincronizando = signal(false);

  readonly conexion = this.api.conexion;
  readonly pendientes = computed(() => this.cola().length);

  constructor() {
    effect(() => escribirLocal(CLAVE, this.estado()));
    effect(() => escribirLocal(CLAVE_COLA, this.cola()));
    void this.sincronizar();
  }

  // ------------------------------------------------------------- sincronización
  async sincronizar() {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      // Primero se sube lo pendiente: si no, el estado remoto pisaría cambios
      // locales que todavía no llegaron a la base.
      await this.vaciarCola();

      const remoto = await this.api.cargar();
      if (!remoto) return;

      // Ya sin nada pendiente, el servidor manda.
      const pesos = (remoto.pesos ?? []).map(p => ({ fecha: p.fecha, kg: Number(p.kg), nota: p.nota }));
      const hechas: Record<string, boolean> = {};
      for (const s of remoto.sesiones ?? []) if (s.hecha) hechas[`${s.fecha}:${s.indice}`] = true;
      const wods: Record<string, string> = {};
      for (const w of remoto.wods ?? []) wods[w.fecha] = w.texto;
      const notas: Record<number, NotaSemana> = {};
      for (const n of remoto.notas ?? []) {
        notas[n.semana] = { sensaciones: n.sensaciones, sueno: n.sueno, energia: n.energia, molestias: n.molestias };
      }
      const descansos: Record<string, boolean> = {};
      const comidas: Record<string, Record<string, string>> = {};
      for (const d of remoto.dias ?? []) {
        if (d.descanso) descansos[d.fecha] = true;
        if (d.comidas && Object.keys(d.comidas).length) comidas[d.fecha] = d.comidas;
      }
      const actividades = (remoto.actividades ?? []) as Actividad[];

      this.estado.set({
        pesos: pesos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
        hechas, wods, notas, descansos, actividades, comidas,
      });
    } finally {
      this.sincronizando.set(false);
    }
  }

  private async vaciarCola() {
    const cola = this.cola();
    if (!cola.length) return;
    const quedan: Pendiente[] = [];
    for (const p of cola) {
      const ok = await this.api.escribir(p.tipo, p.accion, p.datos);
      if (!ok) quedan.push(p);
    }
    this.cola.set(quedan);
  }

  /** Manda al servidor; si no se puede, lo encola para el próximo intento. */
  private async empujar(tipo: string, accion: 'guardar' | 'borrar', datos: any) {
    const ok = await this.api.escribir(tipo, accion, datos);
    if (!ok) this.cola.update(c => [...c.filter(p => !mismaFila(p, tipo, datos)), { tipo, accion, datos }]);
  }

  // ------------------------------------------------------------------ sesiones
  estaHecha(clave: string): boolean { return !!this.estado().hechas[clave]; }

  marcar(clave: string, valor: boolean, meta?: { disciplina?: string; titulo?: string }) {
    this.estado.update(e => ({ ...e, hechas: { ...e.hechas, [clave]: valor } }));
    const [fecha, indice] = clave.split(':');
    void this.empujar('sesion', 'guardar', {
      fecha, indice: Number(indice), hecha: valor,
      disciplina: meta?.disciplina ?? null, titulo: meta?.titulo ?? null,
    });
  }

  // ---------------------------------------------------------------------- peso
  registrarPeso(fecha: string, kg: number, nota?: string) {
    this.estado.update(e => {
      const sinEse = e.pesos.filter(p => p.fecha !== fecha);
      return { ...e, pesos: [...sinEse, { fecha, kg, nota }].sort((a, b) => a.fecha.localeCompare(b.fecha)) };
    });
    void this.empujar('peso', 'guardar', { fecha, kg, nota: nota ?? null });
  }

  borrarPeso(fecha: string) {
    this.estado.update(e => ({ ...e, pesos: e.pesos.filter(p => p.fecha !== fecha) }));
    void this.empujar('peso', 'borrar', { fecha });
  }

  // ----------------------------------------------------------------------- WOD
  guardarWod(fecha: string, texto: string) {
    this.estado.update(e => ({ ...e, wods: { ...e.wods, [fecha]: texto } }));
    if (texto.trim()) void this.empujar('wod', 'guardar', { fecha, texto });
    else void this.empujar('wod', 'borrar', { fecha });
  }

  // -------------------------------------------------------------- nota semanal
  nota(semana: number): NotaSemana { return this.estado().notas[semana] ?? {}; }

  guardarNota(semana: number, nota: NotaSemana) {
    this.estado.update(e => ({ ...e, notas: { ...e.notas, [semana]: nota } }));
    void this.empujar('nota', 'guardar', { semana, ...nota });
  }

  // --------------------------------------------------------- día de descanso
  esDescanso(fecha: string): boolean { return !!this.estado().descansos[fecha]; }

  marcarDescanso(fecha: string, descanso: boolean) {
    this.estado.update(e => ({ ...e, descansos: { ...e.descansos, [fecha]: descanso } }));
    // rutina_dia guarda descanso y comidas juntos: se manda la fila completa
    // para no pisar lo otro con un upsert parcial.
    void this.empujar('dia', 'guardar',
      { fecha, descanso, comidas: this.estado().comidas[fecha] ?? {} });
  }

  // -------------------------------------------------------- comidas del día
  comidasDe(fecha: string): Record<string, string> {
    return this.estado().comidas[fecha] ?? {};
  }

  fijarComida(fecha: string, tiempo: string, id: string | null) {
    this.estado.update(e => {
      const previo = { ...(e.comidas[fecha] ?? {}) };
      if (id) previo[tiempo] = id; else delete previo[tiempo];
      return { ...e, comidas: { ...e.comidas, [fecha]: previo } };
    });
    void this.empujar('dia', 'guardar', {
      fecha,
      descanso: !!this.estado().descansos[fecha],
      comidas: this.estado().comidas[fecha] ?? {},
    });
  }

  limpiarComidas(fecha: string) {
    this.estado.update(e => ({ ...e, comidas: { ...e.comidas, [fecha]: {} } }));
    void this.empujar('dia', 'guardar',
      { fecha, descanso: !!this.estado().descansos[fecha], comidas: {} });
  }

  // ---------------------------------------------------- actividades de Strava
  readonly actividades = computed(() => this.estado().actividades);

  // ------------------------------------------------------------------ respaldo
  exportar(): string { return JSON.stringify(this.estado(), null, 2); }

  importar(json: string): boolean {
    try {
      const p = JSON.parse(json);
      this.estado.set({
        pesos: p.pesos ?? [], hechas: p.hechas ?? {}, wods: p.wods ?? {},
        notas: p.notas ?? {}, descansos: p.descansos ?? {}, actividades: p.actividades ?? [],
        comidas: p.comidas ?? {},
      });
      return true;
    } catch { return false; }
  }
}

/** Dos operaciones sobre la misma fila: la nueva pisa a la vieja en la cola. */
function mismaFila(p: Pendiente, tipo: string, datos: any): boolean {
  if (p.tipo !== tipo) return false;
  if (tipo === 'sesion') return p.datos.fecha === datos.fecha && p.datos.indice === datos.indice;
  if (tipo === 'nota') return p.datos.semana === datos.semana;
  return p.datos.fecha === datos.fecha;
}
