// Función serverless de Vercel. Es el único punto que habla con Supabase.
//
// Por qué existe: la app es estática y pública. Si el navegador tuviera la llave
// de Supabase, el código de acceso sería decorativo — cualquiera abre DevTools,
// copia la llave y le pega directo a la API REST. Acá la llave vive en el
// servidor y el código se valida antes de tocar la base.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   SUPABASE_SECRET_KEY  sb_secret_...   (Settings → API Keys → Secret keys)  [requerida]
//   CODIGO_ACCESO        el código que escribís al entrar                     [requerida]
//   SUPABASE_URL         opcional; si no está o es inválida se usa la de abajo
//
// La URL del proyecto no es un secreto: viaja en el bundle de cualquier app de
// Supabase en el navegador. Ponerla acá evita una variable de entorno más que
// configurar mal. Lo secreto es la llave, y esa nunca sale del servidor.
const URL_POR_DEFECTO = 'https://mlpdqxpdvxhpsgspkccn.supabase.co';

const TABLAS = {
  peso: { tabla: 'rutina_peso', pk: ['fecha'], orden: 'fecha.asc' },
  sesion: { tabla: 'rutina_sesion', pk: ['fecha', 'indice'], orden: 'fecha.desc' },
  wod: { tabla: 'rutina_wod', pk: ['fecha'], orden: 'fecha.desc' },
  nota: { tabla: 'rutina_nota_semana', pk: ['semana'], orden: 'semana.asc' },
  dia: { tabla: 'rutina_dia', pk: ['fecha'], orden: 'fecha.desc' },
  actividad: { tabla: 'rutina_actividad', pk: ['strava_id'], orden: 'fecha.desc' },
};

// Tablas que puede faltar por no haber corrido la migración 0002. Si no están,
// se devuelve una lista vacía en vez de tumbar toda la carga: el resto del
// dashboard tiene que seguir funcionando.
const OPCIONALES = new Set(['dia', 'actividad']);

/** Comparación en tiempo constante: no filtra el código por diferencia de tiempos. */
function codigoValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') return false;
  if (recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < recibido.length; i++) {
    dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return dif === 0;
}

function supabase(url, key) {
  const base = String(url).replace(/\/+$/, '');
  const cabeceras = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  return {
    async leer(tabla, orden) {
      const r = await fetch(`${base}/rest/v1/${tabla}?select=*&order=${orden}`, {
        headers: cabeceras,
      });
      if (!r.ok) throw new Error(`leer ${tabla}: ${r.status} ${await r.text()}`);
      return r.json();
    },
    async guardar(tabla, fila) {
      const r = await fetch(`${base}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...cabeceras, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) throw new Error(`guardar ${tabla}: ${r.status} ${await r.text()}`);
      return r.json();
    },
    async borrar(tabla, filtro) {
      const qs = Object.entries(filtro)
        .map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`)
        .join('&');
      const r = await fetch(`${base}/rest/v1/${tabla}?${qs}`, {
        method: 'DELETE',
        headers: cabeceras,
      });
      if (!r.ok) throw new Error(`borrar ${tabla}: ${r.status} ${await r.text()}`);
      return true;
    },
  };
}

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, CODIGO_ACCESO } = process.env;

  // Solo son obligatorias las dos que de verdad son secretas.
  if (!SUPABASE_SECRET_KEY || !CODIGO_ACCESO) {
    return res.status(500).json({
      error: 'Faltan variables de entorno en Vercel',
      faltan: [
        !SUPABASE_SECRET_KEY && 'SUPABASE_SECRET_KEY',
        !CODIGO_ACCESO && 'CODIGO_ACCESO',
      ].filter(Boolean),
    });
  }

  // La URL es opcional. Si falta, o si trae algo que no es una URL (pasa al
  // pegar un valor en el campo equivocado), se ignora y se usa la del proyecto.
  // Es pública, así que no hay nada que proteger; lo que no sirve es arrancar
  // con una URL rota.
  let urlBase = URL_POR_DEFECTO;
  const candidata = (SUPABASE_URL ?? '').trim();
  if (candidata) {
    let u = null;
    try { u = new URL(candidata); } catch { u = null; }
    if (u && /^https?:$/.test(u.protocol) && u.pathname === '/') urlBase = candidata;
  }

  // A propósito NO se valida el formato de la llave. Supabase tiene llaves
  // legacy (JWT), las nuevas sb_secret_, y puede cambiarlas cuando quiera:
  // adivinar el formato solo sirve para rechazar llaves que sí funcionan.
  // Quien decide si la llave vale es Supabase, y su respuesta se traduce abajo.

  const codigo = req.headers['x-codigo'];
  if (!codigoValido(Array.isArray(codigo) ? codigo[0] : codigo, CODIGO_ACCESO)) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }

  const db = supabase(urlBase, SUPABASE_SECRET_KEY);

  try {
    // ------------------------------------------------ GET: traer todo el estado
    if (req.method === 'GET') {
      // Las opcionales no deben tumbar la carga si falta la migración 0002.
      const opcional = (clave) =>
        db.leer(TABLAS[clave].tabla, TABLAS[clave].orden).catch(() => []);

      const [pesos, sesiones, wods, notas, dias, actividades] = await Promise.all([
        db.leer(TABLAS.peso.tabla, TABLAS.peso.orden),
        db.leer(TABLAS.sesion.tabla, TABLAS.sesion.orden),
        db.leer(TABLAS.wod.tabla, TABLAS.wod.orden),
        db.leer(TABLAS.nota.tabla, TABLAS.nota.orden),
        opcional('dia'),
        opcional('actividad'),
      ]);
      return res.status(200).json({ pesos, sesiones, wods, notas, dias, actividades });
    }

    // ------------------------------------------- POST: guardar o borrar una fila
    if (req.method === 'POST') {
      const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
      const { tipo, accion = 'guardar', datos } = cuerpo;

      const cfg = TABLAS[tipo];
      if (!cfg) {
        return res.status(400).json({ error: `tipo inválido: ${tipo}`, validos: Object.keys(TABLAS) });
      }
      if (!datos || typeof datos !== 'object') {
        return res.status(400).json({ error: 'falta el objeto datos' });
      }

      // Se acepta un arreglo para cargas masivas (la importación de Strava).
      const filas = Array.isArray(datos) ? datos : [datos];
      if (!filas.length) return res.status(400).json({ error: 'datos vacío' });
      if (filas.length > 500) {
        return res.status(400).json({ error: 'máximo 500 filas por llamada' });
      }
      for (const fila of filas) {
        for (const campo of cfg.pk) {
          if (fila?.[campo] === undefined || fila?.[campo] === null) {
            return res.status(400).json({ error: `falta la clave ${campo}` });
          }
        }
      }

      if (accion === 'borrar') {
        if (Array.isArray(datos)) {
          return res.status(400).json({ error: 'borrar acepta una sola fila' });
        }
        const filtro = Object.fromEntries(cfg.pk.map(k => [k, datos[k]]));
        await db.borrar(cfg.tabla, filtro);
        return res.status(200).json({ ok: true, borrado: filtro });
      }

      const guardadas = await db.guardar(cfg.tabla, Array.isArray(datos) ? datos : datos);
      return Array.isArray(datos)
        ? res.status(200).json({ ok: true, guardadas: guardadas.length })
        : res.status(200).json({ ok: true, fila: guardadas[0] });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    const detalle = String(e?.message ?? e);

    // Supabase rechaza la llave: es el caso que antes intentaba adivinar una
    // expresión regular sobre el formato. Mejor preguntarle a Supabase.
    if (/\b(401|403)\b/.test(detalle) || /invalid.*(api key|jwt)/i.test(detalle)) {
      return res.status(502).json({
        error: 'Supabase no acepta la llave',
        detalle:
          'SUPABASE_SECRET_KEY existe pero Supabase la rechaza. Suele ser la llave ' +
          'equivocada: tiene que ser la de Settings → API Keys → Secret keys ' +
          '(no la publishable, que no puede leer estas tablas por RLS). ' +
          'Actualizala en Vercel y volvé a desplegar.',
      });
    }

    // Las tablas no existen: falta correr la migración.
    if (/does not exist|PGRST205|relation .* does not exist/i.test(detalle)) {
      return res.status(502).json({
        error: 'Faltan las tablas en Supabase',
        detalle:
          'Corré supabase/migrations/0001_rutina_703.sql en el SQL Editor del proyecto.',
      });
    }

    // Resto: se devuelve tal cual. La ruta ya está detrás del código de acceso.
    return res.status(502).json({ error: 'Fallo hablando con Supabase', detalle });
  }
}
