// Función serverless de Vercel. Es el único punto que habla con Supabase.
//
// Por qué existe: la app es estática y pública. Si el navegador tuviera la llave
// de Supabase, el código de acceso sería decorativo — cualquiera abre DevTools,
// copia la llave y le pega directo a la API REST. Acá la llave vive en el
// servidor y el código se valida antes de tocar la base.
//
// Variables de entorno requeridas (Vercel → Settings → Environment Variables):
//   SUPABASE_URL         https://mlpdqxpdvxhpsgspkccn.supabase.co
//   SUPABASE_SECRET_KEY  sb_secret_...   (Settings → API Keys → Secret keys)
//   CODIGO_ACCESO        el código que escribís al entrar

const TABLAS = {
  peso: { tabla: 'rutina_peso', pk: ['fecha'], orden: 'fecha.asc' },
  sesion: { tabla: 'rutina_sesion', pk: ['fecha', 'indice'], orden: 'fecha.desc' },
  wod: { tabla: 'rutina_wod', pk: ['fecha'], orden: 'fecha.desc' },
  nota: { tabla: 'rutina_nota_semana', pk: ['semana'], orden: 'semana.asc' },
};

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

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !CODIGO_ACCESO) {
    return res.status(500).json({
      error: 'Faltan variables de entorno en Vercel',
      faltan: [
        !SUPABASE_URL && 'SUPABASE_URL',
        !SUPABASE_SECRET_KEY && 'SUPABASE_SECRET_KEY',
        !CODIGO_ACCESO && 'CODIGO_ACCESO',
      ].filter(Boolean),
    });
  }

  const codigo = req.headers['x-codigo'];
  if (!codigoValido(Array.isArray(codigo) ? codigo[0] : codigo, CODIGO_ACCESO)) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }

  const db = supabase(SUPABASE_URL, SUPABASE_SECRET_KEY);

  try {
    // ------------------------------------------------ GET: traer todo el estado
    if (req.method === 'GET') {
      const [pesos, sesiones, wods, notas] = await Promise.all([
        db.leer(TABLAS.peso.tabla, TABLAS.peso.orden),
        db.leer(TABLAS.sesion.tabla, TABLAS.sesion.orden),
        db.leer(TABLAS.wod.tabla, TABLAS.wod.orden),
        db.leer(TABLAS.nota.tabla, TABLAS.nota.orden),
      ]);
      return res.status(200).json({ pesos, sesiones, wods, notas });
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
      for (const campo of cfg.pk) {
        if (datos[campo] === undefined || datos[campo] === null) {
          return res.status(400).json({ error: `falta la clave ${campo}` });
        }
      }

      if (accion === 'borrar') {
        const filtro = Object.fromEntries(cfg.pk.map(k => [k, datos[k]]));
        await db.borrar(cfg.tabla, filtro);
        return res.status(200).json({ ok: true, borrado: filtro });
      }

      const [fila] = await db.guardar(cfg.tabla, datos);
      return res.status(200).json({ ok: true, fila });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    // El mensaje puede traer detalle de Postgres; útil para vos, y la ruta ya
    // está detrás del código de acceso.
    return res.status(502).json({ error: 'Fallo hablando con Supabase', detalle: String(e.message ?? e) });
  }
}
