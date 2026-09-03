import { Injectable, signal, effect } from '@angular/core';

export interface RegistroPeso { fecha: string; kg: number; }
export interface Estado {
  pesos: RegistroPeso[];
  hechas: Record<string, boolean>;   // clave "YYYY-MM-DD:indiceSesion"
  wods: Record<string, string>;      // clave "YYYY-MM-DD" -> WOD pegado
}

const CLAVE = 'rutina703.v1';
const VACIO: Estado = { pesos: [], hechas: {}, wods: {} };

function leer(): Estado {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return structuredClone(VACIO);
    const p = JSON.parse(raw);
    return { pesos: p.pesos ?? [], hechas: p.hechas ?? {}, wods: p.wods ?? {} };
  } catch {
    return structuredClone(VACIO);   // modo privado, storage bloqueado, JSON corrupto
  }
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly estado = signal<Estado>(leer());

  constructor() {
    effect(() => {
      const e = this.estado();
      try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* sin persistencia */ }
    });
  }

  marcar(clave: string, valor: boolean) {
    this.estado.update(e => ({ ...e, hechas: { ...e.hechas, [clave]: valor } }));
  }

  estaHecha(clave: string): boolean {
    return !!this.estado().hechas[clave];
  }

  registrarPeso(fecha: string, kg: number) {
    this.estado.update(e => {
      const sinEse = e.pesos.filter(p => p.fecha !== fecha);
      return { ...e, pesos: [...sinEse, { fecha, kg }].sort((a, b) => a.fecha.localeCompare(b.fecha)) };
    });
  }

  borrarPeso(fecha: string) {
    this.estado.update(e => ({ ...e, pesos: e.pesos.filter(p => p.fecha !== fecha) }));
  }

  guardarWod(fecha: string, texto: string) {
    this.estado.update(e => ({ ...e, wods: { ...e.wods, [fecha]: texto } }));
  }

  exportar(): string { return JSON.stringify(this.estado(), null, 2); }

  importar(json: string): boolean {
    try {
      const p = JSON.parse(json);
      this.estado.set({ pesos: p.pesos ?? [], hechas: p.hechas ?? {}, wods: p.wods ?? {} });
      return true;
    } catch { return false; }
  }
}
