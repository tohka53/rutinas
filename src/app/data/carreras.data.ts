export interface Carrera {
  id: string;
  nombre: string;
  fecha: string;           // ISO. Si confirmada = false, es la fecha típica del evento.
  confirmada: boolean;
  lugar: string;
  distancias: string;
  estado: 'objetivo' | 'preparatoria' | 'opcional' | 'hito';
  semana: number;          // semana del plan en que cae
  prediccion?: string;
  pesoEstimadoKg?: number;
  desglose?: { segmento: string; tiempo: string }[];
  notas: string[];
  fuente?: string;
}

export const CARRERAS: Carrera[] = [
  {
    id: 'olimpico',
    nombre: 'Triatlón olímpico',
    fecha: '2026-11-08',
    confirmada: true,
    lugar: 'Guatemala (sede por confirmar)',
    distancias: '1.5 km nado · 40 km bici · 10 km carrera',
    estado: 'preparatoria',
    semana: 9,
    prediccion: '3:27',
    pesoEstimadoKg: 120,
    desglose: [
      { segmento: 'Natación 1.5 km', tiempo: '35:00' },
      { segmento: 'T1', tiempo: '4:00' },
      { segmento: 'Bici 40 km', tiempo: '1:32' },
      { segmento: 'T2', tiempo: '3:00' },
      { segmento: 'Carrera 10 km', tiempo: '1:12' },
    ],
    notas: [
      'Es el ensayo general: salida en masa, transiciones, comer en carrera.',
      'La natación no te preocupa. Lo que se prueba acá es la bici y la cabeza.',
      'Pasame el nombre y la sede en cuanto la tengas para calzar la semana 9.',
    ],
  },
  {
    id: 'elsalvador',
    nombre: 'Olímpico en El Salvador',
    fecha: '2027-02-07',
    confirmada: true,
    lugar: 'San Salvador, El Salvador',
    distancias: '1.5 km nado · 40 km bici · 10 km carrera (por confirmar la distancia corta)',
    estado: 'preparatoria',
    semana: 22,
    prediccion: '3:15',
    pesoEstimadoKg: 112,
    desglose: [
      { segmento: 'Natación 1.5 km', tiempo: '34:30' },
      { segmento: 'T1', tiempo: '3:30' },
      { segmento: 'Bici 40 km', tiempo: '1:25' },
      { segmento: 'T2', tiempo: '2:30' },
      { segmento: 'Carrera 10 km', tiempo: '1:08' },
    ],
    notas: [
      'Segundo olímpico, para probar sensaciones en un evento IRONMAN de verdad.',
      'La fecha del 70.3 está confirmada; falta confirmar que haya distancia corta. ' +
      'Es habitual (Buenos Aires y San Juan corren un 5150 junto al 70.3), pero hay ' +
      'que verificarlo cuando abran inscripciones.',
      'Si no hubiera distancia corta: relevo, o se sustituye por otro olímpico local.',
      'A tres horas por tierra desde Guatemala. Calor y humedad como los tuyos.',
      'Ojo: esta semana NO lleva taper completo. Un olímpico se afila en una semana ' +
      'y el build de bici hacia abril sigue corriendo.',
    ],
    fuente: 'https://www.instagram.com/p/DXR7FsvjhAA/',
  },
  {
    id: 'segundo703',
    nombre: 'Primer 70.3 — Monterrey',
    fecha: '2027-04-18',
    confirmada: false,
    lugar: 'Monterrey, Nuevo León, México',
    distancias: '1.9 km nado · 90 km bici · 21.1 km carrera',
    estado: 'objetivo',
    semana: 32,
    prediccion: '6:38',
    pesoEstimadoKg: 107,
    desglose: [
      { segmento: 'Natación 1.9 km', tiempo: '43:00' },
      { segmento: 'T1', tiempo: '5:00' },
      { segmento: 'Bici 90 km', tiempo: '3:06' },
      { segmento: 'T2', tiempo: '4:00' },
      { segmento: 'Carrera 21.1 km', tiempo: '2:38' },
    ],
    notas: [
      'Fecha estimada: suele correrse a mediados de abril. Se ajusta cuando publiquen.',
      'Tu primer 70.3 completo. 32 semanas de preparación, no 12: ese era el punto ' +
      'de mover la distancia larga de noviembre a abril.',
      'Llegás con dos olímpicos encima y 20 kg menos que hoy.',
      'Objetivo: terminarlo entero y bien. El tiempo se persigue en octubre.',
      'Alternativa: Campeche a mediados de marzo, pero deja 5 semanas menos de build.',
    ],
    fuente: 'https://www.finishers.com/en/event/ironman-70-3-monterrey',
  },
  {
    id: 'tercero703',
    nombre: 'Segundo 70.3 — Miami',
    fecha: '2027-10-24',
    confirmada: false,
    lugar: 'Miami, Florida, Estados Unidos',
    distancias: '1.9 km nado · 90 km bici · 21.1 km carrera',
    estado: 'objetivo',
    semana: 59,
    prediccion: '6:13',
    pesoEstimadoKg: 101.5,
    desglose: [
      { segmento: 'Natación 1.9 km', tiempo: '41:00' },
      { segmento: 'T1', tiempo: '5:00' },
      { segmento: 'Bici 90 km', tiempo: '2:54' },
      { segmento: 'T2', tiempo: '4:00' },
      { segmento: 'Carrera 21.1 km', tiempo: '2:27' },
    ],
    notas: [
      'Fecha estimada: Miami suele correrse a finales de octubre.',
      'El pico del año, y la carrera donde sí vas por tiempo.',
      'Circuito plano y caluroso, parecido a lo que entrenás todo el año.',
      'Alternativa: New York, pero cae a finales de septiembre — un mes menos de build ' +
      'y clima más fresco (más rápido, pero menos parecido a tu entrenamiento).',
      'Seis meses después del primero: en el medio entra el off-season de fuerza y la ' +
      'base grande de verano, que es lo que separa terminar de competir.',
    ],
    fuente: 'https://www.raceentry.com/ironman-703-miami/race-information',
  },
];

export const DECISION_SEMANA_9 = {
  titulo: 'Punto de decisión: semana 25 (22 – 28 feb 2027)',
  texto: 'Es la semana de la primera salida de 90 km. Ahí se confirma si el 70.3 de abril va, ' +
         'o si se corre el de octubre como primera distancia larga.',
  criterios: [
    { criterio: 'Completaste los 90 km de la semana 25 y pudiste trotar después', peso: 'Decisivo' },
    { criterio: 'Promediás 27 km/h o más en Z2 en llano', peso: 'Decisivo' },
    { criterio: 'Los dos olímpicos los terminaste sin caminar', peso: 'Importante' },
    { criterio: 'Cero molestias de rodilla, espalda baja o tendón de Aquiles', peso: 'Innegociable' },
  ],
  planB: 'Si algo falla, abril se corre igual pero como rodaje sin presión de tiempo, ' +
         'y el 70.3 "de verdad" queda en octubre. Son cuatro carreras en catorce meses: ' +
         'ninguna es la única oportunidad.',
};

/** Por qué el calendario quedó así, para no rediscutirlo cada mes. */
export const LOGICA_CALENDARIO = [
  {
    punto: 'Dos olímpicos antes del primer 70.3',
    razon: 'Noviembre y febrero. El segundo no es un trámite: se corre en un evento ' +
           'IRONMAN, con su logística y su nervio, tres meses antes de la distancia larga. ' +
           'Llegás a abril sabiendo cómo se siente una salida en masa y una transición ' +
           'de verdad, no solo cómo se entrena.',
  },
  {
    punto: 'El primer 70.3 en abril, no en noviembre',
    razon: 'Pasar de 19 km a 90 km en bici en 12 semanas es donde aparecen las lesiones. ' +
           'En 32 se construye. La natación y la carrera ya estaban; la bici no se apura.',
  },
  {
    punto: 'Seis meses entre los dos 70.3',
    razon: 'Ahí entra el bloque que casi nadie hace: off-season con fuerza y corrección ' +
           'de debilidades, después base grande. Es lo que separa terminar de competir.',
  },
  {
    punto: 'El peso se persigue hasta abril, después se sostiene',
    razon: 'Bajar durante un bloque de 16 h semanales cuesta sesiones. La meta de 240 lb ' +
           'cae sola cerca de marzo; de ahí en adelante la prioridad es rendir.',
  },
];
