import { Component, inject, signal, computed } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { PlanService } from '../services/plan.service';
import {
  porSemana, tendencia, serie, mmss, miles, etiquetaSemana,
  type SemanaRendimiento, type ClaveDisciplina,
} from '../data/rendimiento';

const W = 260, H = 46;

interface Vista {
  clave: ClaveDisciplina;
  titulo: string;
  /** Lo que dibuja el sparkline. */
  metrica: string;
  unidad: string;
  masEsMejor: boolean;
  valor: (s: SemanaRendimiento) => number | null;
  /**
   * Con qué se pondera al promediar semanas. Va en las métricas que son una
   * razón (ritmo, velocidad): sin esto, una semana corta de recuperación pesa
   * lo mismo que una de volumen y mueve la tendencia sin que haya pasado nada.
   */
  peso?: (s: SemanaRendimiento) => number;
  formato: (v: number | null) => string;
}

/**
 * Qué se grafica de cada disciplina.
 *
 * Se grafica la CALIDAD, no el volumen, porque el volumen ya está en la tabla y
 * en Cumplimiento. La pregunta de esta pantalla es si está mejorando, y para eso
 * el ritmo dice más que los metros.
 *
 * CrossFit es la excepción: Strava no guarda el WOD ni las cargas, así que no
 * hay nada de calidad que medir y lo comparable es la constancia — cuántas veces
 * fue cada semana.
 */
const VISTAS: Vista[] = [
  {
    clave: 'nado', titulo: 'Natación', metrica: 'Ritmo medio', unidad: '/100 m',
    masEsMejor: false, valor: s => s.nado.ritmo, peso: s => s.nado.metros,
    formato: v => mmss(v),
  },
  {
    clave: 'bici', titulo: 'Bici', metrica: 'Velocidad en ruta', unidad: 'km/h',
    masEsMejor: true, valor: s => s.bici.velocidad, peso: s => s.bici.kmRuta,
    formato: v => v === null ? '—' : v.toFixed(1),
  },
  {
    clave: 'corre', titulo: 'Carrera', metrica: 'Ritmo medio', unidad: '/km',
    masEsMejor: false, valor: s => s.corre.ritmo, peso: s => s.corre.km,
    formato: v => mmss(v),
  },
  {
    clave: 'fuerza', titulo: 'CrossFit', metrica: 'Sesiones', unidad: 'por semana',
    masEsMejor: true, valor: s => s.fuerza.sesiones || null,
    formato: v => v === null ? '—' : String(Math.round(v * 10) / 10),
  },
];

@Component({
  selector: 'p-rendimiento',
  template: `
    <h1>Rendimiento por semana</h1>
    <p class="muted">
      No es cuánto entrenaste —eso está en Cumplimiento— sino si estás mejorando.
      Cada disciplina trae su volumen y su medida de calidad, semana contra semana.
    </p>

    @if (!semanas().length) {
      <div class="card">
        <p class="dim">
          Todavía no hay actividades cargadas. En cuanto Strava sincronice, esta
          pantalla se llena sola.
        </p>
      </div>
    } @else {

      <!-- ------------------------------------------------ tarjetas por disciplina -->
      <div class="tarjetas">
        @for (v of tarjetas(); track v.clave) {
          <div class="card disc" [class]="'card disc ' + v.clave">
            <div class="cab">
              <strong>{{ v.titulo }}</strong>
              @if (v.cambio !== null) {
                <span class="chip" [class]="'chip ' + (v.cambio >= 0 ? 'ok' : 'bad')">
                  {{ v.cambio > 0 ? '+' : '' }}{{ v.cambio }}%
                </span>
              } @else {
                <span class="chip">sin comparar</span>
              }
            </div>

            <div class="gran">
              <span class="n">{{ v.actual }}</span>
              <span class="u">{{ v.unidad }}</span>
            </div>
            <span class="l">{{ v.metrica }} · últimas {{ v.nReciente }} sem con dato</span>

            <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="spark" role="img"
                 [attr.aria-label]="'Evolución de ' + v.metrica.toLowerCase() + ' en ' + v.titulo">
              @for (t of v.serie.tramos; track $index) {
                <polyline [attr.points]="t" />
              }
              @for (p of v.serie.puntos; track p.i) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.i === v.ultimoIdx ? 3 : 1.8"
                        [class.ult]="p.i === v.ultimoIdx" />
              }
            </svg>

            @if (v.semanasSinDato >= 3) {
              <span class="viejo">
                Dato de hace {{ v.semanasSinDato }} semanas — última: {{ etiquetaSemana(v.ultimaSemana) }}
              </span>
            }

            <span class="pie dim">
              @if (v.previo !== null) {
                antes {{ v.previo }} {{ v.unidad }} · ahora {{ v.actual }} {{ v.unidad }}
              } @else {
                hacen falta más semanas para comparar
              }
            </span>
          </div>
        }
      </div>

      <p class="dim nota">
        El cambio compara el promedio de las últimas 4 semanas con dato contra las 4
        anteriores, y el signo ya viene orientado: <strong>+ siempre es mejor</strong>,
        aunque en nado y carrera eso signifique un número más bajo. Se comparan bloques
        de 4 y no semanas sueltas porque una semana la mueve cualquier cosa.
      </p>

      <!-- ------------------------------------------------------------ la tabla -->
      <div class="card">
        <div class="cab-tabla">
          <h2>Semana por semana</h2>
          <label class="toggle">
            <input type="checkbox" [checked]="soloConDatos()"
                   (change)="soloConDatos.set($any($event.target).checked)" />
            <span>Ocultar semanas vacías</span>
          </label>
        </div>

        <div class="scroll-x">
          <table class="rend">
            <thead>
              <tr>
                <th rowspan="2">Semana</th>
                <th colspan="2" class="g nado">🏊 Natación</th>
                <th colspan="2" class="g bici">🚴 Bici</th>
                <th colspan="2" class="g corre">🏃 Carrera</th>
                <th colspan="2" class="g fuerza">💪 CrossFit</th>
                <th rowspan="2" class="num">Horas</th>
              </tr>
              <tr>
                <th class="num sub">m</th><th class="num sub">/100 m</th>
                <th class="num sub">km</th><th class="num sub">km/h</th>
                <th class="num sub">km</th><th class="num sub">/km</th>
                <th class="num sub">ses</th><th class="num sub">min</th>
              </tr>
            </thead>
            <tbody>
              @for (s of filas(); track s.lunes) {
                <tr [class.vacia]="!s.hubo" [class.curso]="s.lunes === lunesHoy()">
                  <td class="sem">
                    <strong>{{ etiquetaSemana(s.lunes) }}</strong>
                    @if (s.n !== null) { <span class="dim">S{{ s.n }}</span> }
                    @if (s.lunes === lunesHoy()) { <span class="chip">en curso</span> }
                  </td>

                  <td class="num">{{ s.nado.metros ? miles(s.nado.metros) : '—' }}</td>
                  <td class="num" [class.mejor]="esMejor('nado', s)">{{ mmss(s.nado.ritmo) }}</td>

                  <td class="num">
                    {{ s.bici.km ? s.bici.km.toFixed(1) : '—' }}
                    @if (s.bici.indoorSesiones) { <i class="est" title="incluye bici indoor estimada a 18 km/h">*</i> }
                  </td>
                  <td class="num" [class.mejor]="esMejor('bici', s)">
                    {{ s.bici.velocidad === null ? '—' : s.bici.velocidad.toFixed(1) }}
                  </td>

                  <td class="num">{{ s.corre.km ? s.corre.km.toFixed(1) : '—' }}</td>
                  <td class="num" [class.mejor]="esMejor('corre', s)">{{ mmss(s.corre.ritmo) }}</td>

                  <td class="num">{{ s.fuerza.sesiones || '—' }}</td>
                  <td class="num">{{ s.fuerza.minutos || '—' }}</td>

                  <td class="num">{{ s.horas ? s.horas.toFixed(1) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <p class="dim pie-tabla">
          <strong class="mejor">En verde</strong>, tu mejor marca de esa columna.
          <i class="est">*</i> el total de bici incluye spinning y rodillo estimados a
          18 km/h — Strava los guarda sin distancia. La columna de km/h sale solo de
          las salidas con GPS, para que una clase de spinning no arrastre el promedio.
        </p>
      </div>

      <!-- -------------------------------------------------------- contra el plan -->
      @if (conPlan().length) {
        <div class="card">
          <h2>Contra lo que pedía el plan</h2>
          <div class="scroll-x">
            <table class="rend">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th class="num">Nado</th><th class="num">Bici</th>
                  <th class="num">Corre</th><th class="num">Horas</th>
                </tr>
              </thead>
              <tbody>
                @for (f of conPlan(); track f.lunes) {
                  <tr>
                    <td class="sem"><strong>S{{ f.n }}</strong> <span class="dim">{{ etiquetaSemana(f.lunes) }}</span></td>
                    @for (c of f.celdas; track c.campo) {
                      <td class="num">
                        <span [class]="'pc ' + c.color">{{ c.pct }}%</span>
                        <span class="dim det">{{ c.real }} / {{ c.meta }}</span>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: .7rem; margin-top: .85rem; }
    .disc { display: flex; flex-direction: column; gap: .3rem; }
    .disc .cab { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .gran { display: flex; align-items: baseline; gap: .3rem; }
    .gran .n { font-size: 1.75rem; font-weight: 650; line-height: 1.05; }
    .gran .u { font-size: .78rem; color: var(--muted); }
    .disc .l { font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .disc .pie { font-size: .74rem; }
    .viejo {
      font-size: .72rem; color: var(--warn); line-height: 1.3;
      border-left: 2px solid var(--warn); padding-left: .4rem;
    }

    .spark { width: 100%; height: 46px; margin: .35rem 0 .1rem; overflow: visible; }
    .spark polyline { fill: none; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
    .spark circle { fill: currentColor; opacity: .55; }
    .spark circle.ult { opacity: 1; }
    .disc.nado   { color: var(--nado); }
    .disc.bici   { color: var(--bici); }
    .disc.corre  { color: var(--corre); }
    .disc.fuerza { color: var(--fuerza); }
    .disc.nado .spark polyline   { stroke: var(--nado); }
    .disc.bici .spark polyline   { stroke: var(--bici); }
    .disc.corre .spark polyline  { stroke: var(--corre); }
    .disc.fuerza .spark polyline { stroke: var(--fuerza); }
    /* El color de acento es solo para el número y la línea: el texto sigue legible. */
    .disc strong, .disc .pie, .disc .l, .disc .gran .u { color: inherit; }
    .disc .pie, .disc .l { color: var(--muted); }
    .disc strong { color: var(--text, inherit); }

    .nota { font-size: .78rem; margin: .7rem 0 0; }

    .cab-tabla { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .cab-tabla h2 { margin: 0; }
    .toggle { display: flex; align-items: center; gap: .4rem; font-size: .8rem; color: var(--muted); cursor: pointer; white-space: nowrap; flex: 0 0 auto; }

    table.rend { width: 100%; border-collapse: collapse; font-size: .82rem; }
    table.rend th, table.rend td { padding: .34rem .5rem; border-bottom: 1px solid var(--line); }
    table.rend th.g { text-align: center; font-size: .74rem; letter-spacing: .03em; }
    table.rend th.g.nado { color: var(--nado); } table.rend th.g.bici { color: var(--bici); }
    table.rend th.g.corre { color: var(--corre); } table.rend th.g.fuerza { color: var(--fuerza); }
    table.rend th.sub { font-size: .68rem; font-weight: 500; color: var(--muted); text-transform: none; }
    table.rend td.num, table.rend th.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.rend tr.vacia td { opacity: .38; }
    table.rend tr.curso { background: color-mix(in srgb, var(--nado) 8%, transparent); }
    td.sem { white-space: nowrap; }
    td.sem .dim { margin-left: .35rem; font-size: .72rem; }
    td.sem .chip { margin-left: .35rem; }
    td.mejor, .mejor { color: var(--ok); font-weight: 600; }
    .est { color: var(--bici); font-style: normal; cursor: help; }
    .pie-tabla { font-size: .76rem; margin: .6rem 0 0; }

    .pc { font-weight: 600; }
    .pc.ok { color: var(--ok); } .pc.warn { color: var(--warn); } .pc.bad { color: var(--bad); }
    .det { display: block; font-size: .7rem; }
  `],
})
export class RendimientoPage {
  private store = inject(StorageService);
  private plan = inject(PlanService);

  readonly W = W; readonly H = H;
  readonly mmss = mmss;
  readonly miles = miles;
  readonly etiquetaSemana = etiquetaSemana;

  readonly soloConDatos = signal(false);

  readonly semanas = computed<SemanaRendimiento[]>(
    () => porSemana(this.store.actividades(), this.plan.hoy()));

  readonly lunesHoy = computed(() => {
    const s = this.semanas();
    return s.length ? s[s.length - 1].lunes : '';
  });

  readonly filas = computed(() => {
    const s = [...this.semanas()].reverse();
    return this.soloConDatos() ? s.filter(x => x.hubo) : s;
  });

  /**
   * Las tarjetas de arriba: valor actual, tendencia y sparkline por disciplina.
   *
   * `semanasSinDato` es el que evita el malentendido más caro de esta pantalla.
   * La bici marca "18.3 km/h · últimas 4 semanas con dato", y esas cuatro
   * semanas son de junio y julio: sin decirlo, el número se lee como si fuera
   * de ahora. La tarjeta tiene que avisar que el dato está viejo, sobre todo
   * en la disciplina donde llevar dos meses sin entrenar ES la noticia.
   */
  readonly tarjetas = computed(() => {
    const ss = this.semanas();
    return VISTAS.map(v => {
      const t = tendencia(ss, v.valor, v.masEsMejor, 4, v.peso);

      let ultimoIdx = -1;
      for (let i = ss.length - 1; i >= 0; i--) {
        const x = v.valor(ss[i]);
        if (x !== null && Number.isFinite(x)) { ultimoIdx = i; break; }
      }

      return {
        clave: v.clave, titulo: v.titulo, metrica: v.metrica, unidad: v.unidad,
        actual: v.formato(t.reciente),
        previo: t.previo === null ? null : v.formato(t.previo),
        cambio: t.cambioPct,
        nReciente: t.nReciente,
        serie: serie(ss.map(v.valor), W, H),
        ultimoIdx,
        ultimaSemana: ultimoIdx >= 0 ? ss[ultimoIdx].lunes : '',
        semanasSinDato: ultimoIdx >= 0 ? ss.length - 1 - ultimoIdx : 0,
      };
    });
  });

  /** Los mejores de cada columna, para pintarlos en verde. */
  private records = computed(() => {
    const ss = this.semanas();
    const mejor = (get: (s: SemanaRendimiento) => number | null, masEsMejor: boolean) => {
      const vs = ss.map(get).filter((x): x is number => x !== null && Number.isFinite(x));
      if (!vs.length) return null;
      return masEsMejor ? Math.max(...vs) : Math.min(...vs);
    };
    return {
      nado: mejor(s => s.nado.ritmo, false),
      bici: mejor(s => s.bici.velocidad, true),
      corre: mejor(s => s.corre.ritmo, false),
    };
  });

  esMejor(clave: 'nado' | 'bici' | 'corre', s: SemanaRendimiento): boolean {
    const r = this.records()[clave];
    if (r === null) return false;
    const v = clave === 'nado' ? s.nado.ritmo : clave === 'bici' ? s.bici.velocidad : s.corre.ritmo;
    // Tolerancia de una centésima: dos semanas empatadas se pintan las dos, que
    // es lo correcto, en vez de que gane la primera por un error de coma flotante.
    return v !== null && Math.abs(v - r) < 0.01;
  }

  /**
   * Lo hecho contra lo que pedía el plan, solo para las semanas del plan que ya
   * pasaron o están en curso. Las que aún no llegaron no dicen nada.
   */
  readonly conPlan = computed(() => {
    return this.semanas()
      .filter(s => s.objetivo !== null && s.hubo)
      .map(s => {
        const o = s.objetivo!;
        const celdas = [
          { campo: 'nado', real: miles(s.nado.metros) + ' m', meta: miles(o.nadoM) + ' m', pct: pct(s.nado.metros, o.nadoM) },
          { campo: 'bici', real: s.bici.km.toFixed(0) + ' km', meta: o.biciKm + ' km', pct: pct(s.bici.km, o.biciKm) },
          { campo: 'corre', real: s.corre.km.toFixed(0) + ' km', meta: o.correKm + ' km', pct: pct(s.corre.km, o.correKm) },
          { campo: 'horas', real: s.horas.toFixed(1) + ' h', meta: o.horas + ' h', pct: pct(s.horas, o.horas) },
        ].map(c => ({ ...c, color: c.pct >= 95 ? 'ok' : c.pct >= 70 ? 'warn' : 'bad' }));
        return { lunes: s.lunes, n: o.n, celdas };
      })
      .reverse();
  });
}

function pct(hecho: number, meta: number): number {
  if (!meta) return hecho ? 100 : 0;
  return Math.round((hecho / meta) * 100);
}
