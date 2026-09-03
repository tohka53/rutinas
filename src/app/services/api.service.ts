import { Injectable, signal } from '@angular/core';

export type EstadoConexion = 'sin-codigo' | 'verificando' | 'conectado' | 'rechazado' | 'offline';

export interface FilaPeso { fecha: string; kg: number; nota?: string | null; }
export interface FilaSesion { fecha: string; indice: number; disciplina?: string | null; titulo?: string | null; hecha: boolean; nota?: string | null; }
export interface FilaWod { fecha: string; texto: string; escalado?: string | null; }
export interface FilaNota { semana: number; sensaciones?: string | null; sueno?: number | null; energia?: number | null; molestias?: string | null; }

export interface Remoto { pesos: FilaPeso[]; sesiones: FilaSesion[]; wods: FilaWod[]; notas: FilaNota[]; }

const CLAVE_CODIGO = 'rutina703.codigo';

function leerCodigo(): string | null {
  try { return localStorage.getItem(CLAVE_CODIGO); } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly codigo = signal<string | null>(leerCodigo());
  readonly conexion = signal<EstadoConexion>(leerCodigo() ? 'verificando' : 'sin-codigo');
  readonly ultimoError = signal<string | null>(null);

  /** true cuando hay backend configurado y respondiendo. */
  get activo() { return this.conexion() === 'conectado'; }

  fijarCodigo(c: string) {
    const limpio = c.trim();
    try { localStorage.setItem(CLAVE_CODIGO, limpio); } catch { /* sin persistencia */ }
    this.codigo.set(limpio);
    this.conexion.set('verificando');
  }

  olvidarCodigo() {
    try { localStorage.removeItem(CLAVE_CODIGO); } catch { /* nada */ }
    this.codigo.set(null);
    this.conexion.set('sin-codigo');
  }

  private cabeceras(): HeadersInit {
    return { 'Content-Type': 'application/json', 'x-codigo': this.codigo() ?? '' };
  }

  /** Trae todo el estado remoto. null = no se pudo (sin código, offline o rechazado). */
  async cargar(): Promise<Remoto | null> {
    if (!this.codigo()) { this.conexion.set('sin-codigo'); return null; }
    try {
      const r = await fetch('/api/datos', { headers: this.cabeceras() });
      if (r.status === 401) {
        this.conexion.set('rechazado');
        this.ultimoError.set('El código no es correcto.');
        return null;
      }
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}));
        this.conexion.set('offline');
        this.ultimoError.set(cuerpo.error ?? `Error ${r.status}`);
        return null;
      }
      this.conexion.set('conectado');
      this.ultimoError.set(null);
      return await r.json();
    } catch {
      // Sin red, o corriendo con `ng serve` sin las funciones de Vercel.
      this.conexion.set('offline');
      this.ultimoError.set('No hay conexión con el servidor. Se guarda solo en este navegador.');
      return null;
    }
  }

  /** Guarda o borra una fila. false = no se pudo, hay que dejarla pendiente. */
  async escribir(tipo: string, accion: 'guardar' | 'borrar', datos: unknown): Promise<boolean> {
    if (!this.codigo()) return false;
    try {
      const r = await fetch('/api/datos', {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({ tipo, accion, datos }),
      });
      if (r.status === 401) { this.conexion.set('rechazado'); return false; }
      if (!r.ok) { this.conexion.set('offline'); return false; }
      this.conexion.set('conectado');
      return true;
    } catch {
      this.conexion.set('offline');
      return false;
    }
  }
}
