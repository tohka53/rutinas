// Verifica que el plan suba solo cuando corresponde — y sobre todo, que NO suba
// cuando no corresponde. Los frenos son la parte que importa: sin ellos, +20 %
// semanal compuesto triplica el volumen en dos meses.
//
//   node scripts/probar-adaptacion.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-adapt-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-adapt.mjs');

await writeFile(ENTRADA, `
export * from './src/app/data/adaptacion';
export { volumenPorSesion, sumar } from './src/app/data/volumen';
export { SEMANAS } from './src/app/data/plan.data';
`);
await build({ entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
              format: 'esm', platform: 'node', logLevel: 'silent' });
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const {
  calcularAdaptacion, aplicarAdaptacion, resumen,
  TOPE_SEMANAL, TECHO_FACTOR, TECHOS, SIN_AJUSTE,
  volumenPorSesion, sumar, SEMANAS,
} = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

let idSeq = 1;
/** Actividades sinteticas que dan exactamente los metros/km pedidos en esa semana. */
function acts(semana, { nadoM = 0, biciKm = 0, correKm = 0, horasExtra = 0 } = {}) {
  const out = [];
  const dia = semana.inicio;
  if (nadoM) out.push({ strava_id: idSeq++, fecha: dia, disciplina: 'nado', metros: nadoM, segundos: 3600 });
  if (biciKm) out.push({ strava_id: idSeq++, fecha: dia, disciplina: 'bici', metros: biciKm * 1000, segundos: 3600 });
  if (correKm) out.push({ strava_id: idSeq++, fecha: dia, disciplina: 'corre', metros: correKm * 1000, segundos: 3600 });
  if (horasExtra) out.push({ strava_id: idSeq++, fecha: dia, disciplina: 'fuerza', metros: 0, segundos: horasExtra * 3600 });
  return out;
}
const DESPUES = '2027-12-31';   // todas las semanas ya cerradas

// ------------------------------------------------------------ 1. sin datos
{
  const a = calcularAdaptacion(SEMANAS, [], DESPUES);
  ok('sin actividades no ajusta nada',
     JSON.stringify(a.factores) === JSON.stringify(SIN_AJUSTE), JSON.stringify(a.factores));
  ok('y no inventa pasos', a.pasos.length === 0);
}

// ------------------------------------- 2. se paso en nado: sube solo el nado
{
  const s1 = SEMANAS[0];
  const a = calcularAdaptacion([s1], acts(s1, { nadoM: Math.round(s1.nadoM * 1.1) }), DESPUES);
  ok('nadar 10 % de mas sube el factor de nado', cerca(a.factores.nadoM, 1.1, 0.01),
     a.factores.nadoM.toFixed(3));
  ok('no toca bici ni carrera',
     a.factores.biciKm === 1 && a.factores.correKm === 1,
     JSON.stringify(a.factores));
  ok('deja rastro de por que subio', a.pasos.length === 1 && a.pasos[0].campo === 'nadoM',
     JSON.stringify(a.pasos[0] ?? {}));
  ok('el paso dice cuanto pedia y cuanto hizo',
     a.pasos[0].pedido === s1.nadoM && a.pasos[0].real > s1.nadoM,
     `pedia ${a.pasos[0].pedido}, hizo ${a.pasos[0].real}`);
}

// ------------------------------------------------ 3. el freno de +20 % frena
{
  const s1 = SEMANAS[0];
  const a = calcularAdaptacion([s1], acts(s1, { nadoM: s1.nadoM * 3 }), DESPUES);
  ok('nadar el triple NO triplica el plan', cerca(a.factores.nadoM, TOPE_SEMANAL),
     `factor ${a.factores.nadoM.toFixed(3)} (tope ${TOPE_SEMANAL})`);
  ok('y avisa que lo freno', a.pasos[0].frenado === true);
}

// ------------------------------- 4. varias semanas: sube gradual, con techo
{
  const cargas = SEMANAS.filter(s => !s.descarga && !s.carrera).slice(0, 8);
  const todas = cargas.flatMap(s => acts(s, { nadoM: s.nadoM * 5 }));
  const a = calcularAdaptacion(cargas, todas, DESPUES);
  ok('con muchas semanas pasadas el factor sube gradual, no de golpe',
     a.pasos.length >= 3, `${a.pasos.length} subidas`);
  ok('pero nunca pasa del techo', a.factores.nadoM <= TECHO_FACTOR + 1e-9,
     `factor final ${a.factores.nadoM.toFixed(3)} (techo ${TECHO_FACTOR})`);
  const crecimientos = a.pasos.filter(p => p.campo === 'nadoM')
    .map(p => p.despues / p.antes);
  ok('ningun salto individual pasa del 20 %',
     crecimientos.every(c => c <= TOPE_SEMANAL + 1e-9),
     crecimientos.map(c => c.toFixed(2)).join(' · '));
}

// --------------------------------- 5. descarga y carrera no mueven el factor
{
  const desc = SEMANAS.find(s => s.descarga && !s.carrera);
  const a = calcularAdaptacion([desc], acts(desc, { nadoM: desc.nadoM * 2 }), DESPUES);
  ok('pasarse en una semana de descarga no sube el plan',
     a.factores.nadoM === 1, `S${desc.n}: ${a.factores.nadoM}`);

  const carr = SEMANAS.find(s => s.carrera);
  const b = calcularAdaptacion([carr], acts(carr, { nadoM: carr.nadoM * 2 }), DESPUES);
  ok('ni en una semana de carrera', b.factores.nadoM === 1, `S${carr.n}: ${b.factores.nadoM}`);
}

// -------------------------------------- 6. una semana que no cerro no cuenta
{
  const s1 = SEMANAS[0];
  const a = calcularAdaptacion([s1], acts(s1, { nadoM: s1.nadoM * 2 }), s1.inicio);
  ok('la semana en curso todavia no ajusta nada', a.factores.nadoM === 1,
     `hoy=${s1.inicio} fin=${s1.fin}`);
}

// --------------------------------------------------- 7. nunca baja el factor
{
  const cargas = SEMANAS.filter(s => !s.descarga && !s.carrera).slice(0, 3);
  const buena = acts(cargas[0], { nadoM: cargas[0].nadoM * 1.2 });
  const floja = acts(cargas[1], { nadoM: Math.round(cargas[1].nadoM * 0.3) });
  const a = calcularAdaptacion(cargas, [...buena, ...floja], DESPUES);
  ok('una semana floja despues de una buena no baja el plan',
     a.factores.nadoM > 1.05, a.factores.nadoM.toFixed(3));
}

// --------------------------------------- 8. aplicar: que y que no se toca
{
  const fac = { nadoM: 1.2, biciKm: 1.2, correKm: 1.2, horas: 1.2 };
  const s1 = aplicarAdaptacion(SEMANAS[0], fac);
  ok('el objetivo de nado sube', s1.nadoM > SEMANAS[0].nadoM,
     `${SEMANAS[0].nadoM} → ${s1.nadoM}`);
  ok('la sesion larga sube en la misma proporcion',
     Number(/(\d+)/.exec(s1.nadoLargo)[1]) > Number(/(\d+)/.exec(SEMANAS[0].nadoLargo)[1]),
     `${SEMANAS[0].nadoLargo} → ${s1.nadoLargo}`);
  ok('la larga de bici conserva el resto del texto',
     s1.biciLarga.includes('Z2'), `${SEMANAS[0].biciLarga} → ${s1.biciLarga}`);

  const desc = SEMANAS.find(s => s.descarga && !s.carrera);
  ok('una semana de descarga sale intacta',
     JSON.stringify(aplicarAdaptacion(desc, fac)) === JSON.stringify(desc), `S${desc.n}`);
  const carr = SEMANAS.find(s => s.carrera);
  ok('una semana de carrera sale intacta',
     JSON.stringify(aplicarAdaptacion(carr, fac)) === JSON.stringify(carr), `S${carr.n}`);
  ok('sin ajuste devuelve la misma semana',
     aplicarAdaptacion(SEMANAS[0], SIN_AJUSTE) === SEMANAS[0]);
}

// -------------------------------------------- 9. los techos absolutos frenan
{
  const grande = { nadoM: 99, biciKm: 99, correKm: 99, horas: 99 };
  let malas = [];
  for (const s of SEMANAS) {
    const a = aplicarAdaptacion(s, grande);
    if (a.nadoM > TECHOS.nadoM || a.biciKm > TECHOS.biciKm ||
        a.correKm > TECHOS.correKm || a.horas > TECHOS.horas) malas.push(`S${s.n}`);
  }
  ok('con un factor absurdo los techos absolutos siguen aguantando',
     malas.length === 0, malas.slice(0, 4).join(' '));
}

// ------------------------- 10. el reparto por sesion sigue cuadrando ajustado
{
  const fac = { nadoM: 1.3, biciKm: 1.15, correKm: 1.25, horas: 1.2 };
  let malas = [];
  for (const s of SEMANAS) {
    const a = aplicarAdaptacion(s, fac);
    const t = sumar(volumenPorSesion(a).values());
    if (Math.abs(t.nadoM - a.nadoM) > 1 || Math.abs(t.biciKm - a.biciKm) > 0.01 ||
        Math.abs(t.correKm - a.correKm) > 0.01 || Math.abs(t.horas - a.horas) > 0.01) {
      malas.push(`S${s.n}: nado ${t.nadoM.toFixed(0)}/${a.nadoM} bici ${t.biciKm.toFixed(1)}/${a.biciKm}`);
    }
  }
  ok('con el plan ajustado, las partes siguen sumando el total en las 60 semanas',
     malas.length === 0, malas.slice(0, 3).join(' | '));
}

// ----------------------------------------------------------- 11. el resumen
{
  ok('sin ajuste el resumen va vacio', resumen(SIN_AJUSTE).length === 0);
  const r = resumen({ nadoM: 1.25, biciKm: 1, correKm: 1, horas: 1.1 });
  ok('el resumen lista solo lo que subio y en porcentaje',
     r.length === 2 && r[0].campo === 'nadoM' && r[0].pct === 25,
     JSON.stringify(r));
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
