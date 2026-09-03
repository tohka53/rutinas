import { MENUS, type Comida } from './nutricion.data';

/**
 * Los cuatro menús no usan los mismos nombres de comida: el día grande tiene
 * "Desayuno pre-bici" y "Durante la bici", el ligero tiene "Merienda" donde el
 * medio tiene "Pre-entreno". Para poder mezclar hay que normalizarlos primero
 * a unos tiempos de comida comunes.
 */
export interface Tiempo { clave: string; etiqueta: string; hora: string; }

export const TIEMPOS: Tiempo[] = [
  { clave: 'desayuno', etiqueta: 'Desayuno', hora: '06:00' },
  { clave: 'media_manana', etiqueta: 'Media mañana', hora: '09:30' },
  { clave: 'almuerzo', etiqueta: 'Almuerzo', hora: '12:30' },
  { clave: 'merienda', etiqueta: 'Merienda / pre-entreno', hora: '16:00' },
  { clave: 'cena', etiqueta: 'Cena', hora: '20:00' },
  { clave: 'noche', etiqueta: 'Antes de dormir', hora: '22:00' },
];

/** A qué tiempo pertenece cada nombre de comida de los menús. */
function tiempoDe(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.startsWith('desayuno')) return 'desayuno';
  if (n.startsWith('media mañana') || n.startsWith('durante la bici') ||
      n.startsWith('recuperación')) return 'media_manana';
  if (n.startsWith('almuerzo')) return 'almuerzo';
  if (n.startsWith('pre-entreno') || n.startsWith('merienda')) return 'merienda';
  if (n.startsWith('cena')) return 'cena';
  if (n.startsWith('antes de dormir')) return 'noche';
  return 'merienda';
}

export interface OpcionComida {
  id: string;            // "tipo|nombre"
  tipo: string;
  nombre: string;
  etiqueta: string;      // lo que se ve en el select
  comida: Comida;
}

/** Todas las opciones disponibles por tiempo, sacadas de los cuatro menús. */
export const OPCIONES: Record<string, OpcionComida[]> = (() => {
  const out: Record<string, OpcionComida[]> = {};
  for (const t of TIEMPOS) out[t.clave] = [];
  for (const [tipo, comidas] of Object.entries(MENUS)) {
    for (const c of comidas) {
      const clave = tiempoDe(c.nombre);
      out[clave].push({
        id: `${tipo}|${c.nombre}`,
        tipo, nombre: c.nombre,
        etiqueta: `${tipo} · ${c.nombre} — ${c.kcal} kcal`,
        comida: c,
      });
    }
  }
  // Del más liviano al más pesado: elegir "algo ligero" es lo más común.
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.comida.kcal - b.comida.kcal);
  return out;
})();

const POR_ID = new Map<string, OpcionComida>(
  Object.values(OPCIONES).flat().map(o => [o.id, o])
);

export function opcionPorId(id: string): OpcionComida | undefined { return POR_ID.get(id); }

export interface TotalComido { kcal: number; p: number; c: number; g: number; }

export function sumar(seleccion: Record<string, string>): TotalComido {
  const t: TotalComido = { kcal: 0, p: 0, c: 0, g: 0 };
  for (const id of Object.values(seleccion)) {
    const o = POR_ID.get(id);
    if (!o) continue;
    t.kcal += o.comida.kcal; t.p += o.comida.p; t.c += o.comida.c; t.g += o.comida.g;
  }
  return {
    kcal: Math.round(t.kcal), p: +t.p.toFixed(1),
    c: +t.c.toFixed(1), g: +t.g.toFixed(1),
  };
}
