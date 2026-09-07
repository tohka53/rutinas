// Conexión con Strava: autorización, refresco de token y sincronización.
//
// Dónde viven las credenciales
// ----------------------------
// El client id y el client secret de la aplicación de Strava se guardan en
// Supabase (rutina_config), no en variables de entorno de Vercel. Se pegan una
// sola vez desde la propia app: Cumplimiento → Conectar Strava.
//
// La razón es práctica. Agregar variables en Vercel obliga a pasar por el panel
// o la CLI y a volver a desplegar, y ahí es donde se rompe: un valor pegado en
// el campo equivocado deja el sitio mudo hasta el próximo deploy. Un formulario
// escribe en la base y hace efecto en el acto, sin desplegar nada. Es el mismo
// criterio que ya se usaba para el token.
//
// Si existen STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET en el entorno se usan como
// respaldo, para no romperle nada a quien ya las tenga puestas. Gana la base,
// porque es la única que se puede corregir sin desplegar.
//
// Rutas (todas bajo /api/strava):
//   ?accion=estado       → si está configurado, si está conectado, último sync
//   ?accion=configurar   → POST {clientId, clientSecret}; guarda las credenciales
//   ?accion=conectar     → devuelve la URL de autorización de Strava
//   ?code=...            → callback de Strava; guarda los tokens y vuelve a la app
//   ?accion=sync         → trae lo nuevo y lo guarda en rutina_actividad
//   ?accion=desconectar  → olvida los tokens (las credenciales quedan)

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

/**
 * Credenciales de la aplicación de Strava. Primero la base (se corrige desde la
 * app), después el entorno (respaldo para quien ya las tenía en Vercel).
 */
async function credenciales(db) {
  const [id, secret] = await Promise.all([
    db.config('strava_client_id'),
    db.config('strava_client_secret'),
  ]);
  // `||` y no `??`: una fila vaciada guarda '' , no null, y eso tambien significa
  // "no hay credencial" — con `??` una fila en blanco taparia el respaldo.
  return {
    clientId: String(id || process.env.STRAVA_CLIENT_ID || '').trim(),
    clientSecret: String(secret || process.env.STRAVA_CLIENT_SECRET || '').trim(),
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

/**
 * Devuelve el número solo si Strava mandó uno de verdad.
 *
 * La diferencia entre `null` y `0` no es cosmética acá: una sesión sin banda
 * cardíaca tiene que quedar como "no se sabe". Si entra como 0, el promedio de
 * la semana se hunde y el máximo observado —el número que calibra las zonas—
 * se calcula sobre datos que nunca existieron.
 */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Todo lo que el listado de actividades de Strava trae y sirve para analizar.
 *
 * Viene todo en la misma respuesta, así que guardarlo no cuesta ni una petición
 * extra — y cada campo que no se guarde hoy es una pregunta que no se va a
 * poder responder mañana sobre el historial viejo.
 */
function aFila(a) {
  const disciplina = MAPA[a.sport_type ?? a.type] ?? 'otro';
  const inicio = a.start_date_local ?? a.start_date ?? '';
  return {
    strava_id: a.id,
    fecha: inicio.slice(0, 10),
    disciplina,
    sport_type: a.sport_type ?? a.type ?? null,
    nombre: a.name ?? null,
    metros: Math.round(a.distance ?? 0),
    segundos: Math.round(a.moving_time ?? 0),
    desnivel: Math.round(a.total_elevation_gain ?? 0),
    calorias: num(a.calories),
    esfuerzo: num(a.suffer_score),

    // -------- frecuencia cardíaca: lo que calibra las zonas
    fc_media: num(a.average_heartrate),
    fc_max: num(a.max_heartrate),

    // -------- técnica y ritmo
    cadencia: num(a.average_cadence),
    vel_media: num(a.average_speed),
    vel_max: num(a.max_speed),

    // -------- potencia. `device_watts` separa lo medido de lo estimado: un
    // watt estimado no sirve para calcular FTP y hay que poder distinguirlo.
    watts_medios: num(a.average_watts),
    watts_max: num(a.max_watts),
    watts_ponderados: num(a.weighted_average_watts),
    kilojoules: num(a.kilojoules),
    watts_de_medidor: typeof a.device_watts === 'boolean' ? a.device_watts : null,

    // -------- contexto
    segundos_totales: a.elapsed_time != null ? Math.round(a.elapsed_time) : null,
    indoor: typeof a.trainer === 'boolean' ? a.trainer : null,
    tipo_entreno: num(a.workout_type),
    inicio: inicio || null,
    equipo: a.gear_id ?? null,
    prs: num(a.pr_count),
    logros: num(a.achievement_count),
  };
}

/** Las zonas guardadas en config. JSON corrupto devuelve null, no rompe. */
function parseZonas(txt) {
  if (!txt) return null;
  try {
    const z = JSON.parse(txt);
    return z && typeof z === 'object' ? z : null;
  } catch { return null; }
}

/**
 * Trae las zonas cardíacas y de potencia del perfil de Strava.
 *
 * Se llama dentro del sync y nunca sola: es una petición más contra el mismo
 * límite de la API, y las zonas cambian una vez al año, no cada hora. Si falla
 * devuelve null y el sync sigue — perder las zonas no puede costar las
 * actividades.
 */
async function traerZonas(token) {
  try {
    const r = await fetch(`${STRAVA_API}/athlete/zones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const z = await r.json();
    return {
      fc: z?.heart_rate?.zones ?? null,
      fcPersonalizadas: z?.heart_rate?.custom_zones ?? null,
      potencia: z?.power?.zones ?? null,
    };
  } catch { return null; }
}

function leerCuerpo(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, CODIGO_ACCESO } = process.env;

  if (!SUPABASE_SECRET_KEY || !CODIGO_ACCESO) {
    return res.status(500).json({
      error: 'Faltan variables de entorno en Vercel',
      faltan: [!SUPABASE_SECRET_KEY && 'SUPABASE_SECRET_KEY', !CODIGO_ACCESO && 'CODIGO_ACCESO'].filter(Boolean),
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
      const { clientId, clientSecret } = await credenciales(db);
      if (!clientId || !clientSecret) {
        return res.status(409).send('Strava no está configurado. Volvé a la app y pegá el Client ID y el Client Secret.');
      }
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
          client_id: clientId, client_secret: clientSecret,
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

    // ---------------------------------------------------------- configurar
    // Guarda las credenciales de la aplicación de Strava. El secret entra y no
    // vuelve a salir: ninguna respuesta de este archivo lo incluye.
    if (accion === 'configurar') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'configurar se manda por POST' });
      }
      const cuerpo = leerCuerpo(req);
      const clientId = String(cuerpo.clientId ?? '').trim();
      const clientSecret = String(cuerpo.clientSecret ?? '').trim();

      if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Faltan el Client ID o el Client Secret.' });
      }
      // El Client ID de Strava es un número y viaja en la URL de autorización.
      // Es lo único que vale la pena validar: si no es numérico, casi siempre es
      // que los dos campos van al revés.
      if (!/^\d+$/.test(clientId)) {
        return res.status(400).json({
          error: /^\d+$/.test(clientSecret)
            ? 'Parece que los campos están al revés: el Client ID es el número corto.'
            : 'El Client ID de Strava es un número (ej. 123456).',
        });
      }

      // Si cambia la aplicación, los tokens viejos ya no sirven: eran de la
      // aplicación anterior. Se limpian para que no quede un "conectado" falso.
      const anterior = await db.config('strava_client_id');
      const cambio = anterior && anterior !== clientId;
      await db.guardarConfig({
        strava_client_id: clientId,
        strava_client_secret: clientSecret,
        ...(cambio ? { strava_access_token: '', strava_refresh_token: '', strava_expira_en: '', strava_atleta: '' } : {}),
      });
      return res.status(200).json({ ok: true, configurado: true, reconectar: !!cambio });
    }

    // --------------------------------------------------------------- estado
    if (accion === 'estado') {
      const [{ clientId, clientSecret }, refresh, ultimo, atleta, zonas] = await Promise.all([
        credenciales(db),
        db.config('strava_refresh_token'),
        db.config('strava_ultimo_sync'),
        db.config('strava_atleta'),
        db.config('strava_zonas'),
      ]);
      return res.status(200).json({
        configurado: !!(clientId && clientSecret),
        conectado: !!(clientId && clientSecret && refresh),
        ultimoSync: ultimo || null,
        atleta: atleta || null,
        // Las zonas se guardan como JSON en config al sincronizar. Si el JSON
        // quedó corrupto se devuelve null en vez de romper el estado entero:
        // sin zonas la app funciona, sin estado no.
        zonas: parseZonas(zonas),
        // Para mostrar en la app el valor exacto que pide Strava en
        // "Authorization Callback Domain", sin que haya que adivinarlo.
        dominio: req.headers.host ?? '',
      });
    }

    // ------------------------------------------------------------ desconectar
    if (accion === 'desconectar') {
      await db.guardarConfig({
        strava_access_token: '', strava_refresh_token: '',
        strava_expira_en: '', strava_atleta: '', strava_oauth_state: '',
      });
      return res.status(200).json({ ok: true, conectado: false });
    }

    // ------------------------------------------------------------- conectar
    if (accion === 'conectar') {
      const { clientId, clientSecret } = await credenciales(db);
      if (!clientId || !clientSecret) {
        return res.status(409).json({
          error: 'Falta configurar Strava',
          configurado: false,
          ayuda: 'Pegá el Client ID y el Client Secret de tu aplicación de Strava.',
        });
      }
      const estado = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      await db.guardarConfig({ strava_oauth_state: estado });
      const auth = new URL(`${STRAVA_OAUTH}/authorize`);
      auth.searchParams.set('client_id', clientId);
      auth.searchParams.set('redirect_uri', `${origen}/api/strava`);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('approval_prompt', 'auto');
      auth.searchParams.set('scope', 'activity:read_all');
      auth.searchParams.set('state', estado);
      return res.status(200).json({ url: auth.toString() });
    }

    // ----------------------------------------------------------------- sync
    if (accion === 'sync') {
      const { clientId, clientSecret } = await credenciales(db);
      if (!clientId || !clientSecret) {
        return res.status(409).json({ error: 'Falta configurar Strava', configurado: false });
      }
      const token = await accessToken(db, clientId, clientSecret);
      if (!token) return res.status(409).json({ error: 'Strava no está conectado todavía', configurado: true });

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

      // Las zonas viajan con el sync: son el otro lado de la FC que se acaba de
      // guardar, y sin ellas no hay contra qué contrastarla.
      const zonas = await traerZonas(token);

      await db.guardarConfig({
        strava_ultimo_sync: new Date().toISOString(),
        strava_ultimo_epoch: ahora,
        ...(zonas ? { strava_zonas: JSON.stringify(zonas) } : {}),
      });

      const porDisciplina = filas.reduce((a, f) => ((a[f.disciplina] = (a[f.disciplina] ?? 0) + 1), a), {});
      return res.status(200).json({ ok: true, guardadas, porDisciplina, desde: after });
    }

    return res.status(400).json({
      error: 'acción inválida',
      validas: ['estado', 'configurar', 'conectar', 'sync', 'desconectar'],
    });
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
