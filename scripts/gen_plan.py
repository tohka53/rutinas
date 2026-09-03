#!/usr/bin/env python3
"""Genera src/app/data/plan.data.ts — macrociclo de 26 semanas con fechas calculadas."""
import json, pathlib
from datetime import date, timedelta

INICIO = date(2026, 9, 7)          # lunes
assert INICIO.weekday() == 0, "el inicio debe caer en lunes"

# n, fase, foco, nadoM, biciKm, correKm, biciLarga, correLarga, nadoLargo, cfDias, descarga, carrera
S = [
 (1,"Base","Ajustar la bici y las primeras salidas en ruta",4500,55,14,"30 km Z2","8 km Z2","2000 m",5,0,None),
 (2,"Base","Test de FTP y subir la larga",5000,68,16,"40 km Z2","9 km Z2","2200 m",5,0,None),
 (3,"Base","Primer brick de verdad",5500,80,18,"50 km Z2 + 15' trote","10 km Z2","2400 m",5,0,None),
 (4,"Descarga","Bajar carga y medir",4000,60,13,"35 km suave","7 km Z2","2000 m",4,1,None),
 (5,"Build olímpico","Umbral en bici",5800,92,20,"60 km Z2 + 20' trote","11 km Z2","2500 m",4,0,None),
 (6,"Build olímpico","Simulacro parcial de olímpico",6000,105,22,"70 km Z2 + 20' trote","12 km Z2","2600 m",4,0,None),
 (7,"Build olímpico","Semana pico antes del olímpico",6200,118,24,"80 km Z2 + 25' trote","13 km Z2","2800 m",4,0,None),
 (8,"Descarga","Afinar y probar aguas abiertas",4500,78,16,"50 km + 15' trote","9 km Z2","2200 m (lago)",3,1,None),
 (9,"Pico","Semana de carrera: triatlón olímpico",3800,60,18,"Reconocimiento 25 km","CARRERA 10 km","1800 m",2,0,"olimpico"),
 (10,"Build 70.3","La salida clave: 90 km",5500,128,20,"90 km Z2 + 20' trote","10 km Z2","2600 m",3,0,None),
 (11,"Build 70.3","Última carga fuerte",5800,110,24,"70 km + 30' trote","14 km Z2","2800 m",3,0,None),
 (12,"Taper","Semana de carrera: Gran Jaguar 70.3",3000,55,12,"40 km suave","CARRERA 21.1 km","1500 m",2,1,"granjaguar"),
 (13,"Recuperación","Descanso activo tras el 70.3",3000,40,8,"25 km suave","5 km suave","1500 m",3,1,None),
 (14,"Recuperación","Volver de a poco",4000,55,12,"35 km Z2","7 km Z2","2000 m",4,0,None),
 (15,"Base invierno","Foco en peso y técnica",5000,70,16,"45 km Z2","9 km Z2","2400 m",5,0,None),
 (16,"Base invierno","Sostener el hábito",5000,70,16,"45 km Z2","9 km Z2","2400 m",5,0,None),
 (17,"Mantenimiento","Fiestas: no perder el motor",4000,55,13,"35 km Z2","8 km Z2","2000 m",4,1,None),
 (18,"Base invierno","Reiniciar el volumen",5500,85,18,"55 km Z2","10 km Z2","2500 m",5,0,None),
 (19,"Base invierno","Subir base aeróbica",5800,95,20,"60 km Z2","11 km Z2","2600 m",4,0,None),
 (20,"Descarga","Medir progreso",4500,70,15,"45 km Z2","8 km Z2","2200 m",4,1,None),
 (21,"Fuerza-resistencia","Bici en cuestas",6000,105,22,"70 km con cuestas","12 km Z2","2800 m",4,0,None),
 (22,"Fuerza-resistencia","Chequeo de peso: 111 kg",6200,115,24,"75 km + 20' trote","14 km Z2","2900 m",4,0,None),
 (23,"Build","Volumen alto",6500,125,26,"85 km + 25' trote","15 km Z2","3000 m",3,0,None),
 (24,"Descarga","Recuperar y evaluar",5000,80,17,"50 km Z2","10 km Z2","2400 m",4,1,None),
 (25,"Build","90 km que se sientan cómodos",6800,135,28,"90 km + 30' trote","16 km Z2","3000 m",3,0,None),
 (26,"Build","Meta de peso: 240 lb / 109 kg",7000,140,30,"95 km + 30' trote","18 km Z2","3200 m",3,0,"metapeso"),
]

curva = json.load(open('/home/claude/nutricion.json'))['curva_peso']
peso = {p['semana']: p for p in curva}

def esc(s): return json.dumps(s, ensure_ascii=False)

L = []; w = L.append
w("// GENERADO por gen_plan.py — no editar a mano.")
w("// Macrociclo de 26 semanas: 7 sep 2026 → 7 mar 2027.\n")
w("export type Disciplina = 'nado' | 'bici' | 'corre' | 'fuerza' | 'brick' | 'descanso';\n")
w("export interface Semana {")
w("  n: number; inicio: string; fin: string; fase: string; foco: string;")
w("  nadoM: number; biciKm: number; correKm: number; horas: number;")
w("  biciLarga: string; correLarga: string; nadoLargo: string;")
w("  crossfitDias: number; descarga: boolean; carrera: string | null;")
w("  pesoObjetivoKg: number; pesoObjetivoLb: number;")
w("}\n")
w("export const SEMANAS: Semana[] = [")
for (n, fase, foco, nado, bici, corre, bl, cl, nl, cf, dl, race) in S:
    ini = INICIO + timedelta(weeks=n-1)
    fin = ini + timedelta(days=6)
    # horas estimadas: nado 2:20/100m, bici 25 km/h, corre 7:45/km, crossfit 50 min
    h = nado/100*140/3600 + bici/25 + corre*(7*60+45)/3600 + cf*50/60
    p = peso[n]
    w(f"  {{ n: {n}, inicio: {esc(ini.isoformat())}, fin: {esc(fin.isoformat())}, "
      f"fase: {esc(fase)}, foco: {esc(foco)},")
    w(f"    nadoM: {nado}, biciKm: {bici}, correKm: {corre}, horas: {round(h,1)},")
    w(f"    biciLarga: {esc(bl)}, correLarga: {esc(cl)}, nadoLargo: {esc(nl)},")
    w(f"    crossfitDias: {cf}, descarga: {'true' if dl else 'false'}, "
      f"carrera: {esc(race) if race else 'null'},")
    w(f"    pesoObjetivoKg: {p['kg']}, pesoObjetivoLb: {p['lb']} }},")
w("];\n")
w(f"export const INICIO_PLAN = {esc(INICIO.isoformat())};")
w(f"export const FIN_PLAN = {esc((INICIO + timedelta(weeks=26) - timedelta(days=1)).isoformat())};")

out = pathlib.Path('/home/claude/rutina703/src/app/data/plan.data.ts')
out.write_text("\n".join(L) + "\n", encoding="utf-8")

# ---- verificacion de fechas clave ----
s9  = INICIO + timedelta(weeks=8)
s12 = INICIO + timedelta(weeks=11)
print("escrito", out)
print("S9  lunes:", s9,  "-> domingo", s9 + timedelta(days=6),  "(olímpico 8 nov)")
print("S12 lunes:", s12, "-> sábado",  s12 + timedelta(days=5), "(Gran Jaguar 28 nov)")
print("S26 lunes:", INICIO + timedelta(weeks=25))
assert (s9 + timedelta(days=6)) == date(2026,11,8),  "el olímpico debe caer en S9 domingo"
assert (s12 + timedelta(days=5)) == date(2026,11,28), "Gran Jaguar debe caer en S12 sábado"
print("OK: fechas de carrera verificadas")
horas = [n[3]/100*140/3600 + n[4]/25 + n[5]*(7*60+45)/3600 + n[9]*50/60 for n in S]
print(f"horas/semana: min {min(horas):.1f} h  max {max(horas):.1f} h  promedio {sum(horas)/len(horas):.1f} h")
print(f"bici: de {S[0][4]} km/sem a {max(n[4] for n in S)} km/sem")
print(f"nado: de {S[0][3]} m/sem a {max(n[3] for n in S)} m/sem")
