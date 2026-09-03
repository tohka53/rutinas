#!/usr/bin/env python3
"""Genera src/app/data/nutricion.data.ts desde nutricion.json (sin transcribir a mano)."""
import json, unicodedata, pathlib

d = json.load(open('/home/claude/nutricion.json'))
OUT = pathlib.Path('/home/claude/rutina703/src/app/data/nutricion.data.ts')
OUT.parent.mkdir(parents=True, exist_ok=True)

ACENTOS = {
    'Media manana': 'Media mañana', 'Recuperacion (30 min post)': 'Recuperación (30 min post)',
    'Prediccion': 'Predicción',
}
FIX = {
    'Pechuga de pollo (cruda)': 'Pechuga de pollo (cruda)',
    'Muslo de pollo sin piel': 'Muslo de pollo sin piel',
    'Atun en agua (escurrido)': 'Atún en agua (escurrido)',
    'Frijol negro cocido': 'Frijol negro cocido',
    'Yogurt natural sin azucar': 'Yogurt natural sin azúcar',
    'Tortilla de maiz': 'Tortilla de maíz',
    'Pan frances': 'Pan francés',
    'Brocoli / ejote / repollo': 'Brócoli / ejote / repollo',
    'Avena en hojuelas (seca)': 'Avena en hojuelas (seca)',
}
def fix(s): return ACENTOS.get(s, FIX.get(s, s))
def q(s):   return json.dumps(fix(s), ensure_ascii=False)

L = []
w = L.append
w("// GENERADO por gen_data.py — no editar a mano.")
w("// Menús validados: cada tipo de día cae dentro de ±3% de su objetivo de kcal.\n")
w("export interface Alimento { nombre: string; kcal: number; p: number; c: number; g: number; tipo: string; costo: string; }")
w("export interface ItemComida { alimento: string; g: number; }")
w("export interface Comida { nombre: string; hora: string; items: ItemComida[]; kcal: number; p: number; c: number; g: number; }")
w("export interface TipoDia { kcal: number; p: number; c: number; g: number; }")
w("export interface PuntoPeso { semana: number; kg: number; lb: number; }\n")

a = d['antropometria']
w("export const ANTROPOMETRIA = {")
w(f"  pesoKg: {a['peso_kg']}, pesoLb: {a['peso_lb']}, alturaCm: {a['altura_cm']},")
w(f"  metaKg: {a['meta_kg']}, metaLb: {a['meta_lb']},")
w(f"  bmr: {a['bmr']}, baseSedentaria: {a['base_sedentaria']},")
w(f"  tdeePromedio: {d['tdee_promedio']}, kcalPromedioPlan: {d['kcal_promedio_plan']},")
w(f"  deficitDiario: {d['deficit_diario']}, perdidaKgSemanaModelo: {d['perdida_kg_semana']},")
w("} as const;\n")

w("export const TDEE_POR_DIA: Record<string, number> = {")
for k, v in d['tdee_por_dia'].items():
    w(f"  {k}: {v},")
w("};\n")

w("export const TIPOS_DIA: Record<string, TipoDia> = {")
for k, v in d['tipos_dia'].items():
    w(f"  {k}: {{ kcal: {v['kcal']}, p: {v['p']}, c: {v['c']}, g: {v['g']} }},")
w("};\n")

w("export const MENUS: Record<string, Comida[]> = {")
for tipo, comidas in d['menus'].items():
    w(f"  {tipo}: [")
    for c in comidas:
        items = ", ".join(f"{{ alimento: {q(i['alimento'])}, g: {i['g']} }}" for i in c['items'])
        w(f"    {{ nombre: {q(c['nombre'])}, hora: {q(c['hora'])}, kcal: {c['kcal']}, "
          f"p: {c['p']}, c: {c['c']}, g: {c['g']},")
        w(f"      items: [{items}] }},")
    w("  ],")
w("};\n")

w("export const ALIMENTOS: Alimento[] = [")
for al in d['alimentos']:
    w(f"  {{ nombre: {q(al['nombre'])}, kcal: {al['kcal']}, p: {al['p']}, c: {al['c']}, "
      f"g: {al['g']}, tipo: {q(al['tipo'])}, costo: {q(al['costo'])} }},")
w("];\n")

w("export const CURVA_PESO: PuntoPeso[] = [")
for p in d['curva_peso']:
    w(f"  {{ semana: {p['semana']}, kg: {p['kg']}, lb: {p['lb']} }},")
w("];\n")

pr = d['prediccion']
w("export const PREDICCION = {")
for carrera, seg in pr.items():
    partes = ", ".join(f"{k}: {q(v)}" for k, v in seg.items())
    w(f"  {carrera}: {{ {partes} }},")
w("} as const;")

OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print(f"escrito {OUT}  ({len(L)} lineas)")
