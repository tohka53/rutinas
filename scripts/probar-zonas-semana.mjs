// Verifica el reparto de intensidad semana a semana.
//
// Lo que se prueba, en orden de importancia:
//   1. que las horas se repartan en la zona correcta y no se pierda ninguna
//   2. que una sesión sin pulsómetro se cuente aparte y no como "fácil"
//   3. que el resumen pondere por horas, no promediando porcentajes
//   4. que detecte el patrón que la pantalla existe para detectar: todo el
//      entrenamiento aplastado en la zona gris
//   5. que la rampa de color sea ordinal de verdad (claridad monótona)
//
//   node scripts/probar-zonas-semana.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-zs-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-zs.mjs');

await writeFile(ENTRADA, `
export * from './src/app/data/zonas-semana';
`);
await build({
  entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
  format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const {
  distribucionPorSemana, resumenIntensidad, OBJETIVO_REPARTO, TOLERANCIA_REPARTO,
  BANDA_DE_ZONA, BANDAS, COLOR_BANDA, ETIQUETA_BANDA, DESCRIPCION_BANDA,
} = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

// Las zonas que Miguel puso a mano el 7 sep.
const ZONAS = [
  { min: 0, max: 139 }, { min: 140, max: 151 }, { min: 152, max: 159 },
  { min: 160, max: 169 }, { min: 170, max: null },
];

const act = (o) => ({
  strava_id: o.id ?? Math.floor(Math.random() * 1e9),
  fecha: o.f, disciplina: o.d ?? 'corre', sport_type: null, nombre: null,
  metros: o.m ?? 0, segundos: (o.h ?? 1) * 3600, desnivel: 0,
  calorias: null, esfuerzo: null,
  fc_media: o.fc ?? null, fc_max: null,
});

// ============================== 1. cada hora cae en la zona que le toca
{
  const r = distribucionPorSemana([
    act({ f: '2026-09-07', fc: 120, h: 2 }),   // Z1
    act({ f: '2026-09-08', fc: 145, h: 3 }),   // Z2
    act({ f: '2026-09-09', fc: 155, h: 1 }),   // Z3
    act({ f: '2026-09-10', fc: 165, h: 1 }),   // Z4
    act({ f: '2026-09-11', fc: 175, h: 1 }),   // Z5
  ], ZONAS, '2026-01-01', '2026-09-13');

  ok('una sola semana', r.length === 1, String(r.length));
  const s = r[0];
  ok('el reparto por zona es exacto',
     JSON.stringify(s.porZona) === JSON.stringify([2, 3, 1, 1, 1]),
     JSON.stringify(s.porZona));
  ok('Z1+Z2 se agrupan en fácil', cerca(s.facil, 5), String(s.facil));
  ok('Z3 es la zona gris, sola', cerca(s.medio, 1), String(s.medio));
  ok('Z4+Z5 se agrupan en duro', cerca(s.duro, 2), String(s.duro));
  ok('el total cuadra', cerca(s.total, 8), String(s.total));
  ok('no se pierde ni una hora',
     cerca(s.porZona.reduce((a, b) => a + b, 0), s.total), `${s.porZona.reduce((a, b) => a + b, 0)} vs ${s.total}`);
  ok('los porcentajes suman 1',
     cerca(s.pctFacil + s.pctMedio + s.pctDuro, 1),
     String(s.pctFacil + s.pctMedio + s.pctDuro));
  ok('cuenta las sesiones', s.sesiones === 5, String(s.sesiones));
  ok('las bandas cubren las cinco zonas', BANDA_DE_ZONA.length === 5, String(BANDA_DE_ZONA.length));
}

// ===================== 2. sin pulsómetro no es "fácil": es "no se sabe"
{
  const r = distribucionPorSemana([
    act({ f: '2026-09-07', fc: 145, h: 2 }),
    act({ f: '2026-09-08', h: 3 }),            // sin FC
    act({ f: '2026-09-09', fc: 0, h: 1 }),     // cero de Strava
  ], ZONAS, '2026-01-01', '2026-09-13');
  const s = r[0];

  ok('las sesiones sin FC no entran al reparto', cerca(s.total, 2), `${s.total} h`);
  ok('pero se cuentan aparte', s.sinFC === 2, String(s.sinFC));
  ok('y no se cuelan como fácil', cerca(s.facil, 2), String(s.facil));
  ok('la semana no queda marcada como vacía', s.vacia === false);

  const todasSinFC = distribucionPorSemana(
    [act({ f: '2026-09-07', h: 5 })], ZONAS, '2026-01-01', '2026-09-13');
  ok('una semana entera sin FC sí queda vacía', todasSinFC[0].vacia === true);
  ok('y sus porcentajes son cero, no NaN',
     todasSinFC[0].pctFacil === 0 && Number.isFinite(todasSinFC[0].pctFacil));
}

// ============================== 3. las caminatas no cuentan como entrenamiento
{
  const r = distribucionPorSemana([
    act({ f: '2026-09-07', fc: 145, h: 1 }),
    act({ f: '2026-09-08', d: 'caminata', fc: 110, h: 4 }),
  ], ZONAS, '2026-01-01', '2026-09-13');
  ok('caminar no infla la banda fácil', cerca(r[0].total, 1), `${r[0].total} h`);
  ok('ni se cuenta como sesión sin FC', r[0].sinFC === 0, String(r[0].sinFC));
}

// ================================ 4. cada semana va en su propia fila
{
  const r = distribucionPorSemana([
    act({ f: '2026-08-24', fc: 145, h: 2 }),
    act({ f: '2026-08-30', fc: 145, h: 1 }),   // domingo: misma semana
    act({ f: '2026-08-31', fc: 165, h: 3 }),   // lunes: la siguiente
  ], ZONAS, '2026-01-01', '2026-09-13');

  ok('dos semanas', r.length === 2, String(r.length));
  ok('el domingo cae en la semana que arrancó el lunes', cerca(r[0].total, 3), String(r[0].total));
  ok('salen ordenadas de más vieja a más nueva',
     r[0].lunes === '2026-08-24' && r[1].lunes === '2026-08-31',
     `${r[0].lunes} · ${r[1].lunes}`);
  ok('la segunda semana es toda dura', cerca(r[1].pctDuro, 1), String(r[1].pctDuro));
}

// ===================== 5. el resumen pondera por horas, no por semanas
{
  // Una semana de 10 h toda fácil y una de 1 h toda dura.
  //   promedio simple de porcentajes = 50 % fácil (falso)
  //   ponderado por horas            = 91 % fácil (correcto)
  const r = distribucionPorSemana([
    act({ f: '2026-08-31', fc: 120, h: 10 }),
    act({ f: '2026-09-07', fc: 175, h: 1 }),
  ], ZONAS, '2026-01-01', '2026-09-13');
  const res = resumenIntensidad(r);

  ok('el resumen pondera por horas', cerca(res.pctFacil, 10 / 11, 0.01),
     `${(res.pctFacil * 100).toFixed(0)} % (promedio simple daría 50 %)`);
  ok('cuenta las horas totales', cerca(res.horas, 11, 0.05), String(res.horas));
  ok('y las semanas que entraron', res.semanas === 2, String(res.semanas));
  ok('los tres porcentajes suman 1',
     cerca(res.pctFacil + res.pctMedio + res.pctDuro, 1));
}

// ============ 6. el hallazgo que la pantalla existe para ver: la zona gris
{
  // Todo a FC media 155: cae en Z3. Es exactamente el patrón que arruina un
  // plan de resistencia y que no se ve en kilómetros ni en ritmo medio.
  const grises = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(2026, 7, 17));
    d.setUTCDate(d.getUTCDate() + i * 7);
    grises.push(act({ f: d.toISOString().slice(0, 10), fc: 155, h: 6 }));
  }
  const res = resumenIntensidad(
    distribucionPorSemana(grises, ZONAS, '2026-01-01', '2026-09-13'));

  ok('detecta que todo cae en la zona gris', cerca(res.pctMedio, 1),
     `${(res.pctMedio * 100).toFixed(0)} %`);
  ok('y avisa', res.avisos.some(a => /zona gris/i.test(a)), res.avisos.join(' | '));
  ok('avisa también de que falta trabajo fácil',
     res.avisos.some(a => /claramente fácil/i.test(a)), res.avisos.join(' | '));

  // Un reparto sano no debe generar ruido.
  const sanas = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(2026, 7, 17));
    d.setUTCDate(d.getUTCDate() + i * 7);
    const dia = d.toISOString().slice(0, 10);
    sanas.push(act({ f: dia, fc: 130, h: 7.5 }));    // fácil
    sanas.push(act({ f: dia, fc: 155, h: 1 }));      // medio
    sanas.push(act({ f: dia, fc: 165, h: 1.5 }));    // duro
  }
  const bien = resumenIntensidad(
    distribucionPorSemana(sanas, ZONAS, '2026-01-01', '2026-09-13'));
  ok('un reparto sano no genera avisos', bien.avisos.length === 0, bien.avisos.join(' | '));
  ok('y queda cerca del objetivo',
     Math.abs(bien.pctFacil - OBJETIVO_REPARTO.facil) < TOLERANCIA_REPARTO,
     `${(bien.pctFacil * 100).toFixed(0)} % vs objetivo ${OBJETIVO_REPARTO.facil * 100} %`);

  // Demasiada intensidad tampoco es sano y tiene su propio aviso.
  const duras = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(2026, 7, 17));
    d.setUTCDate(d.getUTCDate() + i * 7);
    const dia = d.toISOString().slice(0, 10);
    duras.push(act({ f: dia, fc: 130, h: 4 }));
    duras.push(act({ f: dia, fc: 175, h: 4 }));
  }
  const exceso = resumenIntensidad(
    distribucionPorSemana(duras, ZONAS, '2026-01-01', '2026-09-13'));
  ok('demasiado duro también se señala',
     exceso.avisos.some(a => /en duro es mucho/i.test(a)), exceso.avisos.join(' | '));
}

// ================================= 7. la ventana y los casos degenerados
{
  const muchas = [];
  for (let i = 0; i < 10; i++) {
    const d = new Date(Date.UTC(2026, 6, 6));
    d.setUTCDate(d.getUTCDate() + i * 7);
    muchas.push(act({ f: d.toISOString().slice(0, 10), fc: 145, h: i + 1 }));
  }
  const r = distribucionPorSemana(muchas, ZONAS, '2026-01-01', '2026-09-13');
  const res = resumenIntensidad(r, 4);
  ok('el resumen mira solo las últimas semanas de la ventana', res.semanas === 4,
     String(res.semanas));
  ok('y toma las más recientes', cerca(res.horas, 7 + 8 + 9 + 10, 0.05), String(res.horas));

  ok('sin zonas configuradas no se inventa nada',
     distribucionPorSemana(muchas, null, '2026-01-01', '2026-09-13').length === 0);
  ok('sin actividades tampoco',
     distribucionPorSemana([], ZONAS, '2026-01-01', '2026-09-13').length === 0);
  ok('un resumen sin datos lo dice en vez de romper',
     resumenIntensidad([]).avisos.length === 1 && resumenIntensidad([]).horas === 0);

  const fuera = distribucionPorSemana(
    [act({ f: '2025-01-01', fc: 145, h: 3 })], ZONAS, '2026-01-01', '2026-09-13');
  ok('lo anterior a la ventana queda fuera', fuera.length === 0, String(fuera.length));
}

// ========================= 8. la rampa de color es ordinal, no categórica
{
  // Las bandas tienen orden, así que el color tiene que dejarlo ver: un solo
  // tono con claridad creciente. Tres colores distintos dirían "tres cosas
  // sueltas" en vez de "tres puntos de la misma escala".
  const srgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const okLab = h => {
    const [r, g, b] = srgb(h).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.7936177850 * mm - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s,
    ];
  };
  const dE = (a, b) => {
    const x = okLab(a), y = okLab(b);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * 100;
  };

  const cols = BANDAS.map(b => COLOR_BANDA[b]);
  ok('hay un color por banda', cols.length === 3 && cols.every(Boolean), cols.join(', '));

  const Ls = cols.map(c => okLab(c)[0]);
  ok('la claridad es monótona: la escala se ve en el color',
     Ls[0] < Ls[1] && Ls[1] < Ls[2], Ls.map(x => x.toFixed(3)).join(' · '));

  ok('las bandas contiguas se distinguen (ΔE ≥ 15)',
     dE(cols[0], cols[1]) >= 15 && dE(cols[1], cols[2]) >= 15,
     `${dE(cols[0], cols[1]).toFixed(1)} · ${dE(cols[1], cols[2]).toFixed(1)}`);

  // Contraste contra el fondo de la tarjeta: la banda más apagada tiene que
  // seguir viéndose, o el tramo "fácil" desaparece sobre el card.
  const relLum = h => { const [r, g, b] = srgb(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contraste = (a, b) => {
    const x = relLum(a), y = relLum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const FONDO = '#131a22';
  ok('las tres se ven sobre el fondo de la tarjeta (≥ 3:1)',
     cols.every(c => contraste(c, FONDO) >= 3),
     cols.map(c => `${c} ${contraste(c, FONDO).toFixed(2)}:1`).join(' · '));

  ok('cada banda tiene etiqueta y descripción',
     BANDAS.every(b => ETIQUETA_BANDA[b] && DESCRIPCION_BANDA[b]));
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
