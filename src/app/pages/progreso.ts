import { Component, inject, signal, computed } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { PlanService } from '../services/plan.service';
import { ANTROPOMETRIA } from '../data/nutricion.data';
import { porSemana, tendencia, mmss, etiquetaSemana } from '../data/rendimiento';
import { estimarVO2max, tiempoParaDistancia } from '../data/fisiologia';
import {
  objetivosDe, valorObjetivo, requerido, hitos, carrerasPendientes,
  semanasHasta, metrosCarreraPie, ritmoEsperadoEnDistancia,
  ETIQUETA, UNIDAD, MAS_ES_MEJOR, MEJORA_PLAUSIBLE, SEMANAS_REFERENCIA,
  type Disciplina, type Veredicto,
} from '../data/progresion';

const DISCIPLINAS: Disciplina[] = ['nado', 'bici', 'corre'];

const CHIP: Record<Veredicto, string> = {
  'ya-esta': 'ok', 'holgado': 'ok', 'exigente': 'warn', 'fuera-de-rango': 'bad',
};
const TEXTO: Record<Veredicto, string> = {
  'ya-esta': 'ya está', 'holgado': 'alcanzable', 'exigente': 'exigente',
  'fuera-de-rango': 'fuera de alcance',
};

/**
 * Cuanto tenes que mejorar, para cuando, y si eso es realista.
 *
 * El resto de la pantalla dice que paso. Esto dice que deberia pasar, que es
 * otra pregunta: un -2 % en el nado no significa nada hasta saber si hacia
 * falta un -10 % o un -1 %.
 *
 * Los objetivos salen del desglose que cada carrera ya trae en el plan, no de
 * una tabla generica. Y cada uno viene con su veredicto: si lo que hace falta
 * se sale de lo que un cuerpo mejora en ese tiempo, el que esta mal es el
 * objetivo, no el entrenamiento.
 */
@Component({
  selector: 'p-progreso',
  template: `
  @if (carreras().length) {
    <h2 class="sec">¿Vas camino a la carrera?</h2>

    <div class="card prog">
      <div class="selector">
        @for (c of carreras(); track c.id) {
          <button [class.on]="c.id === elegida()" (click)="elegida.set(c.id)">
            {{ c.nombre }}
            <span class="dim">{{ semanasA(c.fecha) }} sem</span>
          </button>
        }
      </div>

      @if (carrera(); as c) {
        <p class="dim intro">
          {{ c.distancias }} · {{ etiquetaSemana(c.fecha) }}{{ c.confirmada ? '' : ' (fecha estimada)' }}
          @if (c.prediccion) { · objetivo <strong>{{ c.prediccion }}</strong> }
        </p>

        <div class="scroll-x">
          <table class="rend prog">
            <thead>
              <tr>
                <th>Disciplina</th>
                <th class="num">Hoy</th>
                <th class="num">Ese día</th>
                <th class="num">Falta</th>
                <th>Veredicto</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.disciplina) {
                <tr>
                  <td><strong>{{ f.nombre }}</strong></td>
                  <td class="num">{{ f.hoy }}</td>
                  <td class="num obj">{{ f.objetivo }}</td>
                  <td class="num">
                    @if (f.r.totalPct !== null && f.r.totalPct > 0) {
                      {{ (f.r.totalPct * 100).toFixed(0) }}%
                      <span class="dim det">{{ (f.r.porSemanaPct! * 100).toFixed(2) }}% / sem</span>
                    } @else { — }
                  </td>
                  <td>
                    <span class="chip" [class]="'chip ' + chip[f.r.veredicto]">{{ texto[f.r.veredicto] }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @for (f of filas(); track f.disciplina) {
          @if (f.baseDebil) {
            <p class="aviso provisional">
              <strong>{{ f.nombre }} — el punto de partida es flojo:</strong>
              {{ f.baseDebil }}. Comparar eso contra un objetivo de carrera no es
              comparar lo mismo, así que el veredicto de abajo es provisional. El
              test de la semana 2 pone una marca de verdad y esto se recalcula solo.
            </p>
          }
          @if (f.r.veredicto === 'fuera-de-rango' || f.r.veredicto === 'exigente') {
            <p class="aviso"><strong>{{ f.nombre }}:</strong> {{ f.r.porQue }}</p>
          }
        }

        <p class="dim nota">
          "Falta" compara contra lo que rendís hoy en <strong>esa misma distancia</strong>:
          tu media maratón a 8:14/km no es tu ritmo de 10 km, y el VDOT traduce entre las
          dos. El veredicto escala la mejora a {{ semRef }} semanas y la contrasta con lo
          que mejora alguien con tu recorrido — típico y techo, no promesas.
        </p>
      }
    </div>

    <!-- ------------------------------------------------- los hitos -->
    @if (conHitos().length) {
      <div class="card prog">
        <h2>Dónde deberías estar en el camino</h2>
        <p class="dim">
          La mejora no es pareja: lo que nunca se entrenó sube rápido al principio y se
          aplana después. Repartirla en partes iguales pediría de menos ahora y de más
          en la recta final, que es cuando ya no hay tiempo de corregir.
        </p>
        <div class="scroll-x">
          <table class="rend prog">
            <thead>
              <tr>
                <th>Para</th>
                @for (h of conHitos(); track h.disciplina) { <th class="num">{{ h.nombre }}</th> }
              </tr>
            </thead>
            <tbody>
              @for (fila of tablaHitos(); track fila.semanas) {
                <tr [class.final]="fila.final">
                  <td class="sem">
                    <strong>{{ etiquetaSemana(fila.fecha) }}</strong>
                    <span class="dim">+{{ fila.semanas }} sem</span>
                  </td>
                  @for (v of fila.valores; track $index) {
                    <td class="num">{{ v }}</td>
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
    h2.sec { margin: 1.1rem 0 .5rem; font-size: .78rem; text-transform: uppercase;
             letter-spacing: .08em; color: var(--muted); }
    .prog { margin-bottom: .7rem; }
    .prog h2 { margin: 0 0 .2rem; }
    .intro { margin: .1rem 0 .5rem; font-size: .85rem; }

    .selector { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .3rem; }
    .selector button {
      background: var(--surface-2); border: 1px solid var(--line); color: var(--muted);
      border-radius: 999px; padding: .3rem .7rem; font-size: .78rem; cursor: pointer;
      display: flex; align-items: baseline; gap: .35rem;
    }
    .selector button.on { border-color: var(--nado); color: #e9eef4; }
    .selector button .dim { font-size: .7rem; }

    table.rend { width: 100%; border-collapse: collapse; font-size: .84rem; }
    table.rend th, table.rend td { padding: .36rem .5rem; border-bottom: 1px solid var(--line); }
    table.rend th { font-size: .7rem; font-weight: 500; color: var(--muted); text-align: left; }
    table.rend td.num, table.rend th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.obj { color: var(--ok); font-weight: 600; }
    .det { display: block; font-size: .68rem; }
    td.sem { white-space: nowrap; }
    td.sem .dim { margin-left: .35rem; font-size: .72rem; }
    tr.final td { border-top: 1px solid var(--nado); font-weight: 600; }

    .aviso { font-size: .78rem; line-height: 1.4; color: #e8dcc0; margin: .35rem 0 0;
             padding-left: .5rem; border-left: 2px solid var(--warn); }
    .aviso.provisional { border-left-color: var(--nado); color: #cfe4f2; }
    .nota { font-size: .76rem; margin: .6rem 0 0; line-height: 1.45; }
  `],
})
export class ProgresoPage {
  private store = inject(StorageService);
  private plan = inject(PlanService);

  readonly etiquetaSemana = etiquetaSemana;
  readonly chip = CHIP;
  readonly texto = TEXTO;
  readonly semRef = SEMANAS_REFERENCIA;

  readonly carreras = computed(() => carrerasPendientes(this.plan.hoy()));
  readonly elegida = signal<string>('');

  readonly carrera = computed(() => {
    const cs = this.carreras();
    if (!cs.length) return null;
    return cs.find(c => c.id === this.elegida()) ?? cs[0];
  });

  semanasA(fecha: string) { return semanasHasta(this.plan.hoy(), fecha); }

  private semanas = computed(() => porSemana(this.store.actividades(), this.plan.hoy()));

  private vdot = computed(() => estimarVO2max(
    this.store.actividades(), this.plan.hoy(),
    this.pesoKg(), ANTROPOMETRIA.metaKg).vo2max);

  private pesoKg = computed(() => {
    const p = this.store.estado().pesos;
    return p.length ? p[p.length - 1].kg : ANTROPOMETRIA.pesoKg;
  });

  /**
   * Dónde está hoy en cada disciplina, en las unidades del objetivo.
   *
   * Nado y bici salen del promedio ponderado de las últimas semanas con dato.
   * Correr NO: sale del VDOT traducido a la distancia de esa carrera, porque
   * si no se estaría comparando su ritmo de media maratón contra un objetivo
   * de 10 km, y buena parte de la diferencia sería solo la distancia.
   */
  private hoyEn = computed<Record<Disciplina, number | null>>(() => {
    const b = this.baseNado();
    const c = this.carrera();
    return {
      nado: b.nado,
      bici: b.bici,
      corre: c ? ritmoEsperadoEnDistancia(
        tiempoParaDistancia, this.vdot(), metrosCarreraPie(c)) : null,
    };
  });

  /**
   * Las bases de nado y bici, con cuántas semanas las sostienen.
   *
   * El conteo no es adorno. La de bici sale de cuatro salidas cortas de junio y
   * julio, y con ella el veredicto de Monterrey pasa de "exigente" a "fuera de
   * alcance". El número es real —es lo único medido que hay— pero comparar un
   * paseo de 12 km contra un objetivo de 90 km a ritmo de carrera no es
   * comparar lo mismo, y la pantalla tiene que decirlo en vez de dictar
   * sentencia sobre una base que no la aguanta.
   */
  private baseNado = computed(() => {
    const ss = this.semanas();
    const tn = tendencia(ss, s => s.nado.ritmo, false, 4, s => s.nado.metros);
    const tb = tendencia(ss, s => s.bici.velocidad, true, 4, s => s.bici.kmRuta);
    return { nado: tn.reciente, bici: tb.reciente, nNado: tn.nReciente, nBici: tb.nReciente };
  });

  /** Hace cuántas semanas es el último dato de cada disciplina. */
  private antiguedad = computed<Record<Disciplina, number>>(() => {
    const ss = this.semanas();
    const ultimo = (get: (s: typeof ss[number]) => number | null) => {
      for (let i = ss.length - 1; i >= 0; i--) {
        const v = get(ss[i]);
        if (v !== null && Number.isFinite(v)) return ss.length - 1 - i;
      }
      return 99;
    };
    return {
      nado: ultimo(s => s.nado.ritmo),
      bici: ultimo(s => s.bici.velocidad),
      corre: ultimo(s => s.corre.ritmo),
    };
  });

  /** Cuántas semanas con dato sostienen la base de cada disciplina. */
  private semanasBase = computed<Record<Disciplina, number>>(() => {
    const b = this.baseNado();
    return { nado: b.nNado, bici: b.nBici, corre: 0 };
  });

  readonly filas = computed(() => {
    const c = this.carrera();
    if (!c) return [];
    const o = objetivosDe(c);
    const sem = semanasHasta(this.plan.hoy(), c.fecha);
    const hoy = this.hoyEn();

    const vieja = this.antiguedad();
    const nSem = this.semanasBase();

    return DISCIPLINAS.map(d => {
      const obj = valorObjetivo(o, d);
      const r = requerido(d, hoy[d], obj, sem);

      // La base flaquea cuando descansa en pocas semanas o cuando lo último
      // que la sostiene es viejo. En los dos casos el veredicto es provisional
      // y hay que decirlo, sobre todo si salió "fuera de alcance".
      let baseDebil = '';
      if (d !== 'corre' && hoy[d] !== null) {
        const partes: string[] = [];
        if (nSem[d] <= 2) partes.push(`descansa en ${nSem[d]} semana(s) con dato`);
        if (vieja[d] >= 4) partes.push(`la última es de hace ${vieja[d]} semanas`);
        if (partes.length) baseDebil = partes.join(' y ');
      }

      return {
        disciplina: d, nombre: ETIQUETA[d], r, baseDebil,
        hoy: this.formato(d, hoy[d]),
        objetivo: this.formato(d, obj),
      };
    }).filter(f => f.r.objetivo !== null);
  });

  /** Las disciplinas que tienen algo que mejorar, para la tabla de hitos. */
  readonly conHitos = computed(() =>
    this.filas().filter(f => f.r.totalPct !== null && f.r.totalPct > 0));

  readonly tablaHitos = computed(() => {
    const c = this.carrera();
    const cols = this.conHitos();
    if (!c || !cols.length) return [];
    const sem = semanasHasta(this.plan.hoy(), c.fecha);
    const cada = sem > 24 ? 8 : sem > 12 ? 4 : 3;

    const series = cols.map(f => hitos(
      f.r.actual!, f.r.objetivo!, sem, f.disciplina, this.plan.hoy(), cada));
    const base = series[0] ?? [];

    return base.map((h, i) => ({
      semanas: h.semanas,
      fecha: h.fecha,
      final: i === base.length - 1,
      valores: cols.map((f, j) =>
        this.formato(f.disciplina, series[j][i]?.valor ?? null)),
    }));
  });

  private formato(d: Disciplina, v: number | null): string {
    if (v === null || !Number.isFinite(v)) return '—';
    if (d === 'bici') return `${v.toFixed(1)} ${UNIDAD.bici}`;
    return `${mmss(v)}${UNIDAD[d]}`;
  }
}
