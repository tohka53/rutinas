// Prueba api/datos.mjs de punta a punta contra un PostgREST simulado.
// Verifica: código correcto/incorrecto, GET, upsert, borrado y validaciones.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const { default: handler } = await import(join(RAIZ, 'api', 'datos.mjs'));

// ------------------------------------------------- Supabase simulado (PostgREST)
const tablas = { rutina_peso: [], rutina_sesion: [], rutina_wod: [], rutina_nota_semana: [] };
const PK = {
  rutina_peso: ['fecha'], rutina_sesion: ['fecha', 'indice'],
  rutina_wod: ['fecha'], rutina_nota_semana: ['semana'],
};
let llamadasSinAuth = 0;

const fake = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const tabla = u.pathname.replace('/rest/v1/', '');
  // PostgREST exige la llave; si no llega, es un bug nuestro.
  if (req.headers.apikey !== 'sb_secret_PRUEBA') { llamadasSinAuth++; res.writeHead(401); return res.end('{}'); }
  if (!tablas[tabla]) { res.writeHead(404); return res.end('{}'); }

  let cuerpo = '';
  req.on('data', c => (cuerpo += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') { res.writeHead(200); return res.end(JSON.stringify(tablas[tabla])); }
    if (req.method === 'POST') {
      const fila = JSON.parse(cuerpo);
      const clave = PK[tabla].map(k => fila[k]).join('|');
      const i = tablas[tabla].findIndex(f => PK[tabla].map(k => f[k]).join('|') === clave);
      if (i >= 0) tablas[tabla][i] = { ...tablas[tabla][i], ...fila }; else tablas[tabla].push(fila);
      res.writeHead(201); return res.end(JSON.stringify([fila]));
    }
    if (req.method === 'DELETE') {
      const filtros = [...u.searchParams].map(([k, v]) => [k, v.replace('eq.', '')]);
      tablas[tabla] = tablas[tabla].filter(f => !filtros.every(([k, v]) => String(f[k]) === v));
      res.writeHead(204); return res.end();
    }
    res.writeHead(405); res.end('{}');
  });
});
await new Promise(r => fake.listen(5599, r));

process.env.SUPABASE_URL = 'http://localhost:5599';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_PRUEBA';
process.env.CODIGO_ACCESO = '1099513';

// ------------------------------------------------------- invocar el handler
function invocar(metodo, cuerpo, codigo = '1099513') {
  return new Promise(resolve => {
    const req = { method: metodo, headers: { 'x-codigo': codigo }, body: cuerpo };
    const res = {
      _s: 200, _h: {},
      status(c) { this._s = c; return this; },
      setHeader(k, v) { this._h[k] = v; return this; },
      json(o) { resolve({ status: this._s, body: o }); return this; },
    };
    handler(req, res);
  });
}

let fallos = 0;
function check(nombre, cond, extra = '') {
  if (!cond) fallos++;
  console.log(`${cond ? 'OK ' : 'X  '} ${nombre}${extra ? ' — ' + extra : ''}`);
}

// 1. código incorrecto
let r = await invocar('GET', null, '0000000');
check('código incorrecto devuelve 401', r.status === 401, `status=${r.status}`);

// 2. código vacío
r = await invocar('GET', null, '');
check('código vacío devuelve 401', r.status === 401, `status=${r.status}`);

// 3. código de largo distinto (la comparación en tiempo constante no debe romper)
r = await invocar('GET', null, '1099513XXXX');
check('código más largo devuelve 401', r.status === 401, `status=${r.status}`);

// 4. GET con código bueno
r = await invocar('GET', null);
check('GET con código correcto devuelve 200', r.status === 200, `status=${r.status}`);
check('GET trae las 4 colecciones',
  ['pesos', 'sesiones', 'wods', 'notas'].every(k => Array.isArray(r.body[k])));

// 5. guardar cada tipo
r = await invocar('POST', { tipo: 'peso', datos: { fecha: '2026-09-07', kg: 126.4, nota: 'en ayunas' } });
check('guardar peso', r.status === 200 && r.body.ok, `status=${r.status}`);

r = await invocar('POST', { tipo: 'sesion', datos: { fecha: '2026-09-07', indice: 0, hecha: true, disciplina: 'nado', titulo: 'Umbral corto' } });
check('guardar sesión', r.status === 200 && r.body.ok);

r = await invocar('POST', { tipo: 'wod', datos: { fecha: '2026-09-07', texto: '5 rondas: 400m, 15 thrusters' } });
check('guardar WOD', r.status === 200 && r.body.ok);

r = await invocar('POST', { tipo: 'nota', datos: { semana: 1, sueno: 4, energia: 3, molestias: 'ninguna' } });
check('guardar nota semanal', r.status === 200 && r.body.ok);

// 6. releer y confirmar que está todo
r = await invocar('GET', null);
check('los 4 registros vuelven en el GET',
  r.body.pesos.length === 1 && r.body.sesiones.length === 1 &&
  r.body.wods.length === 1 && r.body.notas.length === 1,
  JSON.stringify({ p: r.body.pesos.length, s: r.body.sesiones.length, w: r.body.wods.length, n: r.body.notas.length }));
check('el peso guardado es el correcto', r.body.pesos[0]?.kg === 126.4);

// 7. upsert: mismo día, peso distinto -> no duplica
await invocar('POST', { tipo: 'peso', datos: { fecha: '2026-09-07', kg: 125.9 } });
r = await invocar('GET', null);
check('upsert no duplica la fila', r.body.pesos.length === 1, `filas=${r.body.pesos.length}`);
check('upsert actualiza el valor', r.body.pesos[0]?.kg === 125.9, `kg=${r.body.pesos[0]?.kg}`);

// 8. borrar
r = await invocar('POST', { tipo: 'peso', accion: 'borrar', datos: { fecha: '2026-09-07' } });
check('borrar peso responde ok', r.status === 200 && r.body.ok);
r = await invocar('GET', null);
check('el peso ya no está', r.body.pesos.length === 0, `filas=${r.body.pesos.length}`);

// 9. validaciones
r = await invocar('POST', { tipo: 'inventado', datos: { fecha: 'x' } });
check('tipo inválido devuelve 400', r.status === 400, `status=${r.status}`);

r = await invocar('POST', { tipo: 'peso', datos: { kg: 100 } });
check('falta la clave primaria -> 400', r.status === 400, `status=${r.status}`);

r = await invocar('POST', { tipo: 'peso' });
check('falta datos -> 400', r.status === 400, `status=${r.status}`);

r = await invocar('PUT', {});
check('método no permitido -> 405', r.status === 405, `status=${r.status}`);

// 10. faltan variables de entorno
delete process.env.SUPABASE_SECRET_KEY;
r = await invocar('GET', null);
check('sin env vars devuelve 500 y dice cuál falta',
  r.status === 500 && r.body.faltan?.includes('SUPABASE_SECRET_KEY'));
process.env.SUPABASE_SECRET_KEY = 'sb_secret_PRUEBA';

check('nunca se llamó a Supabase sin la llave', llamadasSinAuth === 0, `llamadas=${llamadasSinAuth}`);

fake.close();
console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
