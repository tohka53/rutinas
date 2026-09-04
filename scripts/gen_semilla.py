#!/usr/bin/env python3
"""
Genera src/app/data/historial.seed.ts a partir de scripts/actividades-strava.json.

Por que existe una semilla
--------------------------
Conectar Strava por OAuth necesita que Miguel cree una aplicacion en su cuenta.
Hasta que eso pase, la pagina de Cumplimiento no tendria nada que comparar y se
veria vacia — como si no hubiera entrenado. El historial real de junio a
septiembre viaja en el bundle para que la pagina sirva desde el primer minuto.

Cuando Strava se conecte, lo que baja de la API manda: la semilla solo rellena
los huecos, deduplicando por strava_id.

    python3 scripts/gen_semilla.py
"""
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "scripts" / "actividades-strava.json"
DESTINO = RAIZ / "src" / "app" / "data" / "historial.seed.ts"

acts = json.loads(ORIGEN.read_text(encoding="utf-8"))
acts.sort(key=lambda a: (a["fecha"], a["strava_id"]), reverse=True)

# ------------------------------------------------------------------ validacion
ids = [a["strava_id"] for a in acts]
assert len(ids) == len(set(ids)), "hay strava_id repetidos en el JSON"
for a in acts:
    assert len(a["fecha"]) == 10 and a["fecha"][4] == "-", a
    assert a["disciplina"] in {"nado", "bici", "corre", "fuerza", "caminata", "otro"}, a
    assert a["metros"] >= 0 and a["segundos"] >= 0, a

campos = ["strava_id", "fecha", "disciplina", "sport_type", "nombre",
          "metros", "segundos", "desnivel", "calorias", "esfuerzo"]


def valor(v):
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return str(v)
    return json.dumps(str(v), ensure_ascii=False)


filas = []
for a in acts:
    partes = ", ".join(f"{c}: {valor(a.get(c))}" for c in campos)
    filas.append(f"  {{ {partes} }},")

por_disc = {}
for a in acts:
    por_disc[a["disciplina"]] = por_disc.get(a["disciplina"], 0) + 1
resumen = ", ".join(f"{k} {v}" for k, v in sorted(por_disc.items()))

cabecera = f'''// GENERADO por scripts/gen_semilla.py — no editar a mano.
//
// Historial real de Strava, {acts[-1]["fecha"]} → {acts[0]["fecha"]} ({len(acts)} actividades:
// {resumen}).
//
// Viaja en el bundle a proposito. Conectar Strava por OAuth exige crear una
// aplicacion en la cuenta de Strava, y hasta que eso ocurra Cumplimiento no
// tendria con que comparar el plan: se veria vacio, como si no se hubiera
// entrenado. Con la semilla la pagina sirve desde el primer minuto.
//
// Cuando Strava este conectado, lo que baja de la API manda; esto solo rellena
// los huecos, deduplicado por strava_id (ver StorageService.actividades).
import type {{ Actividad }} from './cumplimiento';

export const HISTORIAL_SEMILLA: readonly Actividad[] = [
'''

DESTINO.write_text(cabecera + "\n".join(filas) + "\n];\n", encoding="utf-8")
print(f"{DESTINO.relative_to(RAIZ)}: {len(acts)} actividades ({resumen})")
print(f"rango {acts[-1]['fecha']} → {acts[0]['fecha']}")
