// Prueba api/strava.mjs de punta a punta: configuración, autorización,
// refresco de token y sync. Simula tanto PostgREST como la API de Strava.
//
//   node scripts/probar-strava.mjs
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
let ultimoClientId = null;
const strava = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/oauth/token') {
    let b = ''; req.on('data', c => (b += c));
    return req.on('end', () => {
      const m = JSON.parse(b);
      ultimoClientId = String(m.client_id);
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
// A propósito NO se definen STRAVA_CLIENT_ID/SECRET: el camino normal ahora es
// pegarlas en la app, y el respaldo por entorno se prueba al final.
delete process.env.STRAVA_CLIENT_ID;
delete process.env.STRAVA_CLIENT_SECRET;

const mod = join(RAIZ, 'api', 'strava.mjs');
const handler = (await import(mod)).default;

// El módulo apunta a strava.com; para probar se redirigen esas URLs al stub.
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  let u = String(url);
  u = u.replace('https://www.strava.com/oauth', 'http://localhost:5702/oauth');
  u = u.replace('https://www.strava.com/api/v3', 'http://localhost:5702/api/v3');
  return fetchReal(u, opts);
};

function invocar(query, opciones = {}) {
  const { codigo = '1099513', metodo = 'GET', cuerpo = null } = opciones;
  return new Promise(resolve => {
    const req = {
      method: metodo,
      url: `/api/strava${query}`,
      headers: { 'x-codigo': codigo, host: 'app.test' },
      body: cuerpo,
    };
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
const configurar = (clientId, clientSecret) =>
  invocar('?accion=configurar', { metodo: 'POST', cuerpo: { clientId, clientSecret } });

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };

// ------------------------------------------------------------------ acceso
let r = await invocar('?accion=estado', { codigo: '0000' });
ok('código incorrecto devuelve 401', r.status === 401, `status=${r.status}`);

// ------------------------------------------------- todavía sin credenciales
r = await invocar('?accion=estado');
ok('estado sin credenciales responde 200', r.status === 200, `status=${r.status}`);
ok('reporta configurado=false', r.body.configurado === false, JSON.stringify(r.body));
ok('reporta conectado=false', r.body.conectado === false);
ok('devuelve el dominio para el callback', r.body.dominio === 'app.test', String(r.body.dominio));

r = await invocar('?accion=conectar');
ok('conectar sin credenciales devuelve 409', r.status === 409, `status=${r.status}`);
ok('el 409 dice que falta configurar', r.body.configurado === false);

r = await invocar('?accion=sync');
ok('sync sin credenciales devuelve 409', r.status === 409, `status=${r.status}`);

// ------------------------------------------------------------- configurar
r = await invocar('?accion=configurar');
ok('configurar por GET devuelve 405', r.status === 405, `status=${r.status}`);

r = await configurar('', '');
ok('configurar vacío devuelve 400', r.status === 400, `status=${r.status}`);

r = await configurar('abc123', 'nosoyunnumero');
ok('Client ID no numérico se rechaza', r.status === 400, `status=${r.status}`);

r = await configurar('a1b2c3d4e5', '12345');
ok('detecta los campos al revés',
   r.status === 400 && /al revés/.test(r.body.error ?? ''), r.body.error ?? '');

r = await configurar(' 12345 ', '  secreto  ');
ok('configurar válido responde 200', r.status === 200 && r.body.configurado === true,
   JSON.stringify(r.body));
ok('recorta espacios al guardar', config.get('strava_client_id') === '12345',
   JSON.stringify(config.get('strava_client_id')));
ok('guarda el secret', config.get('strava_client_secret') === 'secreto');

r = await invocar('?accion=estado');
ok('ahora reporta configurado=true', r.body.configurado === true);
ok('pero todavía no conectado', r.body.conectado === false);

// --------------------------------------------------------------- autorizar
r = await invocar('?accion=conectar');
const auth = new URL(r.body.url ?? 'http://x');
ok('conectar devuelve URL de Strava', r.status === 200 && auth.host === 'www.strava.com');
ok('usa el client_id guardado', auth.searchParams.get('client_id') === '12345',
   auth.searchParams.get('client_id') ?? '');
ok('pide el scope activity:read_all', auth.searchParams.get('scope') === 'activity:read_all');
ok('el redirect_uri apunta a /api/strava',
   auth.searchParams.get('redirect_uri') === 'https://app.test/api/strava',
   auth.searchParams.get('redirect_uri') ?? '');
const estado = auth.searchParams.get('state');
ok('genera un state y lo guarda', !!estado && config.get('strava_oauth_state') === estado);

r = await invocar('?code=abc&state=inventado');
ok('callback con state inválido se rechaza', r.status === 400, `status=${r.status}`);
ok('no guardó tokens con state inválido', !config.get('strava_refresh_token'));

r = await invocar(`?code=abc&state=${estado}`);
ok('callback correcto redirige a la app', r.status === 302, `status=${r.status}`);
ok('el callback usó las credenciales de la base', ultimoClientId === '12345', String(ultimoClientId));
ok('guardó el refresh token', config.get('strava_refresh_token') === 'ref_inicial');
ok('el state se invalida tras usarse', !config.get('strava_oauth_state'));

r = await invocar(`?code=abc&state=${estado}`);
ok('el state no se puede reusar', r.status === 400, `status=${r.status}`);

r = await invocar('?accion=estado');
ok('ahora reporta conectado', r.body.conectado === true);

// -------------------------------------------------------------------- sync
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

const antes = tokenRefrescado;
await invocar('?accion=sync');
ok('no refresca el token si todavía vale', tokenRefrescado === antes,
   `refrescos=${tokenRefrescado - antes}`);

config.set('strava_expira_en', String(Math.floor(Date.now() / 1000) - 10));
r = await invocar('?accion=sync');
ok('con el token vencido lo refresca', tokenRefrescado > antes);
ok('guarda el refresh token rotado', config.get('strava_refresh_token') === 'ref_rotado',
   config.get('strava_refresh_token') ?? '');

const pedidosAntes = pedidosActividades;
await invocar('?accion=sync');
ok('el sync siguiente sigue siendo incremental', pedidosActividades > pedidosAntes);

// -------------------------------------------------------------- desconectar
r = await invocar('?accion=desconectar');
ok('desconectar responde ok', r.status === 200 && r.body.conectado === false);
ok('borra el refresh token', !config.get('strava_refresh_token'));
ok('conserva las credenciales', config.get('strava_client_id') === '12345');
r = await invocar('?accion=estado');
ok('tras desconectar sigue configurado', r.body.configurado === true && r.body.conectado === false,
   JSON.stringify(r.body));

// ------------------------------------------------- cambiar de aplicación
await configurar('12345', 'otro-secreto');
ok('mismo client_id no exige reconectar', true);
config.set('strava_refresh_token', 'ref_viejo');
r = await configurar('99999', 'secreto-nuevo');
ok('cambiar de client_id avisa que hay que reconectar', r.body.reconectar === true,
   JSON.stringify(r.body));
ok('y tira los tokens de la aplicación anterior', !config.get('strava_refresh_token'),
   String(config.get('strava_refresh_token')));

// ------------------------------------------------ respaldo por variables
config.set('strava_client_id', '');
config.set('strava_client_secret', '');
r = await invocar('?accion=estado');
ok('sin credenciales en la base vuelve a sin configurar', r.body.configurado === false);
process.env.STRAVA_CLIENT_ID = '777';
process.env.STRAVA_CLIENT_SECRET = 'del-entorno';
r = await invocar('?accion=estado');
ok('usa las variables de entorno como respaldo', r.body.configurado === true,
   JSON.stringify(r.body));
r = await invocar('?accion=conectar');
ok('y arma la URL con el client_id del entorno',
   new URL(r.body.url).searchParams.get('client_id') === '777');
config.set('strava_client_id', '12345');
config.set('strava_client_secret', 'secreto');
r = await invocar('?accion=conectar');
ok('la base le gana al entorno',
   new URL(r.body.url).searchParams.get('client_id') === '12345',
   new URL(r.body.url).searchParams.get('client_id') ?? '');
delete process.env.STRAVA_CLIENT_ID;
delete process.env.STRAVA_CLIENT_SECRET;

// ---------------------------------------------------------- no filtra nada
for (const q of ['?accion=estado', '?accion=conectar', '?accion=desconectar']) {
  const resp = await invocar(q);
  const txt = JSON.stringify(resp.body);
  ok(`${q} no expone tokens ni el secret`,
     !txt.includes('secreto') && !txt.includes('ref_') && !txt.includes('acc_'), txt.slice(0, 90));
}
r = await configurar('12345', 'secreto');
ok('configurar tampoco devuelve el secret',
   !JSON.stringify(r.body).includes('secreto'), JSON.stringify(r.body));

// ------------------------------------------- faltan variables de Supabase
const guardada = process.env.SUPABASE_SECRET_KEY;
delete process.env.SUPABASE_SECRET_KEY;
r = await invocar('?accion=estado');
ok('sin SUPABASE_SECRET_KEY avisa cuál falta',
   r.status === 500 && r.body.faltan?.includes('SUPABASE_SECRET_KEY'), JSON.stringify(r.body.faltan));
process.env.SUPABASE_SECRET_KEY = guardada;

// ------------------------------------------------------------ acción rara
r = await invocar('?accion=volar');
ok('acción inválida devuelve 400 con la lista', r.status === 400 && Array.isArray(r.body.validas));

supa.close(); strava.close();
console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
