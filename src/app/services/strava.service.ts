import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export type EstadoStrava = 'desconocido' | 'sin-configurar' | 'desconectado' | 'conectado';

@Injectable({ providedIn: 'root' })
export class StravaService {
  private api = inject(ApiService);

  readonly estado = signal<EstadoStrava>('desconocido');
  readonly ultimoSync = signal<string | null>(null);
  readonly sincronizando = signal(false);
  readonly mensaje = signal<string | null>(null);
  readonly faltan = signal<string[]>([]);

  private cabeceras(): HeadersInit {
    return { 'Content-Type': 'application/json', 'x-codigo': this.api.codigo() ?? '' };
  }

  async consultarEstado() {
    if (!this.api.codigo()) return;
    try {
      const r = await fetch('/api/strava?accion=estado', { headers: this.cabeceras() });
      const tipo = r.headers.get('content-type') ?? '';
      if (!tipo.includes('application/json')) { this.estado.set('desconocido'); return; }
      const c = await r.json();

      if (r.status === 500 && Array.isArray(c.faltan)) {
        this.estado.set('sin-configurar');
        this.faltan.set(c.faltan);
        return;
      }
      if (!r.ok) { this.estado.set('desconocido'); return; }

      this.estado.set(c.conectado ? 'conectado' : 'desconectado');
      this.ultimoSync.set(c.ultimoSync ?? null);
    } catch {
      this.estado.set('desconocido');
    }
  }

  /** Pide la URL de autorización y manda el navegador a Strava. */
  async conectar() {
    try {
      const r = await fetch('/api/strava?accion=conectar', { headers: this.cabeceras() });
      const c = await r.json();
      if (!r.ok || !c.url) {
        this.mensaje.set(c.ayuda ?? c.error ?? 'No se pudo iniciar la conexión con Strava.');
        return;
      }
      window.location.href = c.url;
    } catch {
      this.mensaje.set('No se pudo llegar al servidor.');
    }
  }

  /** Trae lo nuevo de Strava. Devuelve cuántas actividades entraron, o null si falló. */
  async sincronizar(): Promise<number | null> {
    if (this.sincronizando()) return null;
    this.sincronizando.set(true);
    this.mensaje.set(null);
    try {
      const r = await fetch('/api/strava?accion=sync', { headers: this.cabeceras() });
      const c = await r.json().catch(() => ({}));
      if (r.status === 409) {
        this.estado.set('desconectado');
        this.mensaje.set('Strava no está conectado todavía.');
        return null;
      }
      if (!r.ok) {
        this.mensaje.set(c.detalle ?? c.error ?? `Error ${r.status}`);
        return null;
      }
      this.estado.set('conectado');
      this.ultimoSync.set(new Date().toISOString());
      this.mensaje.set(c.guardadas
        ? `${c.guardadas} actividad(es) actualizadas.`
        : 'Sin actividades nuevas.');
      return c.guardadas ?? 0;
    } catch (e) {
      this.mensaje.set(`No se pudo sincronizar (${String((e as Error)?.message ?? e)}).`);
      return null;
    } finally {
      this.sincronizando.set(false);
    }
  }

  /**
   * Sincroniza al abrir la app, pero no más de una vez cada 6 horas.
   * Sin esto, cada navegación entre pestañas dispararía una llamada a Strava
   * y su límite de peticiones se agota rápido.
   */
  async sincronizarSiHaceFalta(): Promise<boolean> {
    await this.consultarEstado();
    if (this.estado() !== 'conectado') return false;
    const u = this.ultimoSync();
    if (u && Date.now() - new Date(u).getTime() < 6 * 3600 * 1000) return false;
    return (await this.sincronizar()) !== null;
  }
}
