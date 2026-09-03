#!/usr/bin/env node
/**
 * Sube el historial de Strava a Supabase, a través de la API del propio sitio.
 *
 * No maneja la llave de Supabase: le pega a /api/datos igual que el navegador,
 * usando el código de acceso. Así no hay una segunda credencial dando vueltas.
 *
 *   CODIGO_ACCESO=xxxxx node scripts/importar-strava.mjs
 *   CODIGO_ACCESO=xxxxx SITIO=http://localhost:3000 node scripts/importar-strava.mjs
 *
 * El archivo actividades-strava.json lo genera Claude desde tu Strava.
 * Es idempotente: reimporta sobre el mismo strava_id sin duplicar.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SITIO = process.env.SITIO ?? 'https://rutinas-two.vercel.app';
const CODIGO = process.env.CODIGO_ACCESO;
const LOTE = 100;

if (!CODIGO) {
  console.error('Falta CODIGO_ACCESO.\n  CODIGO_ACCESO=xxxxx node scripts/importar-strava.mjs');
  process.exit(1);
}

const filas = JSON.parse(await readFile(join(RAIZ, 'scripts', 'actividades-strava.json'), 'utf8'));
console.log(`${filas.length} actividades para subir a ${SITIO}`);

let subidas = 0;
for (let i = 0; i < filas.length; i += LOTE) {
  const lote = filas.slice(i, i + LOTE);
  const r = await fetch(`${SITIO}/api/datos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-codigo': CODIGO },
    body: JSON.stringify({ tipo: 'actividad', accion: 'guardar', datos: lote }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(`\nFalló el lote ${i / LOTE + 1}: ${r.status}`);
    console.error(cuerpo.detalle ?? cuerpo.error ?? '(sin detalle)');
    if (r.status === 401) console.error('El CODIGO_ACCESO no coincide con el de Vercel.');
    process.exit(1);
  }
  subidas += cuerpo.guardadas ?? lote.length;
  process.stdout.write(`\r  subidas ${subidas}/${filas.length}`);
}

// Resumen de lo importado, para confirmar que llegó
const porDisciplina = filas.reduce((a, f) => ((a[f.disciplina] = (a[f.disciplina] ?? 0) + 1), a), {});
console.log(`\n\nListo. ${subidas} actividades en rutina_actividad.`);
console.log('Por disciplina:', porDisciplina);
console.log(`Rango: ${filas.at(-1).fecha} → ${filas[0].fecha}`);
console.log('\nAbrí /cumplimiento en el sitio para verlas contra el plan.');
