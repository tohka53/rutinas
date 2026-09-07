import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/**
 * `sin-configurar` = todavía no se pegaron el Client ID y el Client Secret.
 * `desconectado`   = ya están, pero falta autorizar en Strava.
 */
export type EstadoStrava = 'desconocido' | 'sin-configurar' | 'desconectado' | 'conectado';

/** Las zonas tal como las devuelve Strava: `max` viene en -1 en la última. */
export interface ZonasStrava {
  fc: { min: number; max: number }[] | null;
  fcPersonalizadas: boolean | null;
  potencia: { min: number; max: number }[] | null;
}

@Injectable({ providedIn: 'root' })
export class StravaService {
  private api = inject(ApiService);

  readonly estado = signal<EstadoStrava>('desconocido');
  readonly ultimoSync = signal<string | null>(null);
  readonly sincronizando = signal(false);
  readonly guardando = signal(false);
  readonly mensaje = signal<string | null>(null);
  /** Variables de entorno que faltan en Vercel (las de Supabase, no las de Strava). */
  readonly faltan = signal<string[]>([]);
  /** El dominio con el que responde el servidor: es el que pide Strava en el callback. */
  readonly dominio = signal<string>('');
  /**
   * Las zonas cardíacas y de potencia del perfil de Strava, tal como están
   * configuradas allá. Se refrescan con cada sync. null = todavía no se sabe.
   */
  readonly zonas = signal<ZonasStrava | null>(null);

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
        this.estado.set('desconocido');
        this.faltan.set(c.faltan);
        return;
      }
      if (!r.ok) { this.estado.set('desconocido'); return; }

      this.faltan.set([]);
      if (c.dominio) this.dominio.set(c.dominio);
      this.estado.set(c.conectado ? 'conectado' : c.configurado ? 'desconectado' : 'sin-configurar');
      this.ultimoSync.set(c.ultimoSync ?? null);
      this.zonas.set(c.zonas ?? null);
    } catch {
      this.estado.set('desconocido');
    }
  }

  /**
   * Guarda las credenciales de la aplicación de Strava y, si salió bien, manda
   * directo a autorizar. Son dos pasos que siempre van juntos: separarlos solo
   * agrega un botón más que tocar.
   */
  async configurar(clientId: string, clientSecret: string): Promise<boolean> {
    if (this.guardando()) return false;
    this.guardando.set(true);
    this.mensaje.set(null);
    try {
      const r = await fetch('/api/strava?accion=configurar', {
        method: 'POST',
        headers: this.cabeceras(),
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      const c = await r.json().catch(() => ({}));
      if (!r.ok) {
        this.mensaje.set(c.error ?? `No se pudo guardar (error ${r.status}).`);
        return false;
      }
      this.estado.set('desconectado');
      await this.conectar();
      return true;
    } catch {
      this.mensaje.set('No se pudo llegar al servidor.');
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  /** Pide la URL de autorización y manda el navegador a Strava. */
  async conectar() {
    try {
      const r = await fetch('/api/strava?accion=conectar', { headers: this.cabeceras() });
      const c = await r.json();
      if (!r.ok || !c.url) {
        if (c.configurado === false) this.estado.set('sin-configurar');
        this.mensaje.set(c.ayuda ?? c.error ?? 'No se pudo iniciar la conexión con Strava.');
        return;
      }
      window.location.href = c.url;
    } catch {
      this.mensaje.set('No se pudo llegar al servidor.');
    }
  }

  /** Olvida los tokens. Las credenciales quedan, así reconectar es un clic. */
  async desconectar() {
    try {
      await fetch('/api/strava?accion=desconectar', { headers: this.cabeceras() });
      this.estado.set('desconectado');
      this.ultimoSync.set(null);
      this.mensaje.set('Strava desconectado.');
    } catch {
      this.mensaje.set('No se pudo llegar al servidor.');
    }
  }

  /** Trae lo nuevo de Strava. Devuelve cuántas actividades entraron, o null si falló. */
  /**
   * Cuánto historial pide una resincronización completa. Strava guarda todo,
   * pero 13 meses cubre de sobra lo que este plan necesita comparar y no gasta
   * el límite de peticiones en años que no se van a mirar.
   */
  static readonly DIAS_HISTORIAL = 400;

  /**
   * Vuelve a bajar todo el historial, no solo lo nuevo.
   *
   * Hace falta cada vez que se agrega un campo a `rutina_actividad`: el sync
   * normal solo pide lo posterior al último, así que las filas viejas se
   * quedarían para siempre sin frecuencia cardíaca, sin cadencia y sin
   * potencia. Guardar es un upsert por `strava_id`, así que repetirlo no
   * duplica nada — reescribe cada fila con todos los campos.
   */
  async resincronizarTodo(): Promise<number | null> {
    const desde = Math.floor(Date.now() / 1000) - StravaService.DIAS_HISTORIAL * 86400;
    return this.sincronizar(desde);
  }

  async sincronizar(desde?: number): Promise<number | null> {
    if (this.sincronizando()) return null;
    this.sincronizando.set(true);
    this.mensaje.set(null);
    try {
      const url = desde ? `/api/strava?accion=sync&desde=${desde}` : '/api/strava?accion=sync';
      const r = await fetch(url, { headers: this.cabeceras() });
      const c = await r.json().catch(() => ({}));
      if (r.status === 409) {
        this.estado.set(c.configurado === false ? 'sin-configurar' : 'desconectado');
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
