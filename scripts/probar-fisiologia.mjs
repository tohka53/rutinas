// Verifica el VO2max y el análisis de zonas cardíacas.
//
// Lo que se prueba, en orden de importancia:
//   1. que el VDOT reproduzca la tabla de Daniels contra marcas conocidas
//   2. que "sin dato" nunca se confunda con "cero" — un null que entra como 0
//      hunde el promedio y arruina el máximo observado, que es lo que calibra
//      las zonas
//   3. que detecte el hallazgo del estudio: tabla que asume 192, máximo real 171
//   4. que el umbral estimado quede encerrado entre lo sostenido y el máximo
//
//   node scripts/probar-fisiologia.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-fisio-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-fisio.mjs');

await writeFile(ENTRADA, `
export * from './src/app/data/fisiologia';
export { HISTORIAL_SEMILLA } from './src/app/data/historial.seed';
`);
await build({
  entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
  format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const {
  vdotDe, estimarVO2max, analizarZonas, estimarLTHR, zonasRecomendadas,
  zonasDesde, maxImplicito, nivelVO2max, CORTES_MAX, CORTES_ZONAS,
  BRECHA_TOLERADA, HISTORIAL_SEMILLA,
} = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;

const act = (o) => ({
  strava_id: o.id ?? Math.floor(Math.random() * 1e9),
  fecha: o.f, disciplina: o.d ?? 'corre', sport_type: null, nombre: o.n ?? null,
  metros: o.m ?? 0, segundos: o.s ?? 0, desnivel: 0, calorias: null, esfuerzo: null,
  fc_media: o.fcm ?? null, fc_max: o.fcx ?? null,
});

// ================================== 1. el VDOT reproduce la tabla de Daniels
{
  // Marcas de las tablas publicadas de Daniels, en tres duraciones muy
  // distintas para que el término temporal de la fórmula también quede
  // cubierto: VDOT 50 corre 5K en 19:57, VDOT 40 corre 10K en 50:03 y VDOT 45
  // corre la media en 1:40:20. Si estas tres caen, la fórmula está bien y no
  // hay que confiar en mi aritmética.
  ok('5 km en 20:00 da VDOT ~50', cerca(vdotDe(5000, 1200), 50, 1),
     String(vdotDe(5000, 1200)?.toFixed(1)));
  ok('10 km en 50:00 da VDOT ~40', cerca(vdotDe(10000, 3000), 40, 1),
     String(vdotDe(10000, 3000)?.toFixed(1)));
  ok('media maratón en 1:40 da VDOT ~45', cerca(vdotDe(21097, 6000), 45, 1),
     String(vdotDe(21097, 6000)?.toFixed(1)));

  // Y el caso que importa: la media maratón real de Miguel.
  const suyo = vdotDe(21538, 10645);
  ok('la media maratón del 23 ago da VDOT ~23', cerca(suyo, 23.3, 0.5), suyo?.toFixed(2));

  ok('más rápido siempre da más VDOT', vdotDe(10000, 2400) > vdotDe(10000, 3000));
  ok('a igual ritmo, más distancia da más VDOT',
     vdotDe(10000, 3000) > vdotDe(5000, 1500),
     `${vdotDe(10000, 3000)?.toFixed(1)} vs ${vdotDe(5000, 1500)?.toFixed(1)}`);
}

// ================================================= 2. entradas que no sirven
{
  ok('sin distancia no hay VDOT', vdotDe(0, 1800) === null);
  ok('sin tiempo tampoco', vdotDe(5000, 0) === null);
  ok('negativos tampoco', vdotDe(-100, 600) === null);
  ok('una velocidad imposible se descarta', vdotDe(100000, 600) === null,
     String(vdotDe(100000, 600)));
  ok('caminar despacio también se descarta', vdotDe(1000, 3600) === null,
     String(vdotDe(1000, 3600)));
}

// ==================================== 3. VO2max: se toma el mejor, no el medio
{
  const acts = [
    act({ f: '2026-08-09', m: 6063, s: 2691 }),   // el mejor
    act({ f: '2026-08-23', m: 21538, s: 10645 }),
    act({ f: '2026-07-05', m: 6400, s: 3466 }),   // trote suave
  ];
  const e = estimarVO2max(acts, '2026-09-07', 127, 108.9);

  ok('el VO2max es el mejor VDOT, no el promedio', cerca(e.vo2max, 24.2, 0.4),
     e.vo2max?.toFixed(2));
  ok('el rango deja ver la dispersión', e.min < e.vo2max - 3,
     `${e.min?.toFixed(1)} a ${e.vo2max?.toFixed(1)}`);
  ok('las carreras salen ordenadas de mejor a peor',
     e.carreras[0].vdot >= e.carreras[1].vdot && e.carreras[1].vdot >= e.carreras[2].vdot);

  ok('el consumo absoluto sale en L/min', cerca(e.litrosMin, 3.07, 0.06),
     `${e.litrosMin?.toFixed(2)} L/min`);
  ok('proyecta el mismo motor al peso meta', cerca(e.vo2maxEnMeta, 28.2, 0.4),
     e.vo2maxEnMeta?.toFixed(1));
  ok('y calcula cuánto sube solo por bajar de peso', cerca(e.gananciaPorPeso, 16.6, 0.6),
     `${e.gananciaPorPeso?.toFixed(1)} %`);
  ok('avisa que subestima a un corredor pesado',
     e.advertencias.some(a => /subestima/i.test(a)), e.advertencias.join(' | '));
}

// ====================================== 4. VO2max: qué se ignora y qué se avisa
{
  const soloCortas = estimarVO2max([act({ f: '2026-09-01', m: 2000, s: 900 })], '2026-09-07', 127, 108.9);
  ok('las carreras cortas no cuentan', soloCortas.vo2max === null, String(soloCortas.vo2max));
  ok('y lo explica', /km o más/.test(soloCortas.advertencias[0]), soloCortas.advertencias[0]);

  const vieja = estimarVO2max([act({ f: '2026-01-01', m: 10000, s: 3000 })], '2026-09-07', 127, 108.9);
  ok('una carrera de hace un año no describe el estado de hoy', vieja.vo2max === null);

  const otroDeporte = estimarVO2max(
    [act({ f: '2026-09-01', d: 'nado', m: 4000, s: 5400 })], '2026-09-07', 127, 108.9);
  ok('el VDOT solo se calcula sobre carrera', otroDeporte.vo2max === null);

  const una = estimarVO2max([act({ f: '2026-09-01', m: 10000, s: 3000 })], '2026-09-07', 70, 65);
  ok('con una sola carrera avisa que es poco',
     una.advertencias.some(a => /una sola/i.test(a)), una.advertencias.join(' | '));
  ok('a peso normal no avisa de subestimación',
     !una.advertencias.some(a => /subestima/i.test(a)), una.advertencias.join(' | '));

  const sinPeso = estimarVO2max([act({ f: '2026-09-01', m: 10000, s: 3000 })], '2026-09-07', null, null);
  ok('sin peso el VO2max sigue saliendo', sinPeso.vo2max > 0);
  ok('pero no se inventa el absoluto', sinPeso.litrosMin === null && sinPeso.vo2maxEnMeta === null);

  ok('las etiquetas de nivel son coherentes',
     nivelVO2max(24) === 'bajo' && nivelVO2max(45) === 'muy bueno' && nivelVO2max(55) === 'excelente',
     `${nivelVO2max(24)} / ${nivelVO2max(45)} / ${nivelVO2max(55)}`);
}

// ============================= 5. de qué máximo salió una tabla de zonas
{
  // Las zonas reales de Miguel en Strava.
  const suyas = [
    { min: 0, max: 123 }, { min: 124, max: 153 }, { min: 154, max: 168 },
    { min: 169, max: 183 }, { min: 184, max: null },
  ];
  ok('deduce que la tabla asume ~192', cerca(maxImplicito(suyas), 192, 1.5),
     String(maxImplicito(suyas)));

  // Ida y vuelta: construir desde un máximo y volver a deducirlo.
  for (const max of [170, 185, 200]) {
    const z = zonasDesde(max, CORTES_MAX).map(x => ({ min: x.min, max: x.max }));
    ok(`ida y vuelta con máximo ${max}`, cerca(maxImplicito(z), max, 1.5),
       String(maxImplicito(z)));
  }
  ok('una tabla incompleta no se inventa un máximo',
     maxImplicito([{ min: 0, max: 120 }]) === null);
}

// ================== 6. el hallazgo: tabla que asume 192, máximo observado 171
{
  const zonas = [
    { min: 0, max: 123 }, { min: 124, max: 153 }, { min: 154, max: 168 },
    { min: 169, max: 183 }, { min: 184, max: null },
  ];
  const acts = [
    act({ f: '2026-08-23', m: 21538, s: 10645, fcm: 159.5, fcx: 171, n: 'Media maraton' }),
    act({ f: '2026-08-12', d: 'fuerza', s: 3684, fcm: 155.5, fcx: 171 }),
    act({ f: '2026-09-02', d: 'fuerza', s: 2239, fcm: 156.6, fcx: 171 }),
    act({ f: '2026-08-09', m: 6063, s: 2691, fcm: 157.9, fcx: 167 }),
    act({ f: '2026-08-09', d: 'nado', m: 3500, s: 4609, fcm: 136.5, fcx: 156 }),
  ];
  const a = analizarZonas(acts, zonas);

  ok('encuentra el máximo real observado', a.maxObservado === 171, String(a.maxObservado));
  ok('y el que asume la tabla', cerca(a.maxAsumido, 192, 1.5), String(a.maxAsumido));
  ok('mide la brecha', a.brecha > 15, `${a.brecha} lpm`);
  ok('dictamina que está mal calibrada', a.veredicto === 'desalineada', a.veredicto);
  ok('detecta que la Z5 nunca se tocó', a.zonasVacias.includes(5),
     `vacías: ${a.zonasVacias.join(', ')}`);
  ok('la Z1 tampoco (nunca entrena tan suave)', a.zonasVacias.includes(1),
     `vacías: ${a.zonasVacias.join(', ')}`);
  ok('explica que no reescribe las zonas solo',
     a.advertencias.some(x => /no se reescriben/i.test(x)), a.advertencias.join(' | '));
  ok('remite al test de umbral',
     a.advertencias.some(x => /umbral/i.test(x)), a.advertencias.join(' | '));
  ok('lista las sesiones más duras para poder auditarlo', a.masDuras.length >= 3,
     a.masDuras.map(s => `${s.fecha} ${s.fcMax}`).join(' · '));
  ok('la más dura es la de FC más alta', a.masDuras[0].fcMax === 171, String(a.masDuras[0].fcMax));

  // Las horas por zona reparten con la FC media.
  const total = a.horasPorZona.reduce((x, y) => x + y, 0);
  const esperado = acts.reduce((x, y) => x + y.segundos / 3600, 0);
  ok('las horas por zona suman el total con FC', cerca(total, esperado, 0.02),
     `${total.toFixed(2)} vs ${esperado.toFixed(2)}`);
}

// ================================== 7. una tabla coherente no se marca como mala
{
  const zonas = zonasDesde(175, CORTES_MAX).map(x => ({ min: x.min, max: x.max }));
  const a = analizarZonas([
    act({ f: '2026-09-01', m: 10000, s: 3000, fcm: 150, fcx: 174 }),
    act({ f: '2026-09-02', m: 8000, s: 2600, fcm: 120, fcx: 140 }),
    act({ f: '2026-09-03', m: 5000, s: 1500, fcm: 160, fcx: 172 }),
    act({ f: '2026-09-04', m: 5000, s: 1500, fcm: 170, fcx: 175 }),
    act({ f: '2026-09-05', m: 5000, s: 2000, fcm: 105, fcx: 120 }),
  ], zonas);
  ok('con máximo alcanzado la tabla se declara coherente', a.veredicto === 'coherente',
     `${a.veredicto} (brecha ${a.brecha})`);
  ok('una brecha chica se tolera', Math.abs(a.brecha) <= BRECHA_TOLERADA, String(a.brecha));
}

// ============================ 8. "sin dato" nunca se confunde con cero
{
  const a = analizarZonas([
    act({ f: '2026-09-01', m: 10000, s: 3000, fcm: 150, fcx: 165 }),
    act({ f: '2026-09-02', m: 8000, s: 2600 }),                    // sin reloj
    act({ f: '2026-09-03', m: 5000, s: 1500, fcm: 0, fcx: 0 }),    // ceros de Strava
  ], null);
  ok('solo cuenta las que sí tienen FC', a.conFC === 1, `${a.conFC} de ${a.total}`);
  ok('el máximo no lo arrastra un cero', a.maxObservado === 165, String(a.maxObservado));
  ok('sin zonas configuradas lo dice', a.veredicto === 'sin-zonas', a.veredicto);
  ok('y no inventa un máximo asumido', a.maxAsumido === null);

  const nada = analizarZonas([act({ f: '2026-09-01', m: 10000, s: 3000 })], null);
  ok('sin ninguna FC pide resincronizar', nada.sinDatos && /esincroniz/.test(nada.advertencias[0]),
     nada.advertencias[0]);
  ok('y no rompe', nada.maxObservado === null && nada.masDuras.length === 0);

  ok('sin actividades tampoco rompe', analizarZonas([], null).sinDatos === true);
}

// ================ 9. la última zona de Strava viene con max = -1, no con null
{
  // Normalizar eso es responsabilidad de quien llama, pero si llega un -1 sin
  // limpiar, el análisis no debe reportar la Z5 como usada por accidente.
  const zonas = [
    { min: 0, max: 123 }, { min: 124, max: 153 }, { min: 154, max: 168 },
    { min: 169, max: 183 }, { min: 184, max: null },
  ];
  const a = analizarZonas([act({ f: '2026-09-01', m: 10000, s: 3000, fcm: 150, fcx: 160 })], zonas);
  ok('una FC de 150 cae en la Z2, no en la Z5',
     a.horasPorZona[1] > 0 && a.horasPorZona[4] === 0,
     a.horasPorZona.map(h => h.toFixed(2)).join(' · '));
}

// ============================ 10. el umbral queda entre lo sostenido y el máximo
{
  const acts = [
    act({ f: '2026-08-23', m: 21538, s: 10645, fcm: 159.5, fcx: 171 }),
    act({ f: '2026-08-12', d: 'fuerza', s: 3684, fcm: 155.5, fcx: 171 }),
    act({ f: '2026-09-02', d: 'fuerza', s: 1200, fcm: 165, fcx: 170 }),  // corta: no cuenta
  ];
  const l = estimarLTHR(acts);

  ok('el piso es lo que sostuvo en el esfuerzo largo', l.piso === 160,
     `${l.piso} (media 159.5 redondeada)`);
  ok('el techo es el máximo observado', l.techo === 171, String(l.techo));
  ok('el umbral queda entre los dos', l.lthr > l.piso - 1 && l.lthr <= l.techo,
     `${l.piso} <= ${l.lthr} <= ${l.techo}`);
  ok('el umbral estimado ronda 162', cerca(l.lthr, 162, 1), String(l.lthr));
  ok('una sesión corta no puede ser el origen', l.origen.segundos >= 3600,
     `${l.origen.fecha}, ${Math.round(l.origen.segundos / 60)} min`);
  ok('dice de dónde salió', l.advertencias.some(a => /puente/.test(a)), l.advertencias.join(' | '));

  // Sin esfuerzos largos no se puede acotar por abajo.
  const corto = estimarLTHR([act({ f: '2026-09-01', s: 1200, fcm: 160, fcx: 170 })]);
  ok('sin esfuerzos largos no estima umbral', corto.lthr === null, String(corto.lthr));
  ok('pero sí reporta el techo', corto.techo === 170, String(corto.techo));

  ok('sin FC no estima nada', estimarLTHR([act({ f: '2026-09-01', s: 5000 })]).lthr === null);
  ok('sin actividades tampoco', estimarLTHR([]).lthr === null);

  // El techo acota: si lo sostenido ya está pegado al máximo, no se pasa.
  const pegado = estimarLTHR([act({ f: '2026-09-01', s: 5000, fcm: 170, fcx: 171 })]);
  ok('el umbral nunca supera el máximo observado', pegado.lthr <= pegado.techo,
     `${pegado.lthr} <= ${pegado.techo}`);
  ok('y avisa cuando toca el techo',
     pegado.advertencias.some(a => /quedando corto/.test(a)), pegado.advertencias.join(' | '));
}

// ================================= 11. las zonas propuestas describen su entreno
{
  const z = zonasRecomendadas(162);
  ok('propone cinco zonas', z.length === 5, String(z.length));
  ok('la primera arranca en cero', z[0].min === 0);
  ok('la última no tiene techo', z[4].max === null);

  // Sin huecos ni solapes: el límite de una es el anterior de la siguiente.
  let continuas = true;
  for (let i = 1; i < z.length; i++) if (z[i].min !== z[i - 1].max + 1) continuas = false;
  ok('no quedan huecos entre zonas', continuas, z.map(x => `${x.min}-${x.max}`).join(' | '));

  // El contraste que justifica la propuesta: con la tabla vieja su media
  // maratón de tres horas caía en Z3 ("tempo"), que no describe una carrera.
  const zona = fc => z.findIndex(x => fc >= x.min && (x.max === null || fc <= x.max)) + 1;
  ok('la media maratón (159.5) cae en Z4, no en Z3', zona(159.5) === 4, `Z${zona(159.5)}`);
  ok('el nado largo suave (136.5) cae en Z1-Z2', zona(136.5) <= 2, `Z${zona(136.5)}`);
  ok('el máximo registrado (171) cae en Z5', zona(171) === 5, `Z${zona(171)}`);
  ok('la Z2 es lo bastante ancha para usarse en la calle',
     z[1].max - z[1].min >= 8, `${z[1].min}-${z[1].max} (${z[1].max - z[1].min} lpm)`);
}

// ================================================= 12. contra el historial real
{
  const e = estimarVO2max(HISTORIAL_SEMILLA, '2026-09-07', 127, 108.9);
  ok('el historial real da un VO2max entre 22 y 26', e.vo2max > 22 && e.vo2max < 26,
     e.vo2max?.toFixed(1));
  ok('y usa varias carreras', e.carreras.length >= 3, `${e.carreras.length} carreras`);

  // La semilla no trae FC todavía: el análisis tiene que pedir resincronizar en
  // vez de romper o de inventar un máximo.
  const a = analizarZonas(HISTORIAL_SEMILLA, null);
  ok('la semilla sin FC pide resincronizar', a.sinDatos === true, String(a.sinDatos));
  ok('y cuenta bien cuántas actividades hay', a.total === HISTORIAL_SEMILLA.length,
     `${a.total}`);
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
