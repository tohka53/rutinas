// Prueba api/strava.mjs de punta a punta: autorización, refresco y sync.
// Simula tanto PostgREST como la API de Strava.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

// ------------------------------------------------------- Supabase simulado
const config = new Map();
const actividades = new Map();
const supa = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const tabla = u.pathname.replace('/rest/v1/', '');
  if (req.headers.apikey !== 'sb_secret_PRUEBA') { res.writeHead(401); return res.end('{}'); }
  let b = ''; req.on('data', c => (b += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (tabla === 'rutina_config') {
      if (req.method === 'GET') {
        const clave = (u.searchParams.get('clave') ?? '').replace('eq.', '');
        const v = config.get(clave);
        res.writeHead(200); return res.end(JSON.stringify(v === undefined ? [] : [{ valor: v }]));
      }
      for (const f of JSON.parse(b)) config.set(f.clave, f.valor);
      res.writeHead(201); return res.end('[]');
    }
    if (tabla === 'rutina_actividad') {
      for (const f of JSON.parse(b)) actividades.set(f.strava_id, f);
      res.writeHead(201); return res.end('[]');
    }
    res.writeHead(404); res.end('{}');
  });
});
await new Promise(r => supa.listen(5701, r));

// --------------------------------------------------------- Strava simulado
let pedidosActividades = 0;
let tokenRefrescado = 0;
const strava = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/oauth/token') {
    let b = ''; req.on('data', c => (b += c));
    return req.on('end', () => {
      const m = JSON.parse(b);
      if (m.grant_type === 'refresh_token') tokenRefrescado++;
      res.writeHead(200);
      res.end(JSON.stringify({
        access_token: 'acc_' + Date.now(),
        refresh_token: m.grant_type === 'refresh_token' ? 'ref_rotado' : 'ref_inicial',
        expires_at: Math.floor(Date.now() / 1000) + 21600,
        athlete: { id: 93573062 },
      }));
    });
  }
  if (u.pathname === '/api/v3/athlete/activities') {
    pedidosActividades++;
    if (req.headers.authorization?.startsWith('Bearer acc_') !== true) {
      res.writeHead(401); return res.end('{"message":"Authorization Error"}');
    }
    const pagina = Number(u.searchParams.get('page') ?? 1);
    if (pagina > 1) { res.writeHead(200); return res.end('[]'); }
    res.writeHead(200);
    return res.end(JSON.stringify([
      { id: 1, sport_type: 'Swim', start_date_local: '2026-09-03T12:18:26Z', name: 'Lunch Swim',
        distance: 1700, moving_time: 2900, total_elevation_gain: 0 },
      { id: 2, sport_type: 'Ride', start_date_local: '2026-09-02T07:00:00Z', name: 'Morning Ride',
        distance: 19393.4, moving_time: 3438, total_elevation_gain: 206.3 },
      { id: 3, sport_type: 'HighIntensityIntervalTraining', start_date_local: '2026-09-02T16:20:09Z',
        name: 'Afternoon HIIT', distance: 0, moving_time: 2239, total_elevation_gain: 0 },
      { id: 4, sport_type: 'Walk', start_date_local: '2026-09-01T08:00:00Z', name: 'Morning Walk',
        distance: 6000, moving_time: 4677, total_elevation_gain: 218 },
    ]));
  }
  res.writeHead(404); res.end('{}');
});
await new Promise(r => strava.listen(5702, r));

process.env.SUPABASE_URL = 'http://localhost:5701';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_PRUEBA';
process.env.CODIGO_ACCESO = '1099513';
process.env.STRAVA_CLIENT_ID = '12345';
process.env.STRAVA_CLIENT_SECRET = 'secreto';

const mod = join(RAIZ, 'api', 'strava.mjs');
let handler = (await import(mod)).default;

// El módulo apunta a strava.com; para probar se redirigen esas URLs al stub.
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  let u = String(url);
  u = u.replace('https://www.strava.com/oauth', 'http://localhost:5702/oauth');
  u = u.replace('https://www.strava.com/api/v3', 'http://localhost:5702/api/v3');
  return fetchReal(u, opts);
};

function invocar(query, codigo = '1099513') {
  return new Promise(resolve => {
    const req = { method: 'GET', url: `/api/strava${query}`, headers: { 'x-codigo': codigo, host: 'app.test' } };
    const res = {
      _s: 200, _h: {},
      status(c) { this._s = c; return this; },
      setHeader(k, v) { this._h[k] = v; return this; },
      json(o) { resolve({ status: this._s, body: o, headers: this._h }); return this; },
      send(t) { resolve({ status: this._s, body: t, headers: this._h }); return this; },
      writeHead(c, h) { this._s = c; Object.assign(this._h, h ?? {}); return this; },
      end() { resolve({ status: this._s, body: null, headers: this._h }); return this; },
    };
    handler(req, res);
  });
}

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };

// 1. código incorrecto
let r = await invocar('?accion=estado', '0000');
ok('código incorrecto devuelve 401', r.status === 401, `status=${r.status}`);

// 2. estado sin conectar
r = await invocar('?accion=estado');
ok('estado inicial: no conectado', r.status === 200 && r.body.conectado === false, JSON.stringify(r.body));

// 3. sync sin conectar
r = await invocar('?accion=sync');
ok('sync sin conectar devuelve 409', r.status === 409, `status=${r.status}`);

// 4. conectar devuelve la URL de autorización bien armada
r = await invocar('?accion=conectar');
const auth = new URL(r.body.url ?? 'http://x');
ok('conectar devuelve URL de Strava', r.status === 200 && auth.host === 'www.strava.com');
ok('pide el scope activity:read_all', auth.searchParams.get('scope') === 'activity:read_all');
ok('el redirect_uri apunta a /api/strava',
   auth.searchParams.get('redirect_uri') === 'https://app.test/api/strava',
   auth.searchParams.get('redirect_uri') ?? '');
const estado = auth.searchParams.get('state');
ok('genera un state y lo guarda', !!estado && config.get('strava_oauth_state') === estado);

// 5. callback con state falso
r = await invocar(`?code=abc&state=inventado`);
ok('callback con state inválido se rechaza', r.status === 400, `status=${r.status}`);
ok('no guardó tokens con state inválido', !config.get('strava_refresh_token'));

// 6. callback correcto
r = await invocar(`?code=abc&state=${estado}`);
ok('callback correcto redirige a la app', r.status === 302, `status=${r.status}`);
ok('guardó el refresh token', config.get('strava_refresh_token') === 'ref_inicial');
ok('el state se invalida tras usarse', !config.get('strava_oauth_state'));

// 7. el mismo state no sirve dos veces
r = await invocar(`?code=abc&state=${estado}`);
ok('el state no se puede reusar', r.status === 400, `status=${r.status}`);

// 8. estado ya conectado
r = await invocar('?accion=estado');
ok('ahora reporta conectado', r.body.conectado === true);

// 9. sync trae y mapea
r = await invocar('?accion=sync');
ok('sync responde ok', r.status === 200 && r.body.ok, JSON.stringify(r.body).slice(0, 80));
ok('guardó las 4 actividades', actividades.size === 4, `guardadas=${actividades.size}`);
ok('mapea Swim → nado', actividades.get(1)?.disciplina === 'nado');
ok('mapea Ride → bici', actividades.get(2)?.disciplina === 'bici');
ok('mapea HIIT → fuerza', actividades.get(3)?.disciplina === 'fuerza');
ok('mapea Walk → caminata', actividades.get(4)?.disciplina === 'caminata');
ok('redondea la distancia a metros enteros', actividades.get(2)?.metros === 19393,
   String(actividades.get(2)?.metros));
ok('extrae la fecha local', actividades.get(1)?.fecha === '2026-09-03', actividades.get(1)?.fecha);
ok('guarda la marca de último sync', !!config.get('strava_ultimo_epoch'));

// 10. el token se reusa mientras siga vigente
const antes = tokenRefrescado;
await invocar('?accion=sync');
ok('no refresca el token si todavía vale', tokenRefrescado === antes,
   `refrescos=${tokenRefrescado - antes}`);

// 11. token vencido -> se refresca y se guarda el nuevo
config.set('strava_expira_en', String(Math.floor(Date.now() / 1000) - 10));
r = await invocar('?accion=sync');
ok('con el token vencido lo refresca', tokenRefrescado > antes);
ok('guarda el refresh token rotado', config.get('strava_refresh_token') === 'ref_rotado',
   config.get('strava_refresh_token') ?? '');

// 12. sync incremental: usa `after` en vez de traer todo
const pedidosAntes = pedidosActividades;
await invocar('?accion=sync');
ok('el sync siguiente sigue siendo incremental', pedidosActividades > pedidosAntes);

// 13. faltan las variables de Strava
delete process.env.STRAVA_CLIENT_SECRET;
r = await invocar('?accion=estado');
ok('sin STRAVA_CLIENT_SECRET avisa cuál falta',
   r.status === 500 && r.body.faltan?.includes('STRAVA_CLIENT_SECRET'), JSON.stringify(r.body.faltan));
process.env.STRAVA_CLIENT_SECRET = 'secreto';

// 14. no filtra secretos en las respuestas
r = await invocar('?accion=estado');
const txt = JSON.stringify(r.body);
ok('el estado no expone tokens ni secretos',
   !txt.includes('ref_') && !txt.includes('acc_') && !txt.includes('secreto'), txt);

supa.close(); strava.close();
console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
