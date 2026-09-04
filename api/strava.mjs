// Conexión con Strava: autorización, refresco de token y sincronización.
//
// El token vive en Supabase (rutina_config), no en variables de entorno. Así
// son dos variables menos que configurar, y si Strava rota el refresh token al
// renovarlo, la fila se reescribe sola — una variable de entorno no puede.
//
// Variables de entorno requeridas, además de las de /api/datos:
//   STRAVA_CLIENT_ID      de strava.com/settings/api
//   STRAVA_CLIENT_SECRET  de la misma página
//
// Rutas (todas bajo /api/strava):
//   ?accion=estado    → si está conectado y cuándo fue el último sync
//   ?accion=conectar  → redirige a Strava para autorizar (una sola vez)
//   ?code=...         → callback de Strava; guarda los tokens y vuelve a la app
//   ?accion=sync      → trae lo nuevo y lo guarda en rutina_actividad

const URL_POR_DEFECTO = 'https://mlpdqxpdvxhpsgspkccn.supabase.co';
const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_OAUTH = 'https://www.strava.com/oauth';

/** Mapa de sport_type de Strava a las disciplinas del plan. */
const MAPA = {
  Swim: 'nado',
  Ride: 'bici', VirtualRide: 'bici', EBikeRide: 'bici',
  MountainBikeRide: 'bici', GravelRide: 'bici', Handcycle: 'bici',
  Run: 'corre', TrailRun: 'corre', VirtualRun: 'corre',
  HighIntensityIntervalTraining: 'fuerza', WeightTraining: 'fuerza',
  Crossfit: 'fuerza', Workout: 'fuerza', Rowing: 'fuerza',
  Elliptical: 'fuerza', StairStepper: 'fuerza',
  Walk: 'caminata', Hike: 'caminata',
};

function codigoValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string') return false;
  if (recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < recibido.length; i++) dif |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return dif === 0;
}

function supabase(url, key) {
  const base = String(url).replace(/\/+$/, '');
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  return {
    async config(clave) {
      const r = await fetch(`${base}/rest/v1/rutina_config?clave=eq.${encodeURIComponent(clave)}&select=valor`, { headers: h });
      if (!r.ok) throw new Error(`config ${clave}: ${r.status} ${await r.text()}`);
      const filas = await r.json();
      return filas[0]?.valor ?? null;
    },
    async guardarConfig(pares) {
      const filas = Object.entries(pares).map(([clave, valor]) => ({ clave, valor: String(valor) }));
      const r = await fetch(`${base}/rest/v1/rutina_config`, {
        method: 'POST',
        headers: { ...h, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(filas),
      });
      if (!r.ok) throw new Error(`guardar config: ${r.status} ${await r.text()}`);
    },
    async guardarActividades(filas) {
      if (!filas.length) return 0;
      const r = await fetch(`${base}/rest/v1/rutina_actividad`, {
        method: 'POST',
        headers: { ...h, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(filas),
      });
      if (!r.ok) throw new Error(`guardar actividades: ${r.status} ${await r.text()}`);
      return filas.length;
    },
  };
}

/** Devuelve un access token válido, renovándolo si hace falta. */
async function accessToken(db, clientId, clientSecret) {
  const [access, expira, refresh] = await Promise.all([
    db.config('strava_access_token'),
    db.config('strava_expira_en'),
    db.config('strava_refresh_token'),
  ]);
  if (!refresh) return null;                       // todavía no autorizó

  // 5 min de margen: renovar justo al filo falla si la petición tarda.
  const ahora = Math.floor(Date.now() / 1000);
  if (access && expira && Number(expira) > ahora + 300) return access;

  const r = await fetch(`${STRAVA_OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId, client_secret: clientSecret,
      grant_type: 'refresh_token', refresh_token: refresh,
    }),
  });
  if (!r.ok) throw new Error(`refrescar token: ${r.status} ${await r.text()}`);
  const t = await r.json();

  // Strava puede devolver un refresh token distinto: hay que guardar el nuevo.
  await db.guardarConfig({
    strava_access_token: t.access_token,
    strava_refresh_token: t.refresh_token,
    strava_expira_en: t.expires_at,
  });
  return t.access_token;
}

function aFila(a) {
  const disciplina = MAPA[a.sport_type ?? a.type] ?? 'otro';
  return {
    strava_id: a.id,
    fecha: (a.start_date_local ?? a.start_date ?? '').slice(0, 10),
    disciplina,
    sport_type: a.sport_type ?? a.type ?? null,
    nombre: a.name ?? null,
    metros: Math.round(a.distance ?? 0),
    segundos: Math.round(a.moving_time ?? 0),
    desnivel: Math.round(a.total_elevation_gain ?? 0),
    calorias: a.calories ?? null,
    esfuerzo: a.suffer_score ?? null,
  };
}

export default async function handler(req, res) {
  const {
    SUPABASE_URL, SUPABASE_SECRET_KEY, CODIGO_ACCESO,
    STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET,
  } = process.env;

  if (!SUPABASE_SECRET_KEY || !CODIGO_ACCESO) {
    return res.status(500).json({
      error: 'Faltan variables de entorno en Vercel',
      faltan: [!SUPABASE_SECRET_KEY && 'SUPABASE_SECRET_KEY', !CODIGO_ACCESO && 'CODIGO_ACCESO'].filter(Boolean),
    });
  }
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Falta configurar Strava',
      faltan: [!STRAVA_CLIENT_ID && 'STRAVA_CLIENT_ID', !STRAVA_CLIENT_SECRET && 'STRAVA_CLIENT_SECRET'].filter(Boolean),
      ayuda: 'Creá una aplicación en strava.com/settings/api y agregá las dos variables en Vercel.',
    });
  }

  let urlBase = URL_POR_DEFECTO;
  const cand = (SUPABASE_URL ?? '').trim();
  if (cand) {
    try {
      const u = new URL(cand);
      if (/^https?:$/.test(u.protocol) && u.pathname === '/') urlBase = cand;
    } catch { /* se ignora y queda la de por defecto */ }
  }

  const db = supabase(urlBase, SUPABASE_SECRET_KEY);
  const url = new URL(req.url, `https://${req.headers.host}`);
  const accion = url.searchParams.get('accion');
  const code = url.searchParams.get('code');
  const origen = `https://${req.headers.host}`;

  try {
    // ------------------------------------------------------------- callback
    // Llega desde Strava después de autorizar. No lleva código de acceso
    // porque lo abre Strava, no la app: la defensa es el `state` de un solo uso.
    if (code) {
      const estadoRecibido = url.searchParams.get('state');
      const estadoEsperado = await db.config('strava_oauth_state');
      if (!estadoEsperado || estadoRecibido !== estadoEsperado) {
        return res.status(400).send('Estado de autorización inválido. Volvé a intentar desde la app.');
      }
      await db.guardarConfig({ strava_oauth_state: '' });   // un solo uso

      const r = await fetch(`${STRAVA_OAUTH}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID, client_secret: STRAVA_CLIENT_SECRET,
          grant_type: 'authorization_code', code,
        }),
      });
      if (!r.ok) return res.status(502).send(`Strava rechazó la autorización: ${await r.text()}`);
      const t = await r.json();
      await db.guardarConfig({
        strava_access_token: t.access_token,
        strava_refresh_token: t.refresh_token,
        strava_expira_en: t.expires_at,
        strava_atleta: t.athlete?.id ?? '',
      });
      res.writeHead(302, { Location: `${origen}/cumplimiento?strava=conectado` });
      return res.end();
    }

    // ------------------------------------ el resto sí exige código de acceso
    const codigo = req.headers['x-codigo'] ?? url.searchParams.get('codigo');
    if (!codigoValido(Array.isArray(codigo) ? codigo[0] : codigo, CODIGO_ACCESO)) {
      return res.status(401).json({ error: 'Código incorrecto' });
    }

    // --------------------------------------------------------------- estado
    if (accion === 'estado') {
      const [refresh, ultimo, atleta] = await Promise.all([
        db.config('strava_refresh_token'),
        db.config('strava_ultimo_sync'),
        db.config('strava_atleta'),
      ]);
      return res.status(200).json({
        conectado: !!refresh,
        ultimoSync: ultimo || null,
        atleta: atleta || null,
      });
    }

    // ------------------------------------------------------------- conectar
    if (accion === 'conectar') {
      const estado = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      await db.guardarConfig({ strava_oauth_state: estado });
      const auth = new URL(`${STRAVA_OAUTH}/authorize`);
      auth.searchParams.set('client_id', STRAVA_CLIENT_ID);
      auth.searchParams.set('redirect_uri', `${origen}/api/strava`);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('approval_prompt', 'auto');
      auth.searchParams.set('scope', 'activity:read_all');
      auth.searchParams.set('state', estado);
      return res.status(200).json({ url: auth.toString() });
    }

    // ----------------------------------------------------------------- sync
    if (accion === 'sync') {
      const token = await accessToken(db, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET);
      if (!token) return res.status(409).json({ error: 'Strava no está conectado todavía' });

      // Incremental: solo lo posterior al último sync, con 2 días de solape por
      // si una actividad se subió tarde o se editó después.
      const desdeParam = url.searchParams.get('desde');
      const ultimo = await db.config('strava_ultimo_epoch');
      const after = desdeParam ? Number(desdeParam)
        : ultimo ? Number(ultimo) - 2 * 86400
        : Math.floor(Date.now() / 1000) - 400 * 86400;   // primera vez: ~13 meses

      const filas = [];
      for (let pagina = 1; pagina <= 10; pagina++) {
        const r = await fetch(
          `${STRAVA_API}/athlete/activities?after=${after}&per_page=100&page=${pagina}`,
          { headers: { Authorization: `Bearer ${token}` } });
        if (r.status === 429) {
          return res.status(429).json({ error: 'Strava está limitando las peticiones. Probá en 15 minutos.' });
        }
        if (!r.ok) throw new Error(`actividades: ${r.status} ${await r.text()}`);
        const lote = await r.json();
        filas.push(...lote.map(aFila).filter(f => f.fecha));
        if (lote.length < 100) break;
      }

      const guardadas = await db.guardarActividades(filas);
      const ahora = Math.floor(Date.now() / 1000);
      await db.guardarConfig({
        strava_ultimo_sync: new Date().toISOString(),
        strava_ultimo_epoch: ahora,
      });

      const porDisciplina = filas.reduce((a, f) => ((a[f.disciplina] = (a[f.disciplina] ?? 0) + 1), a), {});
      return res.status(200).json({ ok: true, guardadas, porDisciplina, desde: after });
    }

    return res.status(400).json({ error: 'acción inválida', validas: ['estado', 'conectar', 'sync'] });
  } catch (e) {
    const detalle = String(e?.message ?? e);
    if (/\b(401|403)\b/.test(detalle) && /supabase|rutina_/i.test(detalle)) {
      return res.status(502).json({ error: 'Supabase no acepta la llave', detalle });
    }
    if (/does not exist|PGRST205/i.test(detalle)) {
      return res.status(502).json({
        error: 'Falta la tabla rutina_config',
        detalle: 'Corré supabase/migrations/0003_strava.sql en el SQL Editor.',
      });
    }
    return res.status(502).json({ error: 'Fallo hablando con Strava o Supabase', detalle });
  }
}
