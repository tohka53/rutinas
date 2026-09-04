// Verifica el reparto de volumen por sesión en las 60 semanas del plan.
//
// Lo importante: la suma de las partes tiene que dar el total de la semana. Si
// no cuadra, el encabezado nunca llegaría a cero al marcar todo, o llegaría
// antes de tiempo — que es justo lo que el descuento tiene que resolver.
//
//   node scripts/probar-volumen.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-volumen-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-volumen.mjs');

await writeFile(ENTRADA, `
export { volumenPorSesion, sumar, etiquetaVolumen, claveSesion } from './src/app/data/volumen';
export { SEMANAS } from './src/app/data/plan.data';
export { SEMANA_BASE } from './src/app/data/sesiones.data';
`);
await build({
  entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
  format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const { volumenPorSesion, sumar, etiquetaVolumen, claveSesion, SEMANAS, SEMANA_BASE } = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ---------------------------------------------- 1. las partes suman el total
let malas = [];
for (const s of SEMANAS) {
  const t = sumar(volumenPorSesion(s).values());
  if (!cerca(t.nadoM, s.nadoM, 1) || !cerca(t.biciKm, s.biciKm) ||
      !cerca(t.correKm, s.correKm) || !cerca(t.horas, s.horas)) {
    malas.push(`S${s.n}: nado ${t.nadoM.toFixed(0)}/${s.nadoM} bici ${t.biciKm.toFixed(1)}/${s.biciKm} ` +
               `corre ${t.correKm.toFixed(1)}/${s.correKm} h ${t.horas.toFixed(1)}/${s.horas}`);
  }
}
ok(`las partes suman el total en las ${SEMANAS.length} semanas`, malas.length === 0,
   malas.slice(0, 3).join(' | '));

// -------------------------------- 2. nunca reparte volumen a otra disciplina
malas = [];
const disciplinaDe = (dow, i) => SEMANA_BASE.find(d => d.dow === dow)?.sesiones[i]?.disciplina;
for (const s of SEMANAS) {
  for (const [k, v] of volumenPorSesion(s)) {
    const [dow, i] = k.split(':').map(Number);
    const d = disciplinaDe(dow, i);
    if (v.nadoM > 0 && d !== 'nado') malas.push(`S${s.n} ${k} (${d}) recibió nado`);
    if (v.biciKm > 0 && d !== 'bici') malas.push(`S${s.n} ${k} (${d}) recibió bici`);
    if (v.correKm > 0 && d !== 'corre' && d !== 'brick') malas.push(`S${s.n} ${k} (${d}) recibió carrera`);
  }
}
ok('cada disciplina solo recibe su propio volumen', malas.length === 0, malas.slice(0, 3).join(' | '));

// ----------------------------------- 3. nada negativo y nada mayor al total
malas = [];
for (const s of SEMANAS) {
  for (const [k, v] of volumenPorSesion(s)) {
    if (v.nadoM < 0 || v.biciKm < 0 || v.correKm < 0 || v.horas < 0) malas.push(`S${s.n} ${k} negativo`);
    if (v.nadoM > s.nadoM + 1 || v.biciKm > s.biciKm + 0.01) malas.push(`S${s.n} ${k} se pasa del total`);
  }
}
ok('ninguna sesión sale negativa ni se pasa del total', malas.length === 0, malas.slice(0, 3).join(' | '));

// ------------------------- 4. la sesión larga se lleva lo que dice la semana
{
  // Los numeros se leen del plan, no se escriben a mano: si manana cambia el
  // volumen de la semana 1, la prueba sigue midiendo lo correcto.
  const s1 = SEMANAS[0];
  const numero = s => Number(/(\d+(?:\.\d+)?)/.exec(s)[1]);
  const v = volumenPorSesion(s1);
  const largo = numero(s1.nadoLargo);
  const sabado = v.get(claveSesion(6, 0));
  ok('la natación larga del sábado se lleva el nadoLargo',
     cerca(sabado.nadoM, largo, 1), `${sabado.nadoM.toFixed(0)} vs ${largo} (${s1.nadoLargo})`);

  const lun = v.get(claveSesion(1, 0)).nadoM, mie = v.get(claveSesion(3, 0)).nadoM;
  ok('lunes y miércoles se reparten el resto en partes iguales',
     cerca(lun, mie, 0.01) && cerca(lun + mie, s1.nadoM - largo, 1),
     `lun ${lun.toFixed(0)} · mié ${mie.toFixed(0)} · resto ${(s1.nadoM - largo).toFixed(0)}`);

  const domingo = v.get(claveSesion(7, 0));
  ok('la bici larga del domingo se lleva el biciLarga',
     cerca(domingo.biciKm, numero(s1.biciLarga)),
     `${domingo.biciKm.toFixed(1)} vs ${numero(s1.biciLarga)} (${s1.biciLarga})`);

  const spin = v.get(claveSesion(2, 0)).biciKm;
  ok('cada clase de spinning queda en ~18 km, que es lo que marca la clase',
     cerca(spin, 18, 0.6), `${spin.toFixed(1)} km`);

  const viernes = v.get(claveSesion(5, 1));
  ok('el trote del viernes se lleva el correLarga',
     cerca(viernes.correKm, numero(s1.correLarga)),
     `${viernes.correKm.toFixed(1)} vs ${numero(s1.correLarga)} (${s1.correLarga})`);

  ok('el CrossFit no recibe kilómetros',
     v.get(claveSesion(1, 1)).nadoM === 0 && v.get(claveSesion(1, 1)).correKm === 0);
  ok('el CrossFit sí recibe su parte de horas', v.get(claveSesion(1, 1)).horas > 0);
}

// ------------------------------------- 5. semanas raras: carrera y sin número
{
  const carrera = SEMANAS.find(s => (s.correLarga ?? '').startsWith('CARRERA'));
  ok('hay al menos una semana de carrera para probar', !!carrera, carrera?.correLarga ?? '');
  if (carrera) {
    const v = volumenPorSesion(carrera);
    const t = sumar(v.values());
    ok('en semana de carrera el total sigue cuadrando', cerca(t.correKm, carrera.correKm),
       `${t.correKm.toFixed(1)}/${carrera.correKm}`);
    const brick = v.get(claveSesion(7, 1));
    const num = Number(/(\d+(?:\.\d+)?)/.exec(carrera.correLarga)[1]);
    ok('la carrera se le asigna al domingo, no al viernes',
       cerca(brick.correKm, Math.min(num, carrera.correKm)),
       `domingo ${brick.correKm.toFixed(1)} vs ${num}`);
  }

  const sinNumero = SEMANAS.find(s => !/\d/.test(s.biciLarga ?? ''));
  ok('hay una semana con biciLarga sin número', !!sinNumero, sinNumero?.biciLarga ?? '');
  if (sinNumero) {
    const t = sumar(volumenPorSesion(sinNumero).values());
    ok('sin número, reparte proporcional y el total cuadra', cerca(t.biciKm, sinNumero.biciKm),
       `${t.biciKm.toFixed(1)}/${sinNumero.biciKm}`);
  }
}

// ----------------------------------------------------------- 6. la etiqueta
{
  const v = volumenPorSesion(SEMANAS[0]);
  ok('etiqueta de nado en metros', /^[\d,]+ m$/.test(etiquetaVolumen(v.get(claveSesion(6, 0)))),
     etiquetaVolumen(v.get(claveSesion(6, 0))));
  ok('etiqueta de bici en km', /^[\d.]+ km$/.test(etiquetaVolumen(v.get(claveSesion(7, 0)))),
     etiquetaVolumen(v.get(claveSesion(7, 0))));
  ok('el CrossFit no lleva etiqueta', etiquetaVolumen(v.get(claveSesion(1, 1))) === '',
     etiquetaVolumen(v.get(claveSesion(1, 1))));
  ok('una sesión inexistente no rompe', etiquetaVolumen(undefined) === '');
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
