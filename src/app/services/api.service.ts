import { Injectable, signal } from '@angular/core';

export type EstadoConexion = 'sin-codigo' | 'verificando' | 'conectado' | 'rechazado' | 'offline';

export interface FilaPeso { fecha: string; kg: number; nota?: string | null; }
export interface FilaSesion { fecha: string; indice: number; disciplina?: string | null; titulo?: string | null; hecha: boolean; nota?: string | null; }
export interface FilaWod { fecha: string; texto: string; escalado?: string | null; }
export interface FilaNota { semana: number; sensaciones?: string | null; sueno?: number | null; energia?: number | null; molestias?: string | null; }

export interface FilaDia {
  fecha: string; descanso: boolean; nota?: string | null;
  comidas?: Record<string, string> | null;
}
export interface FilaActividad {
  strava_id: number; fecha: string; disciplina: string; sport_type?: string | null;
  nombre?: string | null; metros: number; segundos: number;
  desnivel?: number; calorias?: number | null; esfuerzo?: number | null;
}

export interface Remoto {
  pesos: FilaPeso[]; sesiones: FilaSesion[]; wods: FilaWod[]; notas: FilaNota[];
  dias?: FilaDia[]; actividades?: FilaActividad[];
}

const CLAVE_CODIGO = 'rutina703.codigo';

function leerCodigo(): string | null {
  try { return localStorage.getItem(CLAVE_CODIGO); } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly codigo = signal<string | null>(leerCodigo());
  /**
   * Sin código no se entra. Con un código ya guardado sí se entra aunque el
   * servidor no responda: si no, una caída de red te deja afuera de tu propio
   * plan. Lo que protege tus datos es el 401 del servidor, no esta pantalla.
   */
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

      // Si vuelve HTML en vez de JSON, la función no existe: el navegador recibió
      // el index.html del SPA. Suele ser `ng serve` (sin funciones) o un Root
      // Directory mal puesto en Vercel, que deja api/ fuera del despliegue.
      const tipo = r.headers.get('content-type') ?? '';
      if (!tipo.includes('application/json')) {
        this.conexion.set('offline');
        this.ultimoError.set(
          'La ruta /api/datos no devolvió JSON, así que la función no está desplegada. ' +
          'Con `npm start` es lo esperado. En Vercel, revisá que Root Directory sea "rutinas".'
        );
        return null;
      }

      const cuerpo = await r.json().catch(() => ({} as any));

      if (r.status === 401) {
        this.conexion.set('rechazado');
        this.ultimoError.set('El código no es correcto.');
        return null;
      }
      if (r.status === 500 && Array.isArray(cuerpo.problemas)) {
        this.conexion.set('offline');
        this.ultimoError.set(cuerpo.problemas.join(' ') + ' Corregila y volvé a desplegar.');
        return null;
      }
      if (r.status === 500 && Array.isArray(cuerpo.faltan)) {
        this.conexion.set('offline');
        this.ultimoError.set(
          `Faltan variables de entorno en Vercel: ${cuerpo.faltan.join(', ')}. ` +
          'Agregalas y volvé a desplegar — las variables nuevas no aplican al deploy anterior.'
        );
        return null;
      }
      if (r.status === 502) {
        this.conexion.set('offline');
        this.ultimoError.set(`Supabase rechazó la consulta: ${cuerpo.detalle ?? 'sin detalle'}`);
        return null;
      }
      if (!r.ok) {
        this.conexion.set('offline');
        this.ultimoError.set(cuerpo.error ?? `Error ${r.status}`);
        return null;
      }

      this.conexion.set('conectado');
      this.ultimoError.set(null);
      return cuerpo as Remoto;
    } catch (e) {
      this.conexion.set('offline');
      this.ultimoError.set(`No se pudo llegar al servidor (${String((e as Error)?.message ?? e)}).`);
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
