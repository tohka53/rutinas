// Verifica los objetivos por carrera y el juicio sobre si son alcanzables.
//
// Lo que se prueba, en orden de importancia:
//   1. que el inverso del VDOT reproduzca las tablas de Daniels — sin eso, la
//      comparación por distancia miente
//   2. que el desglose de cada carrera se convierta bien en ritmos
//   3. que un objetivo imposible se declare imposible, y no "exigente"
//   4. que la curva de hitos adelante la mejora en vez de repartirla pareja
//
//   node scripts/probar-progresion.mjs
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, rm } from 'node:fs/promises';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRADA = join(RAIZ, '.tmp-prog-entrada.ts');
const SALIDA = join(RAIZ, '.tmp-prog.mjs');

await writeFile(ENTRADA, `
export * from './src/app/data/progresion';
export { vdotDe, tiempoParaDistancia } from './src/app/data/fisiologia';
export { CARRERAS } from './src/app/data/carreras.data';
`);
await build({
  entryPoints: [ENTRADA], outfile: SALIDA, bundle: true,
  format: 'esm', platform: 'node', logLevel: 'silent',
});
const m = await import(pathToFileURL(SALIDA).href);
await rm(ENTRADA); await rm(SALIDA);

const {
  aSegundos, objetivosDe, valorObjetivo, metrosCarreraPie, ritmoEsperadoEnDistancia,
  requerido, hitos, fraccionEsperada, avance, semanasHasta, carrerasPendientes,
  MEJORA_PLAUSIBLE, SEMANAS_REFERENCIA, MAS_ES_MEJOR, K_CURVA,
  vdotDe, tiempoParaDistancia, CARRERAS,
} = m;

let f = 0;
const ok = (n, c, x = '') => { if (!c) f++; console.log(`${c ? 'OK ' : 'X  '} ${n}${x ? ' — ' + x : ''}`); };
const cerca = (a, b, tol = 0.01) => a !== null && a !== undefined && Math.abs(a - b) <= tol;
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const HOY = '2026-09-07';

// =================== 1. el inverso del VDOT reproduce las tablas de Daniels
{
  // Los mismos tres puntos de referencia que valida probar-fisiologia, pero al
  // revés. Si esto falla, toda la comparación por distancia está mal.
  ok('VDOT 50 corre 5 km en ~19:57', cerca(tiempoParaDistancia(50, 5000), 1197, 20),
     mmss(tiempoParaDistancia(50, 5000)));
  ok('VDOT 40 corre 10 km en ~50:03', cerca(tiempoParaDistancia(40, 10000), 3003, 30),
     mmss(tiempoParaDistancia(40, 10000)));
  ok('VDOT 45 corre la media en ~1:40:20', cerca(tiempoParaDistancia(45, 21097), 6020, 40),
     mmss(tiempoParaDistancia(45, 21097)));

  // Ida y vuelta en un barrido: es la garantía de que la bisección converge.
  let peor = 0;
  for (let v = 20; v <= 60; v += 2) {
    for (const d of [5000, 10000, 21097, 42195]) {
      const t = tiempoParaDistancia(v, d);
      const back = t === null ? null : vdotDe(d, t);
      if (back === null) { peor = 99; continue; }
      peor = Math.max(peor, Math.abs(back - v));
    }
  }
  ok('ida y vuelta exacta en todo el rango útil', peor < 0.01, `error máx ${peor.toFixed(4)}`);

  ok('a más distancia, más lento por km',
     tiempoParaDistancia(30, 21097) / 21.097 > tiempoParaDistancia(30, 5000) / 5,
     `${mmss(tiempoParaDistancia(30, 21097) / 21.097)} vs ${mmss(tiempoParaDistancia(30, 5000) / 5)}`);
  ok('entradas imposibles devuelven null',
     tiempoParaDistancia(0, 5000) === null && tiempoParaDistancia(40, 0) === null);
}

// ====================== 2. el desglose de las carreras se convierte en ritmos
{
  ok('"35:00" son minutos:segundos', aSegundos('35:00') === 2100, String(aSegundos('35:00')));
  ok('"1:32" en bici son horas:minutos', aSegundos('1:32') === 5520, String(aSegundos('1:32')));
  ok('"2:38" también', aSegundos('2:38') === 9480, String(aSegundos('2:38')));
  ok('"1:40:20" con tres partes', aSegundos('1:40:20') === 6020, String(aSegundos('1:40:20')));
  ok('basura devuelve null', aSegundos('mañana') === null);

  const oli = objetivosDe(CARRERAS.find(c => c.id === 'olimpico'));
  ok('el olímpico pide 2:20 /100 m de nado', cerca(oli.nadoRitmo, 140, 1),
     mmss(oli.nadoRitmo));
  ok('y 26.1 km/h en bici', cerca(oli.biciKmh, 26.1, 0.2), oli.biciKmh?.toFixed(1));
  ok('y 7:12 /km corriendo', cerca(oli.correRitmo, 432, 2), mmss(oli.correRitmo));

  const mty = objetivosDe(CARRERAS.find(c => c.id === 'segundo703'));
  ok('Monterrey pide 29.0 km/h en bici', cerca(mty.biciKmh, 29.0, 0.2), mty.biciKmh?.toFixed(1));
  ok('y 7:29 /km en la media', cerca(mty.correRitmo, 449, 2), mmss(mty.correRitmo));
  ok('la distancia de carrera a pie se lee del desglose',
     metrosCarreraPie(CARRERAS.find(c => c.id === 'segundo703')) === 21100,
     String(metrosCarreraPie(CARRERAS.find(c => c.id === 'segundo703'))));
  ok('y la del olímpico también',
     metrosCarreraPie(CARRERAS.find(c => c.id === 'olimpico')) === 10000);

  // Todas las carreras del plan tienen que dar los tres objetivos.
  const incompletas = CARRERAS.filter(c => {
    const o = objetivosDe(c);
    return o.nadoRitmo === null || o.biciKmh === null || o.correRitmo === null;
  });
  ok('las cuatro carreras dan los tres objetivos', incompletas.length === 0,
     incompletas.map(c => c.id).join(', '));

  // Cordura: ningún objetivo absurdo.
  const raros = CARRERAS.filter(c => {
    const o = objetivosDe(c);
    return o.nadoRitmo < 60 || o.nadoRitmo > 240 || o.biciKmh < 10 || o.biciKmh > 50
        || o.correRitmo < 180 || o.correRitmo > 720;
  });
  ok('ningún objetivo cae fuera de lo humano', raros.length === 0, raros.map(c => c.id).join(', '));

  const vacia = objetivosDe({ desglose: [] });
  ok('una carrera sin desglose no inventa ceros',
     vacia.nadoRitmo === null && vacia.biciKmh === null && vacia.correRitmo === null);
}

// ============= 3. comparar peras con peras: el ritmo se traduce por distancia
{
  // Su VDOT real es 24.2. Su media maratón fue a 8:14/km.
  const enMedia = ritmoEsperadoEnDistancia(tiempoParaDistancia, 24.2, 21100);
  const en10k = ritmoEsperadoEnDistancia(tiempoParaDistancia, 24.2, 10000);

  ok('el mismo VDOT predice ritmos distintos según la distancia', en10k < enMedia,
     `10 km ${mmss(en10k)} vs media ${mmss(enMedia)}`);
  ok('en media maratón predice cerca de lo que corrió de verdad',
     cerca(enMedia, 494, 20), `${mmss(enMedia)} vs 8:14 real`);
  ok('en 10 km predice ~7:38', cerca(en10k, 458, 10), mmss(en10k));

  // El punto: contra el objetivo de 7:12 del olímpico, la comparación honesta
  // da 6 % y la tramposa (usando su ritmo de media) daría 13 %.
  const justa = requerido('corre', en10k, 432, 9);
  const tramposa = requerido('corre', 494, 432, 9);
  ok('comparar por distancia baja lo que "falta" de 13 % a 6 %',
     cerca(justa.totalPct, 0.06, 0.02) && cerca(tramposa.totalPct, 0.13, 0.02),
     `justa ${(justa.totalPct * 100).toFixed(0)}% vs tramposa ${(tramposa.totalPct * 100).toFixed(0)}%`);

  ok('sin VDOT no se inventa un ritmo',
     ritmoEsperadoEnDistancia(tiempoParaDistancia, null, 10000) === null);
  ok('sin distancia tampoco',
     ritmoEsperadoEnDistancia(tiempoParaDistancia, 24.2, null) === null);
}

// ================================= 4. el veredicto sobre si es alcanzable
{
  // Ya está: el objetivo es más lento que lo que ya hace.
  const ya = requerido('nado', 140, 150, 20);
  ok('un objetivo ya alcanzado se marca como tal', ya.veredicto === 'ya-esta', ya.veredicto);
  ok('y no pide mejora', ya.porSemanaPct === 0, String(ya.porSemanaPct));

  // El signo está orientado por disciplina: en bici más es mejor.
  const bici = requerido('bici', 20, 25, 26);
  ok('en bici, subir la velocidad cuenta como mejora',
     bici.totalPct > 0 && cerca(bici.totalPct, 0.25, 0.01), (bici.totalPct * 100).toFixed(0) + '%');
  const nado = requerido('nado', 150, 135, 26);
  ok('en nado, bajar el ritmo cuenta como mejora',
     nado.totalPct > 0 && cerca(nado.totalPct, 0.10, 0.01), (nado.totalPct * 100).toFixed(0) + '%');

  // El escalado a la ventana de referencia es lo que hace justo el juicio.
  const rapido = requerido('bici', 20, 24, 8);     // 20 % en 8 semanas
  const lento = requerido('bici', 20, 24, 52);     // 20 % en 52 semanas
  ok('la misma mejora en menos tiempo es más exigente',
     rapido.equivalente26 > lento.equivalente26,
     `${(rapido.equivalente26 * 100).toFixed(0)}% vs ${(lento.equivalente26 * 100).toFixed(0)}%`);
  ok('y eso cambia el veredicto',
     rapido.veredicto !== lento.veredicto, `${rapido.veredicto} / ${lento.veredicto}`);

  // Un objetivo imposible tiene que decirse imposible.
  const imposible = requerido('corre', 480, 240, 10);   // duplicar la velocidad en 10 sem
  ok('duplicar la velocidad en 10 semanas se declara fuera de alcance',
     imposible.veredicto === 'fuera-de-rango', imposible.veredicto);
  ok('y culpa al objetivo, no al entrenamiento',
     /objetivo o la fecha/.test(imposible.porQue), imposible.porQue);

  // El compuesto importa: repartir 43 % en 32 semanas no es 1.34 % por semana.
  const mty = requerido('bici', 20.3, 29.0, 32);
  ok('el porcentaje semanal es compuesto, no dividido',
     mty.porSemanaPct < mty.totalPct / 32,
     `${(mty.porSemanaPct * 100).toFixed(3)}% vs ${(mty.totalPct / 32 * 100).toFixed(3)}% si se dividiera`);
  ok('y compuesto sobre las semanas devuelve el total',
     cerca(Math.pow(1 + mty.porSemanaPct, 32) - 1, mty.totalPct, 0.001),
     `${((Math.pow(1 + mty.porSemanaPct, 32) - 1) * 100).toFixed(1)}% vs ${(mty.totalPct * 100).toFixed(1)}%`);

  // Entradas incompletas no rompen.
  ok('sin actual no se juzga nada', requerido('nado', null, 140, 20).totalPct === null);
  ok('sin objetivo tampoco', requerido('nado', 150, null, 20).totalPct === null);
  ok('una carrera pasada se dice pasada', /ya pasó/.test(requerido('nado', 150, 140, 0).porQue));
}

// ========================= 5. la curva de hitos adelanta la mejora
{
  ok('a mitad de camino ya debería estar hecho más de la mitad',
     fraccionEsperada(0.5, 1) > 0.6, fraccionEsperada(0.5, 1).toFixed(3));
  ok('a un tercio, más de un tercio',
     fraccionEsperada(1, 3) > 0.45, fraccionEsperada(1, 3).toFixed(3));
  ok('al final es exactamente el 100 %', cerca(fraccionEsperada(10, 10), 1, 1e-9),
     fraccionEsperada(10, 10).toFixed(6));
  ok('al principio es 0', cerca(fraccionEsperada(0, 10), 0, 1e-9));
  ok('nunca se pasa del 100 %', fraccionEsperada(20, 10) === 1);
  ok('es monótona', fraccionEsperada(3, 10) < fraccionEsperada(6, 10));

  // Contra una curva lineal, la de verdad pide más temprano.
  ok('pide más temprano que una repartición pareja',
     fraccionEsperada(3, 10) > 0.3, fraccionEsperada(3, 10).toFixed(3));

  const hs = hitos(20.3, 29.0, 32, 'bici', HOY, 8);
  ok('los hitos van cada 8 semanas y cierran en la carrera',
     hs.length === 4 && hs[hs.length - 1].semanas === 32,
     hs.map(h => h.semanas).join(', '));
  ok('cada hito es mejor que el anterior', hs.every((h, i) => i === 0 || h.valor > hs[i - 1].valor),
     hs.map(h => h.valor.toFixed(1)).join(' -> '));
  ok('el último hito es el objetivo', cerca(hs[hs.length - 1].valor, 29.0, 0.05),
     hs[hs.length - 1].valor.toFixed(2));
  ok('las fechas avanzan de a 8 semanas', hs[0].fecha === '2026-11-02', hs[0].fecha);

  // En nado el valor BAJA, porque menos es mejor.
  const hn = hitos(151, 136, 32, 'nado', HOY, 8);
  ok('en nado los hitos bajan', hn.every((h, i) => i === 0 || h.valor < hn[i - 1].valor),
     hn.map(h => mmss(h.valor)).join(' -> '));
  ok('y terminan en el objetivo', cerca(hn[hn.length - 1].valor, 136, 0.5),
     mmss(hn[hn.length - 1].valor));

  // Si `cada` no divide exacto, la carrera igual cierra la lista.
  const raro = hitos(20, 25, 10, 'bici', HOY, 4);
  ok('la carrera siempre cierra la lista aunque no caiga en múltiplo',
     raro[raro.length - 1].semanas === 10, raro.map(h => h.semanas).join(', '));

  ok('sin margen de tiempo no hay hitos', hitos(20, 25, 0, 'bici', HOY).length === 0);
  ok('con valores inválidos tampoco', hitos(0, 25, 10, 'bici', HOY).length === 0);
}

// ============================= 6. avance: comparar lo real contra lo que tocaba
{
  // Camino de 20 a 30 km/h en 20 semanas; a la semana 10 deberia ir por ~73 %.
  const alDia = avance(20, 20 + 10 * fraccionEsperada(10, 20), 30, 10, 20, 'bici');
  ok('el que va justo en la curva sale al día', alDia.alDia, `${alDia.diferenciaPct}%`);
  ok('y su diferencia es ~0', cerca(alDia.diferenciaPct, 0, 0.2), `${alDia.diferenciaPct}%`);

  const atras = avance(20, 22, 30, 10, 20, 'bici');
  ok('el que va corto sale atrasado', !atras.alDia, `${atras.diferenciaPct}%`);
  ok('y la diferencia es negativa', atras.diferenciaPct < 0, `${atras.diferenciaPct}%`);

  const adelante = avance(20, 29, 30, 10, 20, 'bici');
  ok('el que va sobrado sale adelantado',
     adelante.alDia && adelante.diferenciaPct > 0, `${adelante.diferenciaPct}%`);

  ok('sin punto de partida no se puede medir avance', avance(0, 25, 30, 10, 20, 'bici') === null);
  ok('si ya estaba en el objetivo no hay camino que medir',
     avance(30, 30, 30, 10, 20, 'bici') === null);
}

// ================================ 7. contra el calendario real de Miguel
{
  const pend = carrerasPendientes(HOY);
  ok('quedan las cuatro carreras por delante', pend.length === 4, String(pend.length));
  ok('vienen ordenadas por fecha',
     pend.every((c, i) => i === 0 || c.fecha >= pend[i - 1].fecha),
     pend.map(c => c.fecha).join(' < '));
  ok('la primera es el olímpico de noviembre', pend[0].id === 'olimpico', pend[0].id);
  ok('faltan 9 semanas', semanasHasta(HOY, pend[0].fecha) === 9,
     String(semanasHasta(HOY, pend[0].fecha)));

  const pasado = carrerasPendientes('2027-05-01');
  ok('las que ya pasaron no aparecen', pasado.length === 1 && pasado[0].id === 'tercero703',
     pasado.map(c => c.id).join(', '));

  // El hallazgo: con su bici de hoy, noviembre no da.
  const oli = objetivosDe(pend[0]);
  const rBici = requerido('bici', 20.3, oli.biciKmh, 9);
  ok('la bici del olímpico de noviembre queda fuera de alcance',
     rBici.veredicto === 'fuera-de-rango',
     `${(rBici.totalPct * 100).toFixed(0)}% en 9 semanas, ${rBici.veredicto}`);

  // Y Monterrey, con 32 semanas, sí entra.
  const mty = objetivosDe(pend.find(c => c.id === 'segundo703'));
  const rMty = requerido('bici', 20.3, mty.biciKmh, 32);
  ok('la misma bici en 32 semanas pasa a ser exigente pero posible',
     rMty.veredicto === 'exigente',
     `${(rMty.totalPct * 100).toFixed(0)}% en 32 semanas, ${rMty.veredicto}`);

  // La carrera de Monterrey, comparada por distancia, es holgada.
  const enMedia = ritmoEsperadoEnDistancia(tiempoParaDistancia, 24.2, 21100);
  const rCorre = requerido('corre', enMedia, mty.correRitmo, 32);
  ok('correr en Monterrey sale holgado al comparar por distancia',
     rCorre.veredicto === 'holgado',
     `${(rCorre.totalPct * 100).toFixed(0)}%, ${rCorre.veredicto}`);
}

// ============================== 8. los rangos plausibles son coherentes
{
  for (const d of ['nado', 'bici', 'corre']) {
    const r = MEJORA_PLAUSIBLE[d];
    ok(`el techo de ${d} es mayor que su típico`, r.techo > r.tipico,
       `${(r.tipico * 100).toFixed(0)}% / ${(r.techo * 100).toFixed(0)}%`);
    ok(`y ${d} está en un rango creíble`, r.tipico > 0.02 && r.techo < 0.8,
       `${(r.tipico * 100).toFixed(0)}%-${(r.techo * 100).toFixed(0)}%`);
  }
  ok('la bici admite más mejora que la carrera',
     MEJORA_PLAUSIBLE.bici.tipico > MEJORA_PLAUSIBLE.corre.tipico,
     `${MEJORA_PLAUSIBLE.bici.tipico} vs ${MEJORA_PLAUSIBLE.corre.tipico}`);
  ok('la orientación por disciplina está completa',
     MAS_ES_MEJOR.bici === true && MAS_ES_MEJOR.nado === false && MAS_ES_MEJOR.corre === false);
  ok('la ventana de referencia es medio año', SEMANAS_REFERENCIA === 26);
}

console.log(f ? `\n${f} FALLO(S)` : '\nTODO OK');
process.exit(f ? 1 : 0);
