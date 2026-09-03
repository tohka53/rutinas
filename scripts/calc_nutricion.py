#!/usr/bin/env python3
"""Calcula y VALIDA el plan nutricional y la curva de peso de Miguel.
Los menus se ajustan automaticamente (solver sobre las porciones de carbohidrato)
hasta caer dentro de +-3% del objetivo de kcal. Salida: JSON para Angular.
"""
import json

# ---------------------------------------------------------------- antropometria
PESO_KG, ALTURA_CM, EDAD = 127.0, 195.0, 28
PESO_META_KG = 108.9     # 240 lb

def lb(kg): return kg * 2.20462
def bmr(kg): return 10 * kg + 6.25 * ALTURA_CM - 5 * EDAD + 5

BMR = bmr(PESO_KG)
FACTOR_NEAT = 1.28                      # programador sentado + caminatas regulares
BASE = BMR * FACTOR_NEAT

# Gasto por sesion calibrado contra los datos reales de Strava de Miguel,
# con descuento por sobreestimacion conocida de los medidores (sobre todo en HIIT).
GASTO = {"crossfit": 550, "nado_corto": 450, "nado_largo": 800,
         "spinning": 650, "bici_hora": 700, "correr_km": 124}
DESC_HIIT, DESC_ENDU = 0.65, 0.85       # HIIT se sobreestima mas que el aerobico

def dia(hiit=0, endu=0):
    return round(BASE + hiit * DESC_HIIT + endu * DESC_ENDU)

dias = {
    "lunes":     {"tipo": "medio",  "tdee": dia(GASTO["crossfit"], GASTO["nado_corto"])},
    "martes":    {"tipo": "fuerte", "tdee": dia(GASTO["crossfit"], GASTO["spinning"])},
    "miercoles": {"tipo": "medio",  "tdee": dia(GASTO["crossfit"], GASTO["nado_corto"])},
    "jueves":    {"tipo": "fuerte", "tdee": dia(GASTO["crossfit"], GASTO["spinning"] + 2*GASTO["correr_km"])},
    "viernes":   {"tipo": "ligero", "tdee": dia(GASTO["crossfit"], 5 * GASTO["correr_km"])},
    "sabado":    {"tipo": "fuerte", "tdee": dia(0, GASTO["nado_largo"])},
    "domingo":   {"tipo": "grande", "tdee": dia(0, 2.5*GASTO["bici_hora"] + 4*GASTO["correr_km"])},
}
tdee_prom = sum(d["tdee"] for d in dias.values()) / 7

# ------------------------------------------------------- objetivos por tipo de dia
TIPOS = {
    "ligero": {"kcal": 2400, "p": 215, "g": 78},
    "medio":  {"kcal": 2850, "p": 220, "g": 82},
    "fuerte": {"kcal": 3000, "p": 220, "g": 82},
    "grande": {"kcal": 3450, "p": 210, "g": 85},
}
for v in TIPOS.values():
    v["c"] = round((v["kcal"] - v["p"]*4 - v["g"]*9) / 4)
    v["check_kcal"] = v["p"]*4 + v["c"]*4 + v["g"]*9
    v["g_por_kg"] = round(v["g"] / PESO_KG, 2)
    v["p_por_kg_meta"] = round(v["p"] / PESO_META_KG, 2)

kcal_prom = sum(TIPOS[d["tipo"]]["kcal"] for d in dias.values()) / 7
deficit_dia = tdee_prom - kcal_prom
kg_semana = deficit_dia * 7 / 7700

# --------------------------------------------------------------- curva de peso
semanal = [1.0, .8, .8, .6, .8, .8, .8, .6, .8, .7, .7, .6, .5, .7,
           .8, .6, .4, .8, .7, .6, .7, .7, .7, .6, .7, .7]
curva, w = [], PESO_KG
for i, d in enumerate(semanal, 1):
    w -= d
    curva.append({"semana": i, "kg": round(w, 1), "lb": round(lb(w), 1)})

# ------------------------------------------------------------ base de alimentos
ALIMENTOS = [
    ("Pechuga de pollo (cruda)",      165, 31.0,  0.0,  3.6, "proteina", "medio"),
    ("Muslo de pollo sin piel",       175, 24.0,  0.0,  8.0, "proteina", "barato"),
    ("Huevo entero",                  143, 12.6,  0.7,  9.5, "proteina", "barato"),
    ("Clara de huevo",                 52, 11.0,  0.7,  0.2, "proteina", "barato"),
    ("Atun en agua (escurrido)",      116, 26.0,  0.0,  1.0, "proteina", "medio"),
    ("Frijol negro cocido",           132,  8.9, 23.7,  0.5, "mixto",    "barato"),
    ("Incaparina (polvo)",            370, 16.0, 65.0,  5.0, "mixto",    "barato"),
    ("Leche entera",                   61,  3.2,  4.8,  3.3, "mixto",    "barato"),
    ("Yogurt natural sin azucar",      61,  3.5,  4.7,  3.3, "mixto",    "medio"),
    ("Arroz blanco cocido",           130,  2.7, 28.2,  0.3, "carbo",    "barato"),
    ("Pasta cocida",                  158,  5.8, 30.9,  0.9, "carbo",    "barato"),
    ("Papa cocida",                    87,  2.0, 20.1,  0.1, "carbo",    "barato"),
    ("Camote cocido",                  90,  2.0, 20.7,  0.1, "carbo",    "barato"),
    ("Tortilla de maiz",              218,  5.7, 44.6,  2.5, "carbo",    "barato"),
    ("Avena en hojuelas (seca)",      379, 13.2, 67.7,  6.9, "carbo",    "barato"),
    ("Pan frances",                   277,  9.0, 53.0,  2.5, "carbo",    "barato"),
    ("Banano",                         89,  1.1, 22.8,  0.3, "carbo",    "barato"),
    ("Aceite vegetal",                884,  0.0,  0.0,100.0, "grasa",    "barato"),
    ("Aguacate",                      160,  2.0,  8.5, 14.7, "grasa",    "medio"),
    ("Brocoli / ejote / repollo",      34,  2.8,  6.6,  0.4, "verdura",  "barato"),
    ("Tomate / cebolla / pepino",      20,  0.9,  4.2,  0.2, "verdura",  "barato"),
]
IDX = {a[0]: a for a in ALIMENTOS}
FLEX = {"Arroz blanco cocido", "Pasta cocida", "Papa cocida", "Camote cocido",
        "Tortilla de maiz", "Avena en hojuelas (seca)", "Pan frances"}   # ajustables

def macros(items):
    t = {"kcal": 0.0, "p": 0.0, "c": 0.0, "g": 0.0}
    for nom, gr in items:
        a, f = IDX[nom], gr / 100.0
        t["kcal"] += a[1]*f; t["p"] += a[2]*f; t["c"] += a[3]*f; t["g"] += a[4]*f
    return t

def ajustar(menu_items, objetivo):
    """Escala solo las porciones flexibles (carbos) para clavar las kcal objetivo.
    Redondea a multiplos de 5 g y devuelve el menu ajustado."""
    fijos = [(n, g) for n, g in menu_items if n not in FLEX]
    flex  = [(n, g) for n, g in menu_items if n in FLEX]
    kcal_fijos = macros(fijos)["kcal"]
    kcal_flex_base = macros(flex)["kcal"]
    if kcal_flex_base == 0:
        return menu_items
    escala = (objetivo - kcal_fijos) / kcal_flex_base
    escala = max(0.25, min(2.5, escala))
    ajustado = []
    for n, g in menu_items:
        ajustado.append((n, max(10, round(g * escala / 5) * 5) if n in FLEX else g))
    return ajustado

def comida(nombre, hora, items):
    t = macros(items)
    return {"nombre": nombre, "hora": hora,
            "items": [{"alimento": n, "g": g} for n, g in items],
            "kcal": round(t["kcal"]), **{k: round(t[k], 1) for k in ("p", "c", "g")}}

# menus base (porciones aproximadas; el solver las ajusta)
BASE_MENUS = {
 "medio": [
  ("Desayuno", "06:00", [("Avena en hojuelas (seca)", 80), ("Leche entera", 250),
                         ("Huevo entero", 150), ("Banano", 120)]),
  ("Media manana", "09:30", [("Atun en agua (escurrido)", 80), ("Tortilla de maiz", 60)]),
  ("Almuerzo", "12:30", [("Pechuga de pollo (cruda)", 220), ("Arroz blanco cocido", 250),
                         ("Frijol negro cocido", 150), ("Brocoli / ejote / repollo", 150),
                         ("Aceite vegetal", 8)]),
  ("Pre-entreno", "16:00", [("Banano", 120), ("Tortilla de maiz", 60)]),
  ("Cena post-entreno", "20:00", [("Muslo de pollo sin piel", 200), ("Papa cocida", 350),
                                  ("Tomate / cebolla / pepino", 150), ("Aceite vegetal", 5)]),
  ("Antes de dormir", "22:00", [("Leche entera", 300), ("Avena en hojuelas (seca)", 30)]),
 ],
 "ligero": [
  ("Desayuno", "06:00", [("Huevo entero", 200), ("Avena en hojuelas (seca)", 50),
                         ("Leche entera", 200)]),
  ("Media manana", "09:30", [("Yogurt natural sin azucar", 200), ("Banano", 120)]),
  ("Almuerzo", "12:30", [("Pechuga de pollo (cruda)", 250), ("Arroz blanco cocido", 180),
                         ("Frijol negro cocido", 120), ("Brocoli / ejote / repollo", 200),
                         ("Aceite vegetal", 8)]),
  ("Merienda", "16:00", [("Atun en agua (escurrido)", 80), ("Tomate / cebolla / pepino", 150)]),
  ("Cena", "20:00", [("Muslo de pollo sin piel", 200), ("Papa cocida", 250),
                     ("Brocoli / ejote / repollo", 200), ("Aceite vegetal", 6)]),
  ("Antes de dormir", "22:00", [("Leche entera", 250)]),
 ],
 "fuerte": [
  ("Desayuno", "06:00", [("Avena en hojuelas (seca)", 90), ("Leche entera", 300),
                         ("Huevo entero", 150), ("Banano", 120)]),
  ("Media manana", "09:30", [("Atun en agua (escurrido)", 80), ("Tortilla de maiz", 90)]),
  ("Almuerzo", "12:30", [("Pechuga de pollo (cruda)", 220), ("Arroz blanco cocido", 300),
                         ("Frijol negro cocido", 150), ("Brocoli / ejote / repollo", 150),
                         ("Aceite vegetal", 8)]),
  ("Pre-entreno", "16:00", [("Banano", 120), ("Pan frances", 60)]),
  ("Cena post-entreno", "20:00", [("Muslo de pollo sin piel", 200), ("Pasta cocida", 300),
                                  ("Tomate / cebolla / pepino", 150), ("Aceite vegetal", 5)]),
  ("Antes de dormir", "22:00", [("Leche entera", 300), ("Avena en hojuelas (seca)", 30)]),
 ],
 "grande": [
  ("Desayuno pre-bici", "05:30", [("Avena en hojuelas (seca)", 100), ("Leche entera", 300),
                                  ("Banano", 120), ("Huevo entero", 100)]),
  ("Durante la bici (por hora)", "en ruta", [("Banano", 120), ("Pan frances", 50)]),
  ("Recuperacion (30 min post)", "11:00", [("Leche entera", 400), ("Avena en hojuelas (seca)", 60),
                                           ("Banano", 120)]),
  ("Almuerzo", "13:30", [("Pechuga de pollo (cruda)", 220), ("Arroz blanco cocido", 350),
                         ("Frijol negro cocido", 150), ("Aceite vegetal", 8)]),
  ("Merienda", "17:00", [("Tortilla de maiz", 90), ("Atun en agua (escurrido)", 80),
                         ("Aguacate", 60)]),
  ("Cena", "20:00", [("Muslo de pollo sin piel", 200), ("Pasta cocida", 350),
                     ("Brocoli / ejote / repollo", 150), ("Aceite vegetal", 5)]),
 ],
}

# --- solver: reparte el objetivo diario entre comidas y ajusta cada una ---
MENUS, validacion = {}, {}
for tipo, comidas in BASE_MENUS.items():
    obj_dia = TIPOS[tipo]["kcal"]
    kcal_base = [macros(it)["kcal"] for _, _, it in comidas]
    total_base = sum(kcal_base)
    hechas = []
    for (nom, hora, items), kb in zip(comidas, kcal_base):
        obj_comida = obj_dia * kb / total_base          # reparto proporcional
        hechas.append(comida(nom, hora, ajustar(items, obj_comida)))
    MENUS[tipo] = hechas
    t = {k: round(sum(m[k] for m in hechas), 1) for k in ("kcal", "p", "c", "g")}
    t["kcal"] = round(t["kcal"])
    o = TIPOS[tipo]
    t["objetivo"] = {"kcal": o["kcal"], "p": o["p"], "c": o["c"], "g": o["g"]}
    t["desvio_kcal"] = t["kcal"] - o["kcal"]
    t["desvio_pct"] = round(100 * t["desvio_kcal"] / o["kcal"], 1)
    t["ok"] = abs(t["desvio_pct"]) <= 3.0
    validacion[tipo] = t

# ------------------------------------------------------------------- prediccion
def hms(s): return f"{int(s//3600)}:{int(s%3600//60):02d}:{int(s%60):02d}"

NADO_S100 = 140                     # 2:20/100m sostenido (Strava: 2600m@2:14, 3500m@2:12)
olimpico = {"nado": 1500/100*NADO_S100, "t1": 240, "bici": 40/26.0*3600,
            "t2": 180, "corre": 10*(7*60+15)}
olimpico["total"] = sum(olimpico.values())
half = {"nado": 1900/100*NADO_S100, "t1": 360, "bici": 90/25.0*3600,
        "t2": 300, "corre": 21.1*(8*60+30)}
half["total"] = sum(half.values())

out = {
 "antropometria": {"peso_kg": PESO_KG, "peso_lb": round(lb(PESO_KG),1), "altura_cm": ALTURA_CM,
                   "meta_kg": PESO_META_KG, "meta_lb": round(lb(PESO_META_KG),1),
                   "bmr": round(BMR), "base_sedentaria": round(BASE)},
 "tdee_por_dia": {k: v["tdee"] for k, v in dias.items()},
 "tdee_promedio": round(tdee_prom), "kcal_promedio_plan": round(kcal_prom),
 "deficit_diario": round(deficit_dia), "perdida_kg_semana": round(kg_semana, 2),
 "tipos_dia": TIPOS, "curva_peso": curva, "peso_final": curva[-1],
 "menus": MENUS, "validacion_menus": validacion,
 "alimentos": [{"nombre": a[0], "kcal": a[1], "p": a[2], "c": a[3], "g": a[4],
                "tipo": a[5], "costo": a[6]} for a in ALIMENTOS],
 "prediccion": {"olimpico": {k: hms(v) for k, v in olimpico.items()},
                "half": {k: hms(v) for k, v in half.items()}},
}
print(json.dumps(out, indent=1, ensure_ascii=False))
