import type { Disciplina } from './plan.data';

export interface Sesion {
  disciplina: Disciplina;
  titulo: string;
  min: number;
  zona: string;
  pasos: string[];
  nota?: string;
}

export interface DiaBase {
  dow: number;              // 1 = lunes … 7 = domingo
  nombre: string;
  tipoDia: 'ligero' | 'medio' | 'fuerte' | 'grande';
  sesiones: Sesion[];
}

/** Zonas de FC tomadas del perfil real de Strava de Miguel (fuente: MaxHeartRate). */
export const ZONAS_FC = [
  { z: 'Z1', nombre: 'Recuperación', rango: '< 123 ppm', uso: 'Calentamiento, vuelta a la calma' },
  { z: 'Z2', nombre: 'Aeróbico',     rango: '124 – 153 ppm', uso: 'Base. Aquí vive el 75 % del plan' },
  { z: 'Z3', nombre: 'Tempo',        rango: '154 – 168 ppm', uso: 'Ritmo de 70.3 en bici' },
  { z: 'Z4', nombre: 'Umbral',       rango: '169 – 183 ppm', uso: 'Intervalos de spinning' },
  { z: 'Z5', nombre: 'VO2 máx',      rango: '> 184 ppm', uso: 'Series cortas, poco volumen' },
];

/** Ritmos de referencia derivados de las actividades reales de Strava. */
export const RITMOS = [
  { disciplina: 'Natación', metrica: 'Ritmo sostenido', actual: '2:20 / 100 m', meta: '2:05 / 100 m',
    evidencia: '2600 m a 2:14 y 3500 m a 2:12 en agosto' },
  { disciplina: 'Natación', metrica: '1900 m (70.3)', actual: '≈ 44 min', meta: '≈ 40 min',
    evidencia: 'Proyectado desde el ritmo sostenido' },
  { disciplina: 'Bici', metrica: 'FTP', actual: '133 W (estimado)', meta: '190 – 210 W',
    evidencia: 'Estimado por Strava con muy pocos datos: hay que testearlo' },
  { disciplina: 'Bici', metrica: 'Velocidad en llano', actual: '≈ 18 km/h', meta: '26 – 28 km/h',
    evidencia: 'Única salida registrada: 12 km a 17.9 km/h' },
  { disciplina: 'Carrera', metrica: '10 km', actual: '1:08 (6:48 / km)', meta: '1:02 (6:12 / km)',
    evidencia: 'Mejor 10 km registrado en Strava' },
  { disciplina: 'Carrera', metrica: '21 km', actual: '2:57 (8:14 / km)', meta: '2:35 (7:20 / km)',
    evidencia: 'Media maratón del 23 de agosto de 2026' },
];

/** Estructura semanal fija, según la disponibilidad real de Miguel. */
export const SEMANA_BASE: DiaBase[] = [
  {
    dow: 1, nombre: 'Lunes', tipoDia: 'medio',
    sesiones: [
      {
        disciplina: 'nado', titulo: 'Natación — umbral corto', min: 45, zona: 'Z3',
        pasos: [
          '300 m suave: 100 crol / 100 patada con tabla / 100 crol',
          '4 × 50 m técnica (punta de dedos, un brazo, puño cerrado, deslizamiento) — 15 s de descanso',
          'Principal: 8 × 100 m a 2:25 / 100 m — 20 s de descanso',
          '200 m suave',
        ],
        nota: 'Cabe en 45 min. Si vas corto de tiempo, recortá el principal a 6 × 100, no el calentamiento.',
      },
      {
        disciplina: 'fuerza', titulo: 'CrossFit', min: 60, zona: 'mixto',
        pasos: [
          'Pasame el WOD del día y te digo qué escalar',
          'Este es buen día para piernas pesadas: estás lejos de la bici larga',
        ],
      },
    ],
  },
  {
    dow: 2, nombre: 'Martes', tipoDia: 'fuerte',
    sesiones: [
      {
        disciplina: 'bici', titulo: 'Spinning — intervalos de umbral', min: 60, zona: 'Z4',
        pasos: [
          '15 min de calentamiento progresivo hasta Z2',
          'Principal: 4 × 8 min en Z4 (169–183 ppm) con 3 min suaves — cadencia 85–95 rpm',
          '5 min de vuelta a la calma',
        ],
        nota: 'Ignorá la coreografía de la clase. Seguí tu pulsómetro: el instructor no sabe tus zonas.',
      },
      { disciplina: 'fuerza', titulo: 'CrossFit', min: 60, zona: 'mixto',
        pasos: ['Preferí tren superior o core hoy: las piernas ya trabajaron en el spinning'] },
    ],
  },
  {
    dow: 3, nombre: 'Miércoles', tipoDia: 'medio',
    sesiones: [
      {
        disciplina: 'nado', titulo: 'Natación — ritmo y velocidad', min: 45, zona: 'Z3-Z4',
        pasos: [
          '300 m suave',
          '6 × 50 m progresivos — 15 s',
          'Principal: 16 × 50 m a 1:05 (ritmo 2:10 / 100 m) — 15 s',
          '8 × 25 m sprint — 20 s',
          '200 m suave',
        ],
        nota: 'Esta sesión es la que te baja el ritmo de 2:20 a 2:05 por cada 100 m.',
      },
      { disciplina: 'fuerza', titulo: 'CrossFit', min: 60, zona: 'mixto',
        pasos: ['Segundo día bueno para piernas pesadas'] },
    ],
  },
  {
    dow: 4, nombre: 'Jueves', tipoDia: 'fuerte',
    sesiones: [
      {
        disciplina: 'bici', titulo: 'Spinning — fuerza en cadencia baja', min: 60, zona: 'Z3-Z4',
        pasos: [
          '15 min de calentamiento',
          'Principal: 6 × 3 min a 55–65 rpm con resistencia alta en Z3–Z4, 2 min suaves entre series',
          '10 min en Z2',
        ],
        nota: 'La cadencia baja simula las subidas. Es lo que te va a faltar en los 90 km.',
      },
      {
        disciplina: 'brick', titulo: 'Brick — trote inmediato', min: 15, zona: 'Z2',
        pasos: [
          'Bajarte de la bici y salir a trotar en menos de 5 min',
          '15 min suaves. Las primeras 2 cuadras se sienten raras: de eso se trata',
        ],
        nota: 'No te saltés este trote. Correr con las piernas cargadas es la habilidad que decide un 70.3.',
      },
      { disciplina: 'fuerza', titulo: 'CrossFit', min: 60, zona: 'mixto',
        pasos: ['Tren superior o core. Hoy ya hiciste bici y trote'] },
    ],
  },
  {
    dow: 5, nombre: 'Viernes', tipoDia: 'ligero',
    sesiones: [
      { disciplina: 'fuerza', titulo: 'CrossFit', min: 60, zona: 'mixto',
        pasos: ['Nada pesado de piernas: mañana nadás y el domingo tenés la bici larga'] },
      {
        disciplina: 'corre', titulo: 'Trote suave', min: 35, zona: 'Z2',
        pasos: [
          '35 min en Z2 (124–153 ppm), conversando sin ahogarte',
          'Si el pulso se te va sobre 153, caminá 1 min y seguí',
        ],
        nota: 'Este trote existe para darte una tercera sesión de carrera por semana. Antes solo corrías los domingos.',
      },
    ],
  },
  {
    dow: 6, nombre: 'Sábado', tipoDia: 'fuerte',
    sesiones: [
      {
        disciplina: 'nado', titulo: 'Natación larga', min: 70, zona: 'Z2-Z3',
        pasos: [
          '400 m de calentamiento',
          'Principal: continuo a ritmo de carrera (el volumen lo marca la semana)',
          '8 × 50 m técnica',
          '200 m suave',
        ],
        nota: 'Sin tabla ni pull-buoy en el bloque principal: nadá como vas a nadar en el lago.',
      },
    ],
  },
  {
    dow: 7, nombre: 'Domingo', tipoDia: 'grande',
    sesiones: [
      {
        disciplina: 'bici', titulo: 'Bici larga en ruta', min: 150, zona: 'Z2',
        pasos: [
          'Todo en Z2 (124–153 ppm). Si vas hablando, vas bien',
          'Comé 60–80 g de carbohidrato por hora desde la primera hora, no cuando ya tengas hambre',
          'Tomá 500–750 ml de líquido por hora',
          'Últimos 15–20 min a ritmo de carrera',
        ],
        nota: 'Esta es LA sesión de la semana. Si tenés que saltarte algo, que nunca sea esta.',
      },
      {
        disciplina: 'brick', titulo: 'Trote al bajar de la bici', min: 20, zona: 'Z2',
        pasos: [
          'Salí a trotar antes de 10 min de haber terminado la bici',
          'La duración la marca la semana. Ritmo cómodo, sin mirar el reloj',
        ],
      },
    ],
  },
];

/** Reglas para encajar los WOD de CrossFit sin arruinar el entrenamiento de triatlón. */
export const REGLAS_CROSSFIT = [
  { regla: 'Piernas pesadas solo lunes y miércoles',
    porque: 'Sentadilla, peso muerto y estocadas cargadas te dejan sin bici el domingo.' },
  { regla: 'Viernes y sábado: nada de piernas',
    porque: 'Son los dos días previos a la salida larga, la sesión más importante de la semana.' },
  { regla: 'Si el WOD trae más de 2 km de carrera o remo, cuenta como sesión de cardio',
    porque: 'Se suma al volumen semanal. Avisame y le resto al trote del viernes.' },
  { regla: 'En semana de carrera: solo movilidad y técnica sin carga',
    porque: 'Ninguna ganancia de fuerza llega a tiempo, pero el cansancio sí.' },
  { regla: 'Bajás de 5 a 3 días de CrossFit desde la semana 8',
    porque: 'Con 11 h semanales de triatlón y déficit calórico, 5 días de WOD es donde aparecen las lesiones.' },
];

/** Lo que hay que resolver en las primeras semanas y no aparece en ningún plan. */
export const PENDIENTES = [
  { semana: 1, item: 'Ajuste de bici (bike fit)',
    detalle: 'Nunca pasaste de 12 km. A los 60 km, una mala altura de sillín se vuelve dolor de rodilla.' },
  { semana: 1, item: 'Culotte con badana decente',
    detalle: 'El límite de tus primeras salidas largas va a ser el trasero, no las piernas.' },
  { semana: 2, item: 'Test de FTP (20 min a tope × 0.95)',
    detalle: 'Los 133 W que muestra Strava salen de una sola salida de 12 km. Casi seguro tenés más.' },
  { semana: 2, item: 'Practicar comer arriba de la bici',
    detalle: '60–80 g de carbohidrato por hora. El estómago se entrena igual que las piernas.' },
  { semana: 3, item: 'Cambiar rueda y arreglar pinchazo',
    detalle: 'Un pinchazo a 40 km de tu casa, sin saber cambiarlo, te arruina el domingo.' },
  { semana: 6, item: 'Inscripción al Gran Jaguar 70.3',
    detalle: 'Q 2,000. No es reembolsable, así que confirmá primero que la bici va bien.' },
  { semana: 8, item: 'Aguas abiertas (Amatitlán o Atitlán)',
    detalle: 'Nadar sin línea negra en el fondo es otro deporte. Practicá orientarte cada 6 brazadas.' },
];
