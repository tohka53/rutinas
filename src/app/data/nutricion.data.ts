// GENERADO por gen_data.py — no editar a mano.
// Menús validados: cada tipo de día cae dentro de ±3% de su objetivo de kcal.

export interface Alimento { nombre: string; kcal: number; p: number; c: number; g: number; tipo: string; costo: string; }
export interface ItemComida { alimento: string; g: number; }
export interface Comida { nombre: string; hora: string; items: ItemComida[]; kcal: number; p: number; c: number; g: number; }
export interface TipoDia { kcal: number; p: number; c: number; g: number; }
export interface PuntoPeso { semana: number; kg: number; lb: number; }

export const ANTROPOMETRIA = {
  pesoKg: 127.0, pesoLb: 280.0, alturaCm: 195.0,
  metaKg: 108.9, metaLb: 240.1,
  bmr: 2354, baseSedentaria: 3013,
  tdeePromedio: 4011, kcalPromedioPlan: 2936,
  deficitDiario: 1075, perdidaKgSemanaModelo: 0.98,
} as const;

export const TDEE_POR_DIA: Record<string, number> = {
  lunes: 3753,
  martes: 3923,
  miercoles: 3753,
  jueves: 4134,
  viernes: 3897,
  sabado: 3693,
  domingo: 4922,
};

export const TIPOS_DIA: Record<string, TipoDia> = {
  ligero: { kcal: 2400, p: 215, c: 210, g: 78 },
  medio: { kcal: 2850, p: 220, c: 308, g: 82 },
  fuerte: { kcal: 3000, p: 220, c: 346, g: 82 },
  grande: { kcal: 3450, p: 210, c: 461, g: 85 },
};

export const MENUS: Record<string, Comida[]> = {
  medio: [
    { nombre: "Desayuno", hora: "06:00", kcal: 682, p: 35.5, c: 77.6, g: 26.7,
      items: [{ alimento: "Avena en hojuelas (seca)", g: 55 }, { alimento: "Leche entera", g: 250 }, { alimento: "Huevo entero", g: 150 }, { alimento: "Banano", g: 120 }] },
    { nombre: "Media mañana", hora: "09:30", kcal: 191, p: 23.4, c: 20.1, g: 1.9,
      items: [{ alimento: "Atún en agua (escurrido)", g: 80 }, { alimento: "Tortilla de maíz", g: 45 }] },
    { nombre: "Almuerzo", hora: "12:30", kcal: 878, p: 89.8, c: 87.8, g: 17.7,
      items: [{ alimento: "Pechuga de pollo (cruda)", g: 220 }, { alimento: "Arroz blanco cocido", g: 150 }, { alimento: "Frijol negro cocido", g: 150 }, { alimento: "Brócoli / ejote / repollo", g: 150 }, { alimento: "Aceite vegetal", g: 8 }] },
    { nombre: "Pre-entreno", hora: "16:00", kcal: 205, p: 3.9, c: 47.4, g: 1.5,
      items: [{ alimento: "Banano", g: 120 }, { alimento: "Tortilla de maíz", g: 45 }] },
    { nombre: "Cena post-entreno", hora: "20:00", kcal: 633, p: 54.1, c: 54.5, g: 21.5,
      items: [{ alimento: "Muslo de pollo sin piel", g: 200 }, { alimento: "Papa cocida", g: 240 }, { alimento: "Tomate / cebolla / pepino", g: 150 }, { alimento: "Aceite vegetal", g: 5 }] },
    { nombre: "Antes de dormir", hora: "22:00", kcal: 259, p: 12.2, c: 27.9, g: 11.3,
      items: [{ alimento: "Leche entera", g: 300 }, { alimento: "Avena en hojuelas (seca)", g: 20 }] },
  ],
  ligero: [
    { nombre: "Desayuno", hora: "06:00", kcal: 522, p: 35.6, c: 31.3, g: 27.7,
      items: [{ alimento: "Huevo entero", g: 200 }, { alimento: "Avena en hojuelas (seca)", g: 30 }, { alimento: "Leche entera", g: 200 }] },
    { nombre: "Media mañana", hora: "09:30", kcal: 229, p: 8.3, c: 36.8, g: 7.0,
      items: [{ alimento: "Yogurt natural sin azúcar", g: 200 }, { alimento: "Banano", g: 120 }] },
    { nombre: "Almuerzo", hora: "12:30", kcal: 827, p: 96.2, c: 67.0, g: 18.7,
      items: [{ alimento: "Pechuga de pollo (cruda)", g: 250 }, { alimento: "Arroz blanco cocido", g: 90 }, { alimento: "Frijol negro cocido", g: 120 }, { alimento: "Brócoli / ejote / repollo", g: 200 }, { alimento: "Aceite vegetal", g: 8 }] },
    { nombre: "Merienda", hora: "16:00", kcal: 123, p: 22.2, c: 6.3, g: 1.1,
      items: [{ alimento: "Atún en agua (escurrido)", g: 80 }, { alimento: "Tomate / cebolla / pepino", g: 150 }] },
    { nombre: "Cena", hora: "20:00", kcal: 606, p: 56.7, c: 44.4, g: 23.0,
      items: [{ alimento: "Muslo de pollo sin piel", g: 200 }, { alimento: "Papa cocida", g: 155 }, { alimento: "Brócoli / ejote / repollo", g: 200 }, { alimento: "Aceite vegetal", g: 6 }] },
    { nombre: "Antes de dormir", hora: "22:00", kcal: 152, p: 8.0, c: 12.0, g: 8.2,
      items: [{ alimento: "Leche entera", g: 250 }] },
  ],
  fuerte: [
    { nombre: "Desayuno", hora: "06:00", kcal: 694, p: 36.4, c: 76.7, g: 28.0,
      items: [{ alimento: "Avena en hojuelas (seca)", g: 50 }, { alimento: "Leche entera", g: 300 }, { alimento: "Huevo entero", g: 150 }, { alimento: "Banano", g: 120 }] },
    { nombre: "Media mañana", hora: "09:30", kcal: 235, p: 24.5, c: 29.0, g: 2.4,
      items: [{ alimento: "Atún en agua (escurrido)", g: 80 }, { alimento: "Tortilla de maíz", g: 65 }] },
    { nombre: "Almuerzo", hora: "12:30", kcal: 878, p: 89.8, c: 87.8, g: 17.7,
      items: [{ alimento: "Pechuga de pollo (cruda)", g: 220 }, { alimento: "Arroz blanco cocido", g: 150 }, { alimento: "Frijol negro cocido", g: 150 }, { alimento: "Brócoli / ejote / repollo", g: 150 }, { alimento: "Aceite vegetal", g: 8 }] },
    { nombre: "Pre-entreno", hora: "16:00", kcal: 218, p: 4.9, c: 48.6, g: 1.4,
      items: [{ alimento: "Banano", g: 120 }, { alimento: "Pan francés", g: 40 }] },
    { nombre: "Cena post-entreno", hora: "20:00", kcal: 732, p: 60.7, c: 66.6, g: 23.1,
      items: [{ alimento: "Muslo de pollo sin piel", g: 200 }, { alimento: "Pasta cocida", g: 195 }, { alimento: "Tomate / cebolla / pepino", g: 150 }, { alimento: "Aceite vegetal", g: 5 }] },
    { nombre: "Antes de dormir", hora: "22:00", kcal: 240, p: 11.6, c: 24.6, g: 10.9,
      items: [{ alimento: "Leche entera", g: 300 }, { alimento: "Avena en hojuelas (seca)", g: 15 }] },
  ],
  grande: [
    { nombre: "Desayuno pre-bici", hora: "05:30", kcal: 679, p: 32.1, c: 86.5, g: 24.2,
      items: [{ alimento: "Avena en hojuelas (seca)", g: 65 }, { alimento: "Leche entera", g: 300 }, { alimento: "Banano", g: 120 }, { alimento: "Huevo entero", g: 100 }] },
    { nombre: "Durante la bici (por hora)", hora: "en ruta", kcal: 204, p: 4.5, c: 45.9, g: 1.2,
      items: [{ alimento: "Banano", g: 120 }, { alimento: "Pan francés", g: 35 }] },
    { nombre: "Recuperación (30 min post)", hora: "11:00", kcal: 483, p: 18.7, c: 70.3, g: 16.0,
      items: [{ alimento: "Leche entera", g: 400 }, { alimento: "Avena en hojuelas (seca)", g: 35 }, { alimento: "Banano", g: 120 }] },
    { nombre: "Almuerzo", hora: "13:30", kcal: 911, p: 87.4, c: 96.2, g: 17.3,
      items: [{ alimento: "Pechuga de pollo (cruda)", g: 220 }, { alimento: "Arroz blanco cocido", g: 215 }, { alimento: "Frijol negro cocido", g: 150 }, { alimento: "Aceite vegetal", g: 8 }] },
    { nombre: "Merienda", hora: "17:00", kcal: 320, p: 25.4, c: 31.9, g: 11.1,
      items: [{ alimento: "Tortilla de maíz", g: 60 }, { alimento: "Atún en agua (escurrido)", g: 80 }, { alimento: "Aguacate", g: 60 }] },
    { nombre: "Cena", hora: "20:00", kcal: 840, p: 66.7, c: 87.2, g: 23.9,
      items: [{ alimento: "Muslo de pollo sin piel", g: 200 }, { alimento: "Pasta cocida", g: 250 }, { alimento: "Brócoli / ejote / repollo", g: 150 }, { alimento: "Aceite vegetal", g: 5 }] },
  ],
};

export const ALIMENTOS: Alimento[] = [
  { nombre: "Pechuga de pollo (cruda)", kcal: 165, p: 31.0, c: 0.0, g: 3.6, tipo: "proteina", costo: "medio" },
  { nombre: "Muslo de pollo sin piel", kcal: 175, p: 24.0, c: 0.0, g: 8.0, tipo: "proteina", costo: "barato" },
  { nombre: "Huevo entero", kcal: 143, p: 12.6, c: 0.7, g: 9.5, tipo: "proteina", costo: "barato" },
  { nombre: "Clara de huevo", kcal: 52, p: 11.0, c: 0.7, g: 0.2, tipo: "proteina", costo: "barato" },
  { nombre: "Atún en agua (escurrido)", kcal: 116, p: 26.0, c: 0.0, g: 1.0, tipo: "proteina", costo: "medio" },
  { nombre: "Frijol negro cocido", kcal: 132, p: 8.9, c: 23.7, g: 0.5, tipo: "mixto", costo: "barato" },
  { nombre: "Incaparina (polvo)", kcal: 370, p: 16.0, c: 65.0, g: 5.0, tipo: "mixto", costo: "barato" },
  { nombre: "Leche entera", kcal: 61, p: 3.2, c: 4.8, g: 3.3, tipo: "mixto", costo: "barato" },
  { nombre: "Yogurt natural sin azúcar", kcal: 61, p: 3.5, c: 4.7, g: 3.3, tipo: "mixto", costo: "medio" },
  { nombre: "Arroz blanco cocido", kcal: 130, p: 2.7, c: 28.2, g: 0.3, tipo: "carbo", costo: "barato" },
  { nombre: "Pasta cocida", kcal: 158, p: 5.8, c: 30.9, g: 0.9, tipo: "carbo", costo: "barato" },
  { nombre: "Papa cocida", kcal: 87, p: 2.0, c: 20.1, g: 0.1, tipo: "carbo", costo: "barato" },
  { nombre: "Camote cocido", kcal: 90, p: 2.0, c: 20.7, g: 0.1, tipo: "carbo", costo: "barato" },
  { nombre: "Tortilla de maíz", kcal: 218, p: 5.7, c: 44.6, g: 2.5, tipo: "carbo", costo: "barato" },
  { nombre: "Avena en hojuelas (seca)", kcal: 379, p: 13.2, c: 67.7, g: 6.9, tipo: "carbo", costo: "barato" },
  { nombre: "Pan francés", kcal: 277, p: 9.0, c: 53.0, g: 2.5, tipo: "carbo", costo: "barato" },
  { nombre: "Banano", kcal: 89, p: 1.1, c: 22.8, g: 0.3, tipo: "carbo", costo: "barato" },
  { nombre: "Aceite vegetal", kcal: 884, p: 0.0, c: 0.0, g: 100.0, tipo: "grasa", costo: "barato" },
  { nombre: "Aguacate", kcal: 160, p: 2.0, c: 8.5, g: 14.7, tipo: "grasa", costo: "medio" },
  { nombre: "Brócoli / ejote / repollo", kcal: 34, p: 2.8, c: 6.6, g: 0.4, tipo: "verdura", costo: "barato" },
  { nombre: "Tomate / cebolla / pepino", kcal: 20, p: 0.9, c: 4.2, g: 0.2, tipo: "verdura", costo: "barato" },
];

export const CURVA_PESO: PuntoPeso[] = [
  { semana: 1, kg: 126.0, lb: 277.8 },
  { semana: 2, kg: 125.2, lb: 276.0 },
  { semana: 3, kg: 124.4, lb: 274.3 },
  { semana: 4, kg: 123.8, lb: 272.9 },
  { semana: 5, kg: 123.0, lb: 271.2 },
  { semana: 6, kg: 122.2, lb: 269.4 },
  { semana: 7, kg: 121.4, lb: 267.6 },
  { semana: 8, kg: 120.8, lb: 266.3 },
  { semana: 9, kg: 120.0, lb: 264.6 },
  { semana: 10, kg: 119.3, lb: 263.0 },
  { semana: 11, kg: 118.6, lb: 261.5 },
  { semana: 12, kg: 118.0, lb: 260.1 },
  { semana: 13, kg: 117.5, lb: 259.0 },
  { semana: 14, kg: 116.8, lb: 257.5 },
  { semana: 15, kg: 116.0, lb: 255.7 },
  { semana: 16, kg: 115.4, lb: 254.4 },
  { semana: 17, kg: 115.0, lb: 253.5 },
  { semana: 18, kg: 114.2, lb: 251.8 },
  { semana: 19, kg: 113.5, lb: 250.2 },
  { semana: 20, kg: 112.9, lb: 248.9 },
  { semana: 21, kg: 112.2, lb: 247.4 },
  { semana: 22, kg: 111.5, lb: 245.8 },
  { semana: 23, kg: 110.8, lb: 244.3 },
  { semana: 24, kg: 110.2, lb: 242.9 },
  { semana: 25, kg: 109.5, lb: 241.4 },
  { semana: 26, kg: 108.8, lb: 239.9 },
];

export const PREDICCION = {
  olimpico: { nado: "0:35:00", t1: "0:04:00", bici: "1:32:18", t2: "0:03:00", corre: "1:12:30", total: "3:26:48" },
  half: { nado: "0:44:20", t1: "0:06:00", bici: "3:36:00", t2: "0:05:00", corre: "2:59:21", total: "7:30:41" },
} as const;
