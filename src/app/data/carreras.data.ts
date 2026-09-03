export interface Carrera {
  id: string;
  nombre: string;
  fecha: string;          // ISO
  lugar: string;
  distancias: string;
  estado: 'objetivo' | 'preparatoria' | 'opcional' | 'hito';
  prediccion?: string;
  desglose?: { segmento: string; tiempo: string }[];
  notas: string[];
  fuente?: string;
}

export const CARRERAS: Carrera[] = [
  {
    id: 'olimpico',
    nombre: 'Triatlón olímpico',
    fecha: '2026-11-08',
    lugar: 'Guatemala (por confirmar)',
    distancias: '1.5 km nado · 40 km bici · 10 km carrera',
    estado: 'preparatoria',
    prediccion: '3:26',
    desglose: [
      { segmento: 'Natación 1.5 km', tiempo: '35:00' },
      { segmento: 'T1', tiempo: '4:00' },
      { segmento: 'Bici 40 km', tiempo: '1:32' },
      { segmento: 'T2', tiempo: '3:00' },
      { segmento: 'Carrera 10 km', tiempo: '1:12' },
    ],
    notas: [
      'Es el ensayo general, no el objetivo. Sirve para practicar transiciones y salida en masa.',
      'La natación no te preocupa: ya nadás 2600 m seguidos en entrenamiento.',
      'Confirmame el nombre y la sede en cuanto la tengas para calzar la semana 9.',
    ],
  },
  {
    id: 'granjaguar',
    nombre: 'Gran Jaguar 70.3',
    fecha: '2026-11-28',
    lugar: 'Flores, Petén — Lago Petén Itzá',
    distancias: '1.9 km nado · 90 km bici · 21.1 km carrera',
    estado: 'objetivo',
    prediccion: '7:31',
    desglose: [
      { segmento: 'Natación 1.9 km', tiempo: '44:20' },
      { segmento: 'T1', tiempo: '6:00' },
      { segmento: 'Bici 90 km', tiempo: '3:36' },
      { segmento: 'T2', tiempo: '5:00' },
      { segmento: 'Carrera 21.1 km', tiempo: '2:59' },
    ],
    notas: [
      'Campeonato Nacional 70.3, edición XXIII. Inscripción Q 2,000, no reembolsable.',
      'Tiene división promocional, dúatlon y relevos por si a la semana 9 la bici no está lista.',
      'Nado en lago: reservá al menos dos sesiones de aguas abiertas antes de noviembre.',
      'Son 12 semanas desde hoy. Nado y carrera te sobran; todo depende de la bici.',
    ],
    fuente: 'https://masdeporte.com.gt/gran-jaguar-70-3/',
  },
  {
    id: 'metapeso',
    nombre: 'Meta de peso: 240 lb',
    fecha: '2027-03-07',
    lugar: '—',
    distancias: '109 kg / 240 lb',
    estado: 'hito',
    notas: [
      '18.2 kg abajo en 26 semanas, a un promedio de 0.70 kg por semana.',
      'No es lineal: las primeras semanas bajan más rápido y las últimas se resisten.',
      'Si en 3 semanas seguidas no se mueve la balanza, bajamos 150 kcal al promedio diario.',
    ],
  },
  {
    id: 'monterrey',
    nombre: 'IRONMAN 70.3 Monterrey',
    fecha: '2027-04-15',
    lugar: 'Monterrey, Nuevo León, México',
    distancias: '1.9 km nado · 90 km bici (2 vueltas) · 21.1 km carrera',
    estado: 'opcional',
    notas: [
      'Fecha aproximada: mediados de abril 2027. Confirmá cuando abran inscripciones.',
      'Este es el 70.3 para ir por tiempo, ya con 18 kg menos encima.',
      'Si preferís quedarte en Guatemala, el Gran Jaguar 2027 cae de nuevo en noviembre.',
    ],
    fuente: 'https://www.finishers.com/en/event/ironman-70-3-monterrey',
  },
];

export const DECISION_SEMANA_9 = {
  titulo: 'Punto de decisión: semana 9 (2 – 8 nov)',
  texto: 'Después del olímpico decidimos si el Gran Jaguar del 28 de noviembre va en serio.',
  criterios: [
    { criterio: 'Completaste la salida de 80 km de la semana 7 sin destruirte', peso: 'Decisivo' },
    { criterio: 'Promediás 26 km/h o más en Z2 en llano', peso: 'Decisivo' },
    { criterio: 'Terminaste el olímpico sin caminar en los 10 km', peso: 'Importante' },
    { criterio: 'Cero molestias de rodilla, espalda baja o tendón de Aquiles', peso: 'Innegociable' },
  ],
  planB: 'Si algo falla: corrés la división promocional o un relevo en el Gran Jaguar, ' +
         'y el 70.3 completo pasa a Monterrey en abril, con 18 kg menos y 20 semanas más de bici.',
};
