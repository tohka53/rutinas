import { Component, inject, computed } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { PlanService } from '../services/plan.service';
import { StravaService } from '../services/strava.service';
import { etiquetaSemana, lunesDe } from '../data/rendimiento';
import { type ZonaConfigurada } from '../data/fisiologia';
import {
  distribucionPorSemana, resumenIntensidad, OBJETIVO_REPARTO,
  BANDAS, ETIQUETA_BANDA, DESCRIPCION_BANDA, COLOR_BANDA, BANDA_DE_ZONA,
  type SemanaIntensidad, type Banda,
} from '../data/zonas-semana';

/** Cuantas semanas hacia atras se comparan. */
const SEMANAS = 16;

/**
 * Como se repartio la intensidad, semana a semana.
 *
 * El resto de Rendimiento mira volumen y ritmo. Esto mira la tercera variable,
 * que es la que suele estar mal sin que se note: en que zona se entreno.
 *
 * El fallo clasico de un plan de resistencia no es entrenar poco, es entrenar
 * todo a intensidad media —el fondo demasiado rapido, las series demasiado
 * suaves— y eso no se ve en los kilometros ni en el ritmo medio. Solo se ve en
 * la distribucion, y solo sirve si se mira cada semana, cuando todavia se puede
 * corregir.
 */
@Component({
  selector: 'p-intensidad',
  template: `
  @if (semanas().length) {
    <h2 class="sec">Cómo repartiste la intensidad</h2>
    <div class="card int">
      <p class="dim intro">
        En qué zona cayó cada sesión, semana a semana. El error que más arruina un
        plan de resistencia no es entrenar poco: es entrenar todo a intensidad
        media, con el fondo demasiado rápido y las series demasiado suaves. Eso no
        se ve en los kilómetros — solo acá.
      </p>

      <!-- ---------------------------------------------- las últimas semanas -->
      <div class="resumen">
        @for (b of bandas; track b) {
          <div class="bloque">
            <span class="pastilla" [style.background]="color[b]"></span>
            <div>
              <div class="linea">
                <strong>{{ etiqueta[b] }}</strong>
                <span class="pc">{{ pct(resumen()[claves[b]]) }}%</span>
              </div>
              <span class="l">objetivo {{ pct(objetivo[b]) }}% · {{ descripcion[b] }}</span>
            </div>
          </div>
        }
      </div>
      <span class="l centro">
        últimas {{ resumen().semanas }} semanas con pulsómetro · {{ resumen().horas }} h
      </span>

      @for (a of resumen().avisos; track $index) {
        <p class="aviso">{{ a }}</p>
      }

      <!-- ------------------------------------------------ barras por semana -->
      <div class="barras" role="img"
           aria-label="Reparto de intensidad por semana, en tres bandas">
        @for (s of filas(); track s.lunes) {
          <div class="fila" [class.encurso]="s.lunes === lunesHoy()">
            <span class="sem">
              {{ etiquetaSemana(s.lunes) }}
              @if (s.lunes === lunesHoy()) { <i class="hoy">en curso</i> }
            </span>

            @if (s.vacia) {
              <span class="sinDato">sin frecuencia cardíaca</span>
            } @else {
              <span class="barra">
                @for (t of tramos(s); track t.banda) {
                  <span class="tramo" [style.width.%]="t.pct"
                        [style.background]="color[t.banda]"
                        [title]="etiqueta[t.banda] + ': ' + t.horas.toFixed(1) + ' h (' + pct(t.frac) + '%)'">
                    @if (t.pct >= 12) { <b>{{ pct(t.frac) }}%</b> }
                  </span>
                }
              </span>
              <span class="horas">{{ s.total.toFixed(1) }} h</span>
            }

            @if (s.sinFC) {
              <span class="faltan" [title]="s.sinFC + ' sesión(es) sin pulsómetro esa semana'">
                +{{ s.sinFC }}
              </span>
            }
          </div>
        }
      </div>

      <p class="dim pie">
        Cada sesión cuenta entera en la zona de su <strong>frecuencia media</strong>.
        Una sesión de series pasa por varias zonas y acá cae en una sola: alcanza
        para ver si el reparto está aplastado en el medio, no para medir minutos
        exactos. El <span class="faltan">+n</span> son las sesiones de esa semana
        sin pulsómetro, que no entran en el reparto.
      </p>

      <!-- ----------------------------------------------- el detalle por zona -->
      <details>
        <summary>Horas por zona, semana a semana</summary>
        <div class="scroll-x">
          <table class="rend">
            <thead>
              <tr>
                <th>Semana</th>
                @for (z of encabezados(); track z.n) {
                  <th class="num">Z{{ z.n }} <span class="dim">{{ z.rango }}</span></th>
                }
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              @for (s of filas(); track s.lunes) {
                <tr [class.vacia]="s.vacia">
                  <td>{{ etiquetaSemana(s.lunes) }}</td>
                  @for (h of s.porZona; track $index) {
                    <td class="num">{{ h >= 0.05 ? h.toFixed(1) : '—' }}</td>
                  }
                  <td class="num"><strong>{{ s.total >= 0.05 ? s.total.toFixed(1) : '—' }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    </div>
  }
  `,
  styles: [`
    h2.sec { margin: 1.1rem 0 .5rem; font-size: .78rem; text-transform: uppercase;
             letter-spacing: .08em; color: var(--muted); }
    .int { display: flex; flex-direction: column; gap: .5rem; }
    .intro { font-size: .84rem; margin: 0; }

    .resumen { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: .5rem; }
    .bloque { display: flex; gap: .5rem; align-items: flex-start;
              border: 1px solid var(--line); border-radius: 8px; padding: .5rem .6rem; }
    .pastilla { width: 10px; height: 10px; border-radius: 3px; margin-top: .35rem; flex: 0 0 auto; }
    .bloque .linea { display: flex; align-items: baseline; gap: .5rem; }
    .bloque .pc { font-size: 1.25rem; font-weight: 650; font-variant-numeric: tabular-nums; }
    .l { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .l.centro { text-align: center; }

    .barras { display: flex; flex-direction: column; gap: 3px; margin-top: .3rem; }
    .fila { display: flex; align-items: center; gap: .5rem; font-size: .78rem; }
    .fila.encurso { background: color-mix(in srgb, var(--nado) 8%, transparent);
                    border-radius: 6px; padding: 1px .25rem; margin: 0 -.25rem; }
    .sem { flex: 0 0 5.6rem; color: var(--muted); white-space: nowrap; }
    .hoy { font-style: normal; font-size: .62rem; color: var(--nado); display: block; }

    /* 2px de fondo entre tramos: sin la separacion, dos bandas contiguas se
       leen como una sola y el reparto se ve mejor de lo que es. */
    .barra { flex: 1 1 auto; display: flex; gap: 2px; height: 20px;
             border-radius: 4px; overflow: hidden; min-width: 0; }
    .tramo { display: flex; align-items: center; justify-content: center;
             min-width: 2px; transition: none; }
    .tramo:first-child { border-radius: 4px 0 0 4px; }
    .tramo:last-child { border-radius: 0 4px 4px 0; }
    /* El numero va en tinta oscura sobre el relleno claro, no en el color de la
       serie: el texto nunca lleva el color del dato. */
    .tramo b { font-size: .64rem; font-weight: 650; color: #221a08; font-variant-numeric: tabular-nums; }
    .horas { flex: 0 0 3rem; text-align: right; color: var(--muted);
             font-variant-numeric: tabular-nums; }
    .sinDato { flex: 1 1 auto; font-size: .72rem; color: var(--dim); font-style: italic; }
    .faltan { flex: 0 0 auto; font-size: .68rem; color: var(--warn); cursor: help; }

    .aviso { font-size: .78rem; line-height: 1.4; color: #e8dcc0; margin: .1rem 0;
             padding-left: .5rem; border-left: 2px solid var(--warn); }
    .pie { font-size: .74rem; margin: .3rem 0 0; }

    details summary { font-size: .78rem; color: var(--muted); cursor: pointer; margin-top: .3rem; }
    table.rend { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: .4rem; }
    table.rend th, table.rend td { padding: .28rem .45rem; border-bottom: 1px solid var(--line); }
    table.rend th { font-size: .7rem; font-weight: 500; color: var(--muted); }
    table.rend th .dim { font-weight: 400; }
    table.rend .num { text-align: right; font-variant-numeric: tabular-nums; }
    table.rend tr.vacia td { opacity: .4; }
  `],
})
export class IntensidadPage {
  private store = inject(StorageService);
  private plan = inject(PlanService);
  private strava = inject(StravaService);

  readonly etiquetaSemana = etiquetaSemana;
  readonly bandas = BANDAS;
  readonly etiqueta = ETIQUETA_BANDA;
  readonly descripcion = DESCRIPCION_BANDA;
  readonly color = COLOR_BANDA;
  readonly objetivo = OBJETIVO_REPARTO;
  readonly claves = { facil: 'pctFacil', medio: 'pctMedio', duro: 'pctDuro' } as const;

  private zonas = computed<ZonaConfigurada[] | null>(() => {
    const z = this.strava.zonas()?.fc;
    if (!z?.length) return null;
    return z.map(x => ({ min: x.min, max: x.max > 0 ? x.max : null }));
  });

  readonly lunesHoy = computed(() => lunesDe(this.plan.hoy()));

  readonly semanas = computed<SemanaIntensidad[]>(() => {
    const desde = restar(this.lunesHoy(), SEMANAS * 7);
    return distribucionPorSemana(
      this.store.actividades(), this.zonas(), desde, this.plan.hoy());
  });

  /** Mas reciente arriba: es la semana sobre la que todavia se puede actuar. */
  readonly filas = computed(() => [...this.semanas()].reverse());

  readonly resumen = computed(() => resumenIntensidad(this.semanas()));

  /** Los tramos de una barra, ya sin las bandas vacias. */
  tramos(s: SemanaIntensidad): { banda: Banda; horas: number; frac: number; pct: number }[] {
    if (!s.total) return [];
    return BANDAS
      .map(banda => {
        const horas = banda === 'facil' ? s.facil : banda === 'medio' ? s.medio : s.duro;
        return { banda, horas, frac: horas / s.total, pct: (horas / s.total) * 100 };
      })
      .filter(t => t.horas > 0.004);
  }

  /** Los encabezados de la tabla de detalle, con el rango de cada zona. */
  encabezados(): { n: number; rango: string }[] {
    const z = this.zonas() ?? [];
    return z.map((x, i) => ({
      n: i + 1,
      rango: x.max === null ? `${x.min}+` : i === 0 ? `<${x.max + 1}` : `${x.min}-${x.max}`,
    }));
  }

  pct(f: number): number { return Math.round(f * 100); }
}

function restar(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  f.setUTCDate(f.getUTCDate() - dias);
  return f.toISOString().slice(0, 10);
}
