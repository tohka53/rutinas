// Verifica la agregación semanal de la pantalla de Rendimiento.
//
// Lo que se prueba, en orden de importancia:
//   1. que un spinning (distance = 0) no arruine la velocidad media
//   2. que los huecos corten la línea en vez de interpolarse
//   3. que el signo de la tendencia esté orientado (+ = mejor) también donde
//      mejorar significa un número más bajo
//   4. que los totales cuadren contra el historial real
//
//   node scripts/probar-rendimiento.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-rend-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-rend.mjs');

await writeFile(ENTRADA, `
export { porSemana, tendencia, serie, mmss, lunesDe, etiquetaSemana } from './src/app/data/rendimiento';
export { HISTORIAL_SEMILLA } from './src/app/data/historial.seed';
export { SEMANAS } from './src/app/data/plan.data';
export { IDS_IGNORADOS, KM_HORA_INDOOR } from './src/app/data/cumplimiento';
`);
await build({
  entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
  format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const {
  porSemana, tendencia, serie, mmss, lunesDe, etiquetaSemana,
  HISTORIAL_SEMILLA, SEMANAS, IDS_IGNORADOS, KM_HORA_INDOOR,
} = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.01) => a !== null && Math.abs(a - b) <= tol;

const act = (o) => ({
  strava_id: o.id ?? Math.floor(Math.random() * 1e9),
  fecha: o.f, disciplina: o.d, sport_type: null, nombre: null,
  metros: o.m ?? 0, segundos: o.s ?? 0, desnivel: 0, calorias: null,
  esfuerzo: o.e ?? null,
});

// =========================================================== 1. el lunes correcto
{
  ok('el lunes de un lunes es él mismo', lunesDe('2026-09-07') === '2026-09-07', lunesDe('2026-09-07'));
  ok('el domingo cae en la semana que arrancó el lunes',
     lunesDe('2026-09-13') === '2026-09-07', lunesDe('2026-09-13'));
  ok('el sábado también', lunesDe('2026-09-12') === '2026-09-07', lunesDe('2026-09-12'));
  ok('cruzando fin de mes', lunesDe('2026-10-01') === '2026-09-28', lunesDe('2026-10-01'));
  ok('cruzando fin de año', lunesDe('2027-01-01') === '2026-12-28', lunesDe('2027-01-01'));
  ok('la etiqueta es legible', etiquetaSemana('2026-09-07') === '7 sep', etiquetaSemana('2026-09-07'));
}

// ============================== 2. el spinning no arrastra la velocidad media
{
  // Una salida de ruta a 24 km/h + una clase de spinning de una hora sin distancia.
  const r = porSemana([
    act({ f: '2026-09-13', d: 'bici', m: 48000, s: 7200 }),   // 48 km en 2 h = 24 km/h
    act({ f: '2026-09-08', d: 'bici', m: 0, s: 3600 }),       // spinning, 1 h
  ], '2026-09-13');
  const s = r.find(x => x.lunes === '2026-09-07');

  ok('la velocidad sale solo de la salida con GPS', cerca(s.bici.velocidad, 24),
     String(s.bici.velocidad));
  ok('el spinning sí suma al volumen', cerca(s.bici.km, 48 + KM_HORA_INDOOR, 0.05),
     `${s.bici.km} km`);
  ok('y queda marcado como estimado', s.bici.indoorSesiones === 1 && cerca(s.bici.indoorKm, KM_HORA_INDOOR, 0.05),
     `${s.bici.indoorSesiones} ses / ${s.bici.indoorKm} km`);
  ok('las dos cuentan como sesión', s.bici.sesiones === 2, String(s.bici.sesiones));

  // El caso que importa: una semana SOLO de spinning no debe reportar 18 km/h
  // como si fuera un dato medido.
  const soloIndoor = porSemana([act({ f: '2026-09-08', d: 'bici', m: 0, s: 3600 })], '2026-09-13');
  ok('una semana solo indoor no inventa una velocidad',
     soloIndoor[0].bici.velocidad === null, String(soloIndoor[0].bici.velocidad));
  ok('pero sí reporta kilómetros', cerca(soloIndoor[0].bici.km, KM_HORA_INDOOR, 0.05),
     `${soloIndoor[0].bici.km} km`);
}

// ================================================= 3. ritmos de nado y carrera
{
  const r = porSemana([
    act({ f: '2026-09-07', d: 'nado', m: 2000, s: 3000 }),   // 2:30 /100 m
    act({ f: '2026-09-09', d: 'nado', m: 1000, s: 1200 }),   // 2:00 /100 m
    act({ f: '2026-09-11', d: 'corre', m: 10000, s: 3000 }), // 5:00 /km
  ], '2026-09-13');
  const s = r[0];

  // Ponderado por distancia: (3000+1200) / 30 = 140 s por 100 m = 2:20.
  ok('el ritmo de nado pondera por distancia, no promedia sesiones',
     cerca(s.nado.ritmo, 140, 0.5), `${mmss(s.nado.ritmo)} (esperado 2:20)`);
  ok('el mejor ritmo es el mejor, no el medio', cerca(s.nado.mejorRitmo, 120, 0.5),
     mmss(s.nado.mejorRitmo));
  ok('el ritmo de carrera sale en segundos por km', cerca(s.corre.ritmo, 300, 0.5),
     mmss(s.corre.ritmo));
  ok('mmss redondea sin dejar :60', mmss(119.7) === '2:00', mmss(119.7));
  ok('mmss aguanta el null', mmss(null) === '—', mmss(null));
}

// ============================ 4. un nado sin distancia no rompe el ritmo
{
  const r = porSemana([
    act({ f: '2026-09-07', d: 'nado', m: 2000, s: 3000 }),
    act({ f: '2026-09-09', d: 'nado', m: 0, s: 1800 }),   // técnica, sin distancia
  ], '2026-09-13');
  ok('un nado sin metros no arrastra el ritmo', cerca(r[0].nado.ritmo, 150, 0.5),
     mmss(r[0].nado.ritmo));
  ok('pero sí cuenta como sesión', r[0].nado.sesiones === 2, String(r[0].nado.sesiones));
}

// ================================================== 5. CrossFit: mediana y horas
{
  const r = porSemana([
    act({ f: '2026-09-07', d: 'fuerza', s: 600, e: 10 }),
    act({ f: '2026-09-08', d: 'fuerza', s: 1800, e: 20 }),
    act({ f: '2026-09-09', d: 'fuerza', s: 3600, e: 30 }),
  ], '2026-09-13');
  const s = r[0];
  ok('cuenta las sesiones de fuerza', s.fuerza.sesiones === 3, String(s.fuerza.sesiones));
  ok('la mediana es la del medio, no el promedio', cerca(s.fuerza.medianaMin, 30, 0.1),
     `${s.fuerza.medianaMin} min (promedio sería 33.3)`);
  ok('suma el esfuerzo relativo', s.fuerza.esfuerzo === 60, String(s.fuerza.esfuerzo));
  ok('suma los minutos', s.fuerza.minutos === 100, String(s.fuerza.minutos));
}

// ======================================= 6. las caminatas no cuentan como horas
{
  const r = porSemana([
    act({ f: '2026-09-07', d: 'nado', m: 1000, s: 1800 }),
    act({ f: '2026-09-08', d: 'caminata', m: 5000, s: 3600 }),
  ], '2026-09-13');
  ok('la caminata no suma a las horas de entreno', cerca(r[0].horas, 0.5, 0.05),
     `${r[0].horas} h`);
}

// =========================================== 7. las semanas vacías se conservan
{
  const r = porSemana([
    act({ f: '2026-08-03', d: 'nado', m: 1000, s: 1800 }),
    act({ f: '2026-08-24', d: 'nado', m: 1000, s: 1800 }),
  ], '2026-08-30');
  ok('hay una fila por semana, huecos incluidos', r.length === 4, `${r.length} filas`);
  ok('las del medio salen marcadas como vacías',
     r[1].hubo === false && r[2].hubo === false, `${r[1].hubo} / ${r[2].hubo}`);
  ok('las de los extremos sí tienen datos', r[0].hubo && r[3].hubo);
  ok('una semana vacía no inventa ritmo', r[1].nado.ritmo === null, String(r[1].nado.ritmo));
}

// =============================== 8. la semana en curso aparece aunque esté vacía
{
  const r = porSemana([act({ f: '2026-08-31', d: 'nado', m: 1000, s: 1800 })], '2026-09-09');
  ok('la semana de hoy existe aunque no tenga nada',
     r[r.length - 1].lunes === '2026-09-07', r[r.length - 1].lunes);
  ok('y sale marcada como vacía', r[r.length - 1].hubo === false);
}

// ============================================ 9. se enlaza con el plan por fecha
{
  const r = porSemana([act({ f: '2026-09-09', d: 'nado', m: 1000, s: 1800 })], '2026-09-13');
  const s = r[r.length - 1];
  ok('la semana del 7 sep se reconoce como la S1 del plan', s.n === 1, String(s.n));
  ok('y trae el objetivo de esa semana', s.objetivo?.nadoM === SEMANAS[0].nadoM,
     `${s.objetivo?.nadoM} vs ${SEMANAS[0].nadoM}`);

  const previa = porSemana([act({ f: '2026-08-31', d: 'nado', m: 1000, s: 1800 })], '2026-08-31');
  ok('una semana anterior al plan no se inventa un número', previa[0].n === null,
     String(previa[0].n));
}

// ============================================ 10. tendencia con signo orientado
{
  // 8 semanas de nado: las 4 viejas a 3:00, las 4 nuevas a 2:30. Mejoró.
  const acts = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(Date.UTC(2026, 6, 6));
    d.setUTCDate(d.getUTCDate() + i * 7);
    const seg = i < 4 ? 1800 : 1500;   // 1000 m en 30 o 25 min
    acts.push(act({ f: d.toISOString().slice(0, 10), d: 'nado', m: 1000, s: seg }));
  }
  const r = porSemana(acts, '2026-08-24');
  const t = tendencia(r, s => s.nado.ritmo, false);
  ok('nadar más rápido da tendencia POSITIVA', t.cambioPct > 0, `${t.cambioPct}%`);
  ok('y el tamaño es correcto', cerca(t.cambioPct, 16.7, 0.2), `${t.cambioPct}% (esperado ~16.7)`);
  ok('cuenta 4 semanas en cada bloque', t.nReciente === 4 && t.nPrevio === 4,
     `${t.nReciente}/${t.nPrevio}`);

  const alReves = tendencia(r, s => s.nado.ritmo, true);
  ok('con masEsMejor=true el mismo dato da negativo', alReves.cambioPct < 0, `${alReves.cambioPct}%`);

  // Sin bloque previo no se inventa una comparación.
  const corta = porSemana(acts.slice(0, 2), '2026-07-13');
  ok('sin semanas previas no hay porcentaje', tendencia(corta, s => s.nado.ritmo, false).cambioPct === null);
}

// ================== 11. la tendencia ignora semanas sin dato, no las cuenta como 0
{
  const acts = [
    act({ f: '2026-07-06', d: 'nado', m: 1000, s: 1800 }),
    act({ f: '2026-07-13', d: 'fuerza', s: 1800 }),          // semana sin nadar
    act({ f: '2026-07-20', d: 'nado', m: 1000, s: 1500 }),
  ];
  const r = porSemana(acts, '2026-07-26');
  const t = tendencia(r, s => s.nado.ritmo, false, 1);
  ok('una semana sin nadar no entra como ritmo cero',
     cerca(t.reciente, 150, 1) && cerca(t.previo, 180, 1),
     `reciente ${t.reciente} previo ${t.previo}`);
  ok('y la mejora se calcula solo con semanas comparables',
     cerca(t.cambioPct, 16.7, 0.3), `${t.cambioPct}%`);
}

// ============ 11b. el ritmo se pondera por volumen, no se promedia a lo bruto
{
  // Cuatro semanas de nado fuerte a 2:00 y luego cuatro semanas donde la única
  // diferencia es una semana de recuperación muy corta y muy lenta.
  //
  // Bloque previo : 4 × 2,000 m a 2:00        -> 2:00
  // Bloque reciente: 3 × 2,000 m a 2:00 + 1 × 200 m a 4:00
  //   promedio simple    = (120+120+120+240)/4 = 2:30  -> "empeoró 25 %"  (falso)
  //   ponderado por metros = (3·2000·120 + 200·240) / 6200 = ~2:02  -> casi igual
  const acts = [];
  const fecha = i => {
    const d = new Date(Date.UTC(2026, 5, 1));
    d.setUTCDate(d.getUTCDate() + i * 7);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < 8; i++) {
    const corta = i === 7;
    acts.push(act({
      f: fecha(i), d: 'nado',
      m: corta ? 200 : 2000,
      s: corta ? 480 : 2400,          // 4:00 /100 m contra 2:00 /100 m
    }));
  }
  const r = porSemana(acts, fecha(7));

  const simple = tendencia(r, s => s.nado.ritmo, false);
  const pesado = tendencia(r, s => s.nado.ritmo, false, 4, s => s.nado.metros);

  ok('sin ponderar, una semana corta finge un desplome',
     simple.cambioPct < -20, `${simple.cambioPct}%`);
  ok('ponderando por metros, la semana corta casi no mueve la aguja',
     Math.abs(pesado.cambioPct) < 5, `${pesado.cambioPct}%`);
  // Lo que de verdad se está probando no es un umbral concreto sino que ponderar
  // reduce el ruido en un orden de magnitud, no que lo maquille un poco.
  ok('ponderar reduce el ruido al menos 5 veces',
     Math.abs(simple.cambioPct) >= Math.abs(pesado.cambioPct) * 5,
     `${simple.cambioPct}% -> ${pesado.cambioPct}%`);
  ok('y el ritmo del bloque es el del total, no el de las sesiones',
     cerca(pesado.reciente, 123.9, 1), `${mmss(pesado.reciente)} (esperado ~2:04)`);

  // El peso no debe alterar un bloque donde todas las semanas pesan igual.
  ok('con volúmenes iguales, ponderar da lo mismo que no ponderar',
     cerca(pesado.previo, simple.previo, 0.01), `${pesado.previo} vs ${simple.previo}`);

  // Una semana con peso cero (nado sin metros) no debe anular el bloque.
  const conCero = porSemana([
    act({ f: '2026-07-06', d: 'nado', m: 1000, s: 1800 }),
    act({ f: '2026-07-13', d: 'nado', m: 1000, s: 1500 }),
  ], '2026-07-19');
  const t = tendencia(conCero, s => s.nado.ritmo, false, 1, () => 0);
  ok('si todos los pesos son cero se cae al promedio simple, no a null',
     t.reciente !== null && t.previo !== null, `${t.reciente} / ${t.previo}`);
}

// ============================== 11c. la velocidad se pondera por km de ruta
{
  const r = porSemana([
    // Semana 1: 60 km a 20 km/h
    act({ f: '2026-06-07', d: 'bici', m: 60000, s: 10800 }),
    // Semana 2: 60 km a 20 km/h + un spinning (que no debe pesar)
    act({ f: '2026-06-14', d: 'bici', m: 60000, s: 10800 }),
    act({ f: '2026-06-14', d: 'bici', m: 0, s: 3600 }),
  ], '2026-06-21');
  ok('kmRuta excluye lo indoor', cerca(r[1].bici.kmRuta, 60, 0.05), `${r[1].bici.kmRuta} km`);
  ok('km sí lo incluye', cerca(r[1].bici.km, 78, 0.05), `${r[1].bici.km} km`);
  const t = tendencia(r, s => s.bici.velocidad, true, 1, s => s.bici.kmRuta);
  ok('el spinning no cambia la tendencia de velocidad', cerca(t.cambioPct, 0, 0.05), `${t.cambioPct}%`);
}

// ================================= 12. los huecos cortan la línea del sparkline
{
  const s = serie([1, 2, null, 4, 5], 100, 40);
  ok('una serie con un hueco produce dos tramos', s.tramos.length === 2,
     `${s.tramos.length} tramos: ${JSON.stringify(s.tramos)}`);
  ok('los puntos solo cuentan los valores reales', s.puntos.length === 4,
     String(s.puntos.length));
  ok('el índice del punto conserva la posición original',
     s.puntos[2].i === 3, String(s.puntos[2].i));
  ok('min y max salen de los valores válidos', s.min === 1 && s.max === 5, `${s.min}-${s.max}`);

  const sola = serie([null, 3, null], 100, 40);
  ok('un punto suelto no forma tramo', sola.tramos.length === 0, String(sola.tramos.length));
  ok('pero sí queda dibujable como punto', sola.puntos.length === 1, String(sola.puntos.length));

  const plana = serie([5, 5, 5], 100, 40);
  ok('una serie plana no divide por cero',
     plana.puntos.every(p => Number.isFinite(p.y)), JSON.stringify(plana.puntos));

  ok('una serie toda vacía no rompe', serie([null, null], 100, 40).tramos.length === 0);
}

// ================================================ 13. contra el historial real
{
  const reales = HISTORIAL_SEMILLA.filter(a => !IDS_IGNORADOS.has(a.strava_id));
  const r = porSemana(reales, '2026-09-03');

  const nadoTotal = r.reduce((s, x) => s + x.nado.metros, 0);
  const esperado = reales.filter(a => a.disciplina === 'nado').reduce((s, a) => s + a.metros, 0);
  ok('los metros de nado cuadran con el historial', nadoTotal === esperado,
     `${nadoTotal} vs ${esperado}`);

  const fuerzaTotal = r.reduce((s, x) => s + x.fuerza.sesiones, 0);
  ok('las sesiones de CrossFit cuadran',
     fuerzaTotal === reales.filter(a => a.disciplina === 'fuerza').length,
     `${fuerzaTotal} vs ${reales.filter(a => a.disciplina === 'fuerza').length}`);

  ok('cubre las 14 semanas del historial', r.length === 14, `${r.length} semanas`);
  ok('la primera semana es la del 1 jun', r[0].lunes === '2026-06-01', r[0].lunes);

  const conNado = r.filter(x => x.nado.ritmo !== null);
  ok('casi todas las semanas tienen dato de nado', conNado.length >= 12, `${conNado.length}/14`);

  // La salida duplicada del 5 jul ya viene filtrada por IDS_IGNORADOS: esa
  // semana tiene que reportar 19.4 km, no 37.6.
  const jul = r.find(x => x.lunes === '2026-06-29');
  ok('la salida duplicada del 5 jul no se cuenta dos veces', cerca(jul.bici.km, 19.4, 0.1),
     `${jul.bici.km} km`);

  const nadie = r.filter(x => !x.hubo);
  ok('ninguna semana del historial quedó completamente vacía', nadie.length === 0,
     nadie.map(x => x.lunes).join(', '));

  // El hallazgo del estudio: la bici desaparece a partir de agosto.
  const sinBici = r.filter(x => x.lunes >= '2026-08-03' && x.bici.km === 0);
  ok('refleja las semanas sin bici de agosto', sinBici.length >= 4, `${sinBici.length} semanas`);
}

// ================================================== 14. entradas raras no rompen
{
  ok('sin actividades devuelve vacío', porSemana([], '2026-09-07').length === 0);
  const raro = porSemana([
    act({ f: '2026-09-07', d: 'otro', m: 100, s: 600 }),
    act({ f: '2026-09-08', d: 'nado', m: 1000, s: 0 }),     // sin tiempo
  ], '2026-09-13');
  ok('una disciplina desconocida no rompe', raro.length === 1);
  ok('pero sí suma a las horas', raro[0].horas > 0, `${raro[0].horas} h`);
  ok('un nado sin segundos no produce un ritmo infinito',
     raro[0].nado.ritmo === null, String(raro[0].nado.ritmo));
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
