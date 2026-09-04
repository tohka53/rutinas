#!/usr/bin/env python3
"""Genera plan.data.ts — macrociclo de 60 semanas con tres picos de 70.3.

Anclas duras (fechas confirmadas):
  S9  dom  8 nov 2026 — triatlon olimpico
  S22 dom  7 feb 2027 — IRONMAN 70.3 El Salvador
Ventanas (fecha tipica del evento, se ajusta cuando se publique):
  S32 ~dom 18 abr 2027 — 70.3 #2 (Monterrey, mediados de abril)
  S59 ~dom 24 oct 2027 — 70.3 #3 (Miami, finales de octubre)
"""
import json, pathlib, re
from datetime import date, timedelta

INICIO = date(2026, 9, 7)
assert INICIO.weekday() == 0

# n, fase, foco, nadoM, biciKm, correKm, biciLarga, correLarga, nadoLargo, cf, descarga, carrera
S = [
 # ---------------- BLOQUE 1: base, meter la bici en serio (S1-S4)
 (1,"Base","Ajustar la bici y volver a rodar en ruta",4500,55,14,"30 km Z2","8 km Z2","2000 m",5,0,None),
 (2,"Base","Test de FTP y primera salida larga",5000,68,16,"40 km Z2","9 km Z2","2200 m",5,0,None),
 (3,"Base","Primer brick de verdad",5500,80,18,"50 km Z2 + 15' trote","10 km Z2","2400 m",5,0,None),
 (4,"Descarga","Bajar carga y medir",4000,60,13,"35 km suave","7 km Z2","2000 m",4,1,None),
 # ---------------- BLOQUE 2: build olimpico (S5-S8)
 (5,"Build olímpico","Umbral en bici",5800,92,20,"60 km Z2 + 20' trote","11 km Z2","2500 m",4,0,None),
 (6,"Build olímpico","Simulacro parcial de olímpico",6000,105,22,"70 km Z2 + 20' trote","12 km Z2","2600 m",4,0,None),
 (7,"Build olímpico","Semana pico antes del olímpico",6200,118,24,"80 km Z2 + 25' trote","13 km Z2","2800 m",4,0,None),
 (8,"Descarga","Afinar y probar aguas abiertas",4500,78,16,"50 km + 15' trote","9 km Z2","2200 m (lago)",3,1,None),
 # ---------------- BLOQUE 3: pico olimpico (S9)
 (9,"Pico","Semana de carrera: triatlón olímpico",3800,60,18,"Reconocimiento 25 km","CARRERA 10 km","1800 m",2,0,"olimpico"),
 # ---------------- BLOQUE 4: transicion (S10-S11)
 (10,"Transición","Recuperar del olímpico, sin prisa",3500,50,10,"30 km suave","6 km suave","1800 m",3,1,None),
 (11,"Transición","Volver al ritmo, arranca el camino al 70.3",4500,70,14,"45 km Z2","8 km Z2","2200 m",4,0,None),
 # ---------------- BLOQUE 5: base 70.3, aca se gana la bici (S12-S16)
 (12,"Base 70.3","Subir la larga sin subir la intensidad",5200,88,17,"55 km Z2","10 km Z2","2400 m",4,0,None),
 (13,"Base 70.3","Primera salida de 70 km",5500,100,19,"70 km Z2 + 15' trote","11 km Z2","2500 m",4,0,None),
 (14,"Descarga","Semana ligera antes de las largas",4200,70,15,"45 km Z2","8 km Z2","2200 m",4,1,None),
 (15,"Base 70.3","Volumen sostenido",5800,112,21,"80 km Z2 + 20' trote","12 km Z2","2600 m",5,0,None),
 (16,"Mantenimiento","Fiestas: no perder el motor",4500,80,16,"55 km Z2","9 km Z2","2200 m",4,1,None),
 # ---------------- BLOQUE 6: build 70.3 #1 (S17-S20)
 (17,"Build 70.3","Reiniciar fuerte, la clave son los 90",6000,125,23,"85 km + 25' trote","13 km Z2","2800 m",4,0,None),
 (18,"Build 70.3","La salida de 90 km",6200,138,25,"90 km + 30' trote","14 km Z2","2900 m",4,0,None),
 (19,"Descarga","Recuperar antes del pico",4800,85,17,"55 km Z2","10 km Z2","2400 m",4,1,None),
 (20,"Build 70.3","Semana pico: simulacro completo",6500,145,27,"95 km + 30' trote","16 km Z2","3000 m",3,0,None),
 # ---------------- BLOQUE 7: mini-taper + olimpico en El Salvador (S21-S22)
 # Un olimpico no justifica taper de dos semanas ni frena el build de la bici:
 # se afila una semana y se sigue construyendo hacia abril.
 (21,"Afinar","Bajar la intensidad, mantener la bici larga",5000,105,19,"70 km Z2","10 km Z2","2500 m",3,1,None),
 (22,"Carrera","Semana de carrera: olímpico en El Salvador",3500,60,14,"25 km suave","CARRERA 10 km","1800 m",1,1,"elsalvador"),
 # ---------------- BLOQUE 8: retomar (S23-S24) — un olimpico se recupera rapido
 (23,"Transición","Recuperar del olímpico sin perder la base",4500,85,15,"55 km Z2","9 km Z2","2200 m",3,1,None),
 (24,"Build 70.3","Retomar la larga donde quedó",5800,115,21,"80 km Z2 + 20' trote","12 km Z2","2600 m",4,0,None),
 # ---------------- BLOQUE 9: build al PRIMER 70.3 completo (S25-S31)
 (25,"Build 70.3","La primera de 90 km",6200,130,23,"90 km Z2 + 20' trote","13 km Z2","2800 m",4,0,None),
 (26,"Descarga","Absorber la primera larga de verdad",4800,90,18,"55 km Z2","10 km Z2","2400 m",4,1,None),
 (27,"Build 70.3","Ritmo de carrera sobre la larga",6500,140,25,"95 km con 2×20' a ritmo","14 km Z2","2900 m",4,0,None),
 (28,"Build 70.3","Simulacro: 90 km + 40' corriendo",6800,150,28,"90 km + 40' trote a ritmo","16 km Z2","3000 m",3,0,None),
 (29,"Descarga","Recuperar antes del pico",5000,95,19,"60 km Z2","11 km Z2","2500 m",4,1,None),
 (30,"Build 70.3","Semana pico del bloque",7000,160,30,"105 km + 30' trote","18 km Z2","3100 m",3,0,None),
 (31,"Taper","Afilar de verdad: esta sí es la grande",4500,85,17,"55 km con 3×10' a ritmo","9 km Z2","2300 m",2,1,None),
 # ---------------- BLOQUE 10: PRIMER 70.3 (S32)
 (32,"Carrera","Semana de carrera: primer 70.3 completo",2800,50,10,"30 km suave","CARRERA 21.1 km","1500 m",1,1,"segundo703"),
 # ---------------- BLOQUE 11: off-season, corregir debilidades (S33-S40)
 (33,"Off-season","Descanso real. El cuerpo cobra lo del bloque",2000,25,5,"20 km suave","4 km suave","1200 m",2,1,None),
 (34,"Off-season","Fuerza en gimnasio, poco volumen",3000,40,8,"30 km suave","6 km Z2","1500 m",4,1,None),
 (35,"Off-season","Técnica de nado y fuerza",4000,55,11,"40 km Z2","8 km Z2","2000 m",5,0,None),
 (36,"Off-season","Trabajo de fuerza específica en bici",4500,70,13,"45 km con cuestas","9 km Z2","2200 m",5,0,None),
 (37,"Off-season","Corregir lo que falló en las dos carreras",4800,80,15,"50 km con cuestas","10 km Z2","2300 m",5,0,None),
 (38,"Descarga","Semana ligera",3800,60,12,"40 km Z2","8 km Z2","1900 m",4,1,None),
 (39,"Off-season","Subir de nuevo, sin prisa",5000,90,17,"55 km Z2","11 km Z2","2400 m",5,0,None),
 (40,"Off-season","Cerrar el bloque de fuerza",5200,100,19,"65 km con cuestas","12 km Z2","2500 m",4,0,None),
 # ---------------- BLOQUE 12: base de verano, el volumen grande (S41-S50)
 (41,"Base verano","Arranca la base larga del año",5500,105,20,"70 km Z2","12 km Z2","2600 m",4,0,None),
 (42,"Base verano","Volumen aeróbico puro",5800,115,22,"75 km Z2","13 km Z2","2700 m",4,0,None),
 (43,"Descarga","Absorber",4500,85,17,"55 km Z2","10 km Z2","2300 m",4,1,None),
 (44,"Base verano","Subir la larga",6000,125,24,"85 km Z2","14 km Z2","2800 m",4,0,None),
 (45,"Base verano","Primera de 95 km del bloque",6200,135,26,"95 km Z2 + 20' trote","15 km Z2","2900 m",4,0,None),
 (46,"Descarga","Bajar y medir",4800,90,18,"60 km Z2","11 km Z2","2400 m",4,1,None),
 (47,"Base verano","Volumen alto sostenido",6500,145,28,"100 km Z2 + 25' trote","16 km Z2","3000 m",3,0,None),
 (48,"Base verano","Semana grande de base",6800,155,30,"105 km Z2 + 25' trote","18 km Z2","3100 m",3,0,None),
 (49,"Descarga","Cierre del bloque de base",5000,95,19,"60 km Z2","11 km Z2","2500 m",4,1,None),
 (50,"Base verano","Puente al build final",6000,125,24,"85 km Z2 + 20' trote","14 km Z2","2800 m",4,0,None),
 # ---------------- BLOQUE 13: build final, el pico del año (S51-S57)
 (51,"Build final","Ritmo de carrera, ya con base grande",6500,140,27,"90 km con 2×25' a ritmo","15 km Z2","3000 m",3,0,None),
 (52,"Build final","Intensidad en bici y carrera",6800,150,29,"100 km con 3×20' a ritmo","17 km Z2","3100 m",3,0,None),
 (53,"Descarga","Recuperar para el pico",5200,100,20,"65 km Z2","12 km Z2","2600 m",4,1,None),
 (54,"Build final","Simulacro de carrera",7000,160,31,"105 km + 30' a ritmo","18 km Z2","3200 m",3,0,None),
 (55,"Build final","Semana pico del año",7200,170,33,"110 km + 30' a ritmo","20 km Z2","3300 m",3,0,None),
 (56,"Descarga","Empezar a bajar",5500,110,22,"70 km Z2","13 km Z2","2700 m",3,1,None),
 (57,"Build final","Último estímulo fuerte",6500,140,27,"90 km con 2×20' a ritmo","15 km Z2","3000 m",3,0,None),
 # ---------------- BLOQUE 14: taper + 70.3 #3 (S58-S59)
 (58,"Taper","Bajar volumen, mantener frecuencia",4500,90,18,"55 km con 3×10' a ritmo","10 km Z2","2400 m",2,1,None),
 (59,"Carrera","Semana de carrera: 70.3 #3",2800,50,10,"30 km suave","CARRERA 21.1 km","1500 m",1,1,"tercero703"),
 # ---------------- cierre
 (60,"Transición","Fin de temporada. Descanso y balance",2000,25,5,"lo que te pida el cuerpo","suave","1200 m",2,1,None),
]

# Curva de peso: 127 kg al inicio. La meta de 240 lb (108.9 kg) cae cerca de
# El Salvador y se consolida en el bloque de abril. Despues se sostiene: bajar
# durante un bloque de volumen alto cuesta sesiones.
# ---------------------------------------------------------------------------
#  Recalibracion del 4 sep 2026, contra datos reales
#
#  NADO. La tabla de arriba salio de un diagnostico conservador. El historial de
#  Strava dice otra cosa: sesiones de 4,000 / 3,525 / 3,500 m y semanas de
#  7,150 / 6,700 / 5,100 m. Una larga de 2,000 m en S1 esta por debajo de lo que
#  Miguel ya hace un sabado cualquiera — lo dijo el mismo: "2k se siente muy
#  poco". Se sube el piso 1,000 m en semanas de carga y 600 en descarga. Las
#  semanas de carrera NO se tocan: el sabado previo a competir es afinar, no
#  acumular. Techo 4,200 m, apenas por encima de su mejor sesion registrada.
#
#  El resto de la semana lo cargan lunes y miercoles, que estan limitados a
#  45 min. A ~2:15/100 m con descansos ahi caben unos 1,700 m: ese es el tope.
#
#  BICI. Una clase de spinning son ~18 km, no los 12.5 que salian de repartir el
#  total. Con dos clases por semana son 36 km fijos, asi que el total semanal es
#  la larga + 36. Sube las semanas iniciales (S1: 55 → 66, kilometros que ya
#  estaba haciendo y no se contaban) y baja las finales (S55: 170 → 146, que
#  pedian un tercer dia de bici que su agenda no tiene). Las semanas de carrera
#  quedan como estaban: ahi el volumen lo manda la competencia.
# ---------------------------------------------------------------------------
SPINNING_KM = 18      # por clase, aproximado (dato de Miguel)
CLASES = 2            # martes y jueves
TECHO_NADO = 4200     # su mejor sesion registrada es 4,000 m
TOPE_MEDIA = 1700     # lo que cabe en los 45 min de lunes y miercoles

def _num(s):
    m = re.search(r'(\d+(?:\.\d+)?)', s or '')
    return float(m.group(1)) if m else None

_R = []
for (n, fase, foco, nado, bici, corre, bl, cl, nl, cf, dl, race) in S:
    largo = _num(nl)
    if race:
        largo2, nado2 = largo, nado
    else:
        largo2 = min(TECHO_NADO, largo + (600 if dl else 1000))
        media = min(TOPE_MEDIA, (nado - largo) / 2)
        nado2 = int(round((largo2 + 2 * media) / 100) * 100)
    nl2 = nl.replace(str(int(largo)), str(int(largo2)), 1)

    larga_km = _num(bl)
    bici2 = bici if (race or larga_km is None) else int(larga_km) + SPINNING_KM * CLASES

    _R.append((n, fase, foco, nado2, bici2, corre, bl, cl, nl2, cf, dl, race))
S = _R


PESOS = {
 1:126.0, 2:125.2, 3:124.4, 4:123.8, 5:123.0, 6:122.2, 7:121.4, 8:120.8, 9:120.0,
 10:119.5, 11:118.9, 12:118.2, 13:117.5, 14:117.0, 15:116.3, 16:116.0,
 17:115.2, 18:114.5, 19:113.9, 20:113.2, 21:112.6, 22:112.0,
 23:111.6, 24:111.0, 25:110.4, 26:109.8, 27:109.3, 28:108.7, 29:108.1, 30:107.6,
 31:107.2, 32:107.0,
 33:107.0, 34:106.8, 35:106.5, 36:106.2, 37:105.9, 38:105.7, 39:105.4, 40:105.1,
 41:104.9, 42:104.6, 43:104.4, 44:104.2, 45:104.0, 46:103.8, 47:103.6, 48:103.4,
 49:103.2, 50:103.0,
 51:102.8, 52:102.6, 53:102.5, 54:102.3, 55:102.1, 56:102.0, 57:101.8,
 58:101.6, 59:101.5, 60:101.5,
}

def lb(kg): return round(kg * 2.20462, 1)
def esc(s): return json.dumps(s, ensure_ascii=False)

L = []; w = L.append
w("// GENERADO por gen_plan.py — no editar a mano.")
w("// Macrociclo de 60 semanas: 7 sep 2026 → 31 oct 2027. Tres picos de 70.3.")
w("// Nado y bici recalibrados el 4 sep 2026 (ver la cabecera del generador).\n")
w("export type Disciplina = 'nado' | 'bici' | 'corre' | 'fuerza' | 'brick' | 'descanso';\n")
w("export interface Semana {")
w("  n: number; inicio: string; fin: string; fase: string; foco: string;")
w("  nadoM: number; biciKm: number; correKm: number; horas: number;")
w("  biciLarga: string; correLarga: string; nadoLargo: string;")
w("  crossfitDias: number; descarga: boolean; carrera: string | null;")
w("  pesoObjetivoKg: number; pesoObjetivoLb: number; bloque: string;")
w("}\n")

BLOQUES = [
 (1,4,"1 · Base"), (5,8,"2 · Build olímpico"), (9,9,"3 · Olímpico #1"),
 (10,11,"4 · Transición"), (12,16,"5 · Base 70.3"), (17,20,"6 · Build de bici"),
 (21,22,"7 · Olímpico #2 (El Salvador)"), (23,24,"8 · Retomar"),
 (25,31,"9 · Build al primer 70.3"), (32,32,"10 · Primer 70.3"),
 (33,40,"11 · Off-season"), (41,50,"12 · Base de verano"),
 (51,57,"13 · Build final"), (58,59,"14 · 70.3 #2"), (60,60,"15 · Fin de temporada"),
]
def bloque_de(n):
    for a, b, nom in BLOQUES:
        if a <= n <= b: return nom
    return "—"

w("export const SEMANAS: Semana[] = [")
horas_todas = []
for (n, fase, foco, nado, bici, corre, bl, cl, nl, cf, dl, race) in S:
    ini = INICIO + timedelta(weeks=n-1)
    fin = ini + timedelta(days=6)
    # El spinning son dos clases de una hora; lo que sobra son kilometros de
    # ruta a ~25 km/h. Contar los 36 km indoor a 25 km/h subestimaba el tiempo.
    ruta = max(0, bici - CLASES * SPINNING_KM)
    h = nado/100*140/3600 + ruta/25 + CLASES + corre*(7*60+45)/3600 + cf*50/60
    horas_todas.append(h)
    kg = PESOS[n]
    w(f"  {{ n: {n}, inicio: {esc(ini.isoformat())}, fin: {esc(fin.isoformat())}, "
      f"fase: {esc(fase)}, foco: {esc(foco)},")
    w(f"    nadoM: {nado}, biciKm: {bici}, correKm: {corre}, horas: {round(h,1)},")
    w(f"    biciLarga: {esc(bl)}, correLarga: {esc(cl)}, nadoLargo: {esc(nl)},")
    w(f"    crossfitDias: {cf}, descarga: {'true' if dl else 'false'}, "
      f"carrera: {esc(race) if race else 'null'},")
    w(f"    pesoObjetivoKg: {kg}, pesoObjetivoLb: {lb(kg)}, bloque: {esc(bloque_de(n))} }},")
w("];\n")
w(f"export const INICIO_PLAN = {esc(INICIO.isoformat())};")
w(f"export const FIN_PLAN = {esc((INICIO + timedelta(weeks=60) - timedelta(days=1)).isoformat())};")
w("\nexport const BLOQUES = [")
for a, b, nom in BLOQUES:
    w(f"  {{ desde: {a}, hasta: {b}, nombre: {esc(nom)} }},")
w("];")

out = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'app' / 'data' / 'plan.data.ts'
out.write_text("\n".join(L) + "\n", encoding="utf-8")

# ------------------------------------------------------------- verificaciones
def dom(n): return INICIO + timedelta(weeks=n-1, days=6)
anclas = {9: date(2026,11,8), 22: date(2027,2,7), 32: date(2027,4,18), 59: date(2027,10,24)}
print("escrito", out)
for n, esperado in anclas.items():
    real = dom(n)
    print(f"  S{n:2d} domingo {real}  (esperado {esperado})  {'OK' if real == esperado else 'DESFASE'}")
    assert real == esperado, f"S{n} no cae en la fecha ancla"

carreras = [(n, r) for (n,_,_,_,_,_,_,_,_,_,_,r) in S if r]
print("\ncarreras:", carreras)
assert [n for n,_ in carreras] == [9,22,32,59], "las carreras no caen en las semanas ancla"
assert len(S) == 60 and [x[0] for x in S] == list(range(1,61)), "faltan semanas"

print(f"\nhoras/semana: min {min(horas_todas):.1f}  max {max(horas_todas):.1f}  "
      f"promedio {sum(horas_todas)/len(horas_todas):.1f}")
print(f"bici: {S[0][4]} → {max(x[4] for x in S)} km/sem")
print(f"nado: {S[0][3]} → {max(x[3] for x in S)} m/sem")
print(f"corre: {S[0][5]} → {max(x[5] for x in S)} km/sem")
print(f"peso: 127.0 kg → {PESOS[22]} kg (El Salvador) → {PESOS[32]} kg (abril) → {PESOS[59]} kg (final)")
print(f"       en libras: 280 → {lb(PESOS[22])} → {lb(PESOS[32])} → {lb(PESOS[59])}")

# semanas de descarga: deberia haber una cada 3-4 semanas de carga
seguidas, peor = 0, 0
for x in S:
    seguidas = 0 if x[10] else seguidas + 1
    peor = max(peor, seguidas)
print(f"\nmáximo de semanas de carga seguidas sin descarga: {peor}")
assert peor <= 4, "hay demasiadas semanas de carga seguidas"
print("OK: estructura de descargas correcta")

# La recalibracion tiene que haber hecho lo que dice
s1 = S[0]
assert s1[8] == "3000 m", f"S1 deberia pedir 3,000 m de nado largo, pide {s1[8]}"
assert s1[4] == 30 + SPINNING_KM * CLASES, f"S1 bici deberia ser 66, es {s1[4]}"
assert max(_num(x[8]) for x in S) <= TECHO_NADO, "alguna larga se paso del techo"
for x in S:
    if x[11]: continue
    lk = _num(x[6])
    if lk is not None:
        assert x[4] == int(lk) + SPINNING_KM * CLASES, f"S{x[0]}: bici no cuadra con larga + spinning"
print("OK: recalibracion de nado y bici aplicada")
