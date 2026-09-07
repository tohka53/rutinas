import { Component, inject, computed } from '@angular/core';
import { StorageService } from '../services/storage.service';
import { PlanService } from '../services/plan.service';
import { StravaService } from '../services/strava.service';
import { ANTROPOMETRIA } from '../data/nutricion.data';
import { mmss, etiquetaSemana } from '../data/rendimiento';
import {
  estimarVO2max, analizarZonas, estimarLTHR, zonasRecomendadas,
  nivelVO2max, PARA_QUE_SIRVE, VENTANA_VDOT_DIAS,
  type ZonaConfigurada,
} from '../data/fisiologia';

/**
 * "Tu motor": VO2max y zonas cardiacas, calculados en vivo desde Strava.
 *
 * Vive aparte de la tabla semanal porque responde otra pregunta. La tabla dice
 * como viene la semana; esto dice con que cuerpo se esta corriendo el plan, y
 * cambia cada varios meses, no cada lunes.
 *
 * Todo se recalcula desde `rutina_actividad` en cada carga. Escribir el VO2max
 * a mano en el codigo lo dejaria congelado en el dia que se escribio, que es
 * justo lo que no se quiere en el numero que decide la intensidad de 60 semanas.
 */
@Component({
  selector: 'p-motor',
  template: `
  <h2 class="sec">Tu motor</h2>
  <div class="motor">

    <!-- ------------------------------------------------------- VO2max -->
    <div class="card vo2">
      <div class="cab">
        <strong>VO2max estimado</strong>
        @if (vo2().vo2max) {
          <span class="chip">{{ nivelVO2max(vo2().vo2max!) }}</span>
        }
      </div>

      @if (vo2().vo2max; as v) {
        <div class="gran">
          <span class="n">{{ v.toFixed(1) }}</span>
          <span class="u">ml/kg/min</span>
        </div>
        <span class="l">Mejor VDOT de los últimos {{ ventanaVdot }} días</span>

        @if (vo2().litrosMin; as l) {
          <p class="cuenta">
            <strong>{{ l.toFixed(2) }} L/min</strong> en absoluto, moviendo
            {{ pesoKg() }} kg. El motor no es el problema: lo que divide es el peso.
          </p>
        }

        @if (vo2().vo2maxEnMeta; as meta) {
          <div class="proyeccion">
            <div class="fila">
              <span>Hoy, a {{ pesoKg() }} kg</span>
              <strong>{{ v.toFixed(1) }}</strong>
            </div>
            <div class="fila meta">
              <span>A {{ metaKg }} kg, mismo motor</span>
              <strong>{{ meta.toFixed(1) }}</strong>
            </div>
            <span class="gan">
              +{{ vo2().gananciaPorPeso!.toFixed(0) }} % sin entrenar un minuto extra
            </span>
          </div>
        }

        <details>
          <summary>De dónde sale ({{ vo2().carreras.length }} carrera(s))</summary>
          <table class="mini">
            <tbody>
              @for (c of vo2().carreras; track c.fecha) {
                <tr>
                  <td>{{ etiquetaSemana(c.fecha) }}</td>
                  <td class="num">{{ (c.metros / 1000).toFixed(1) }} km</td>
                  <td class="num">{{ mmss(c.ritmo) }} /km</td>
                  <td class="num"><strong>{{ c.vdot.toFixed(1) }}</strong></td>
                </tr>
              }
            </tbody>
          </table>
        </details>
      } @else {
        <p class="dim vacio">{{ vo2().advertencias[0] }}</p>
      }

      @for (a of avisosVo2(); track $index) {
        <p class="aviso">{{ a }}</p>
      }
    </div>

    <!-- -------------------------------------------------------- zonas -->
    <div class="card zonas">
      <div class="cab">
        <strong>Zonas cardíacas</strong>
        <span class="chip" [class]="'chip ' + colorVeredicto()">{{ etiquetaVeredicto() }}</span>
      </div>

      @if (zonas().sinDatos) {
        <p class="vacio">
          Ninguna actividad tiene frecuencia cardíaca guardada todavía.
        </p>
        <p class="dim">
          Strava sí la tiene: falta traerla. Corré la migración
          <code>0004</code> en Supabase y después tocá el botón.
        </p>
        <button class="primary" (click)="traerTodo()" [disabled]="strava.sincronizando()">
          {{ strava.sincronizando() ? 'Trayendo…' : 'Traer todo de nuevo' }}
        </button>
        @if (strava.mensaje()) { <p class="dim">{{ strava.mensaje() }}</p> }
      } @else {
        <div class="contraste">
          <div class="lado">
            <span class="l">Máximo que asume Strava</span>
            <span class="n">{{ zonas().maxAsumido ?? '—' }}</span>
          </div>
          <span class="vs">vs</span>
          <div class="lado real">
            <span class="l">Máximo que llegaste a hacer</span>
            <span class="n">{{ zonas().maxObservado ?? '—' }}</span>
          </div>
        </div>
        <span class="l centro">
          en {{ zonas().conFC }} de {{ zonas().total }} actividades con pulsómetro
        </span>

        @if (zonas().horasPorZona.length) {
          <table class="mini zonatabla">
            <thead>
              <tr><th>Zona</th><th class="num">Rango</th><th class="num">Horas</th></tr>
            </thead>
            <tbody>
              @for (z of filasZonas(); track z.n) {
                <tr [class.nunca]="z.horas < 0.01">
                  <td>Z{{ z.n }}</td>
                  <td class="num">{{ z.rango }}</td>
                  <td class="num">
                    @if (z.horas >= 0.01) { {{ z.horas.toFixed(1) }} }
                    @else { <span class="nunca-txt">nunca</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        @for (a of zonas().advertencias; track $index) {
          <p class="aviso">{{ a }}</p>
        }
      }
    </div>
  </div>

  <!-- --------------------- a que pulso entrenar, con las zonas que ya hay -->
  @if (zonas().veredicto === 'coherente' && zonaBase(); as zb) {
    <div class="card propuesta">
      <h2>A qué pulso entrenar</h2>
      <p class="dim">
        Tus zonas de Strava describen bien lo que entrenás, así que no hay nada que
        cambiar. Lo único que hace falta es traducirlas al plan.
      </p>
      <div class="traduccion">
        <div class="linea">
          <span class="etq">Las sesiones que el plan llama <strong>Z2</strong></span>
          <strong class="rango">{{ zb.min }} – {{ zb.max }}</strong>
        </div>
        <p class="dim">
          La bici larga del domingo, el nado continuo, el trote suave. Es donde va la
          mayor parte del plan y el error más común es pasarse: si no podés hablar en
          frases completas, vas rápido, diga lo que diga la pantalla.
        </p>
        <div class="linea">
          <span class="etq">Umbral, para series y bloques de calidad</span>
          <strong class="rango">{{ lthr().lthr ? lthr().lthr! - 4 : '—' }} – {{ lthr().lthr ?? '—' }}</strong>
        </div>
      </div>
      <p class="aviso">
        El test de 30 minutos de la semana 2 mide el umbral en vez de estimarlo, y de
        paso saca el FTP. Es la única sesión que hace falta para dejar de aproximar.
      </p>
    </div>
  }

  <!-- ------------------------------------- qué poner en Strava -->
  @if (recomendadas().length && zonas().veredicto !== 'coherente') {
    <div class="card propuesta">
      <h2>Qué poner en Strava</h2>
      <p class="dim">
        Ajustes → Mi rendimiento → Frecuencia cardíaca → zonas personalizadas.
        Estas están ancladas en tu <strong>umbral estimado de {{ lthr().lthr }} lpm</strong>,
        no en un máximo adivinado.
      </p>
      <div class="scroll-x">
        <table class="rend">
          <thead>
            <tr><th>Zona</th><th class="num">Poner</th><th>Para qué sirve</th></tr>
          </thead>
          <tbody>
            @for (z of recomendadas(); track z.n) {
              <tr>
                <td><strong>{{ z.nombre }}</strong></td>
                <td class="num rango">
                  {{ z.min === 0 ? '&lt; ' + ((z.max ?? 0) + 1) : z.min }}{{ z.max !== null && z.min !== 0 ? ' – ' + z.max : (z.max === null ? ' +' : '') }}
                </td>
                <td class="dim">{{ paraQue[z.n - 1] }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @for (a of lthr().advertencias; track $index) {
        <p class="aviso">{{ a }}</p>
      }
    </div>
  }
  `,
  styles: [`
    h2.sec { margin: 1.1rem 0 .5rem; font-size: .78rem; text-transform: uppercase;
             letter-spacing: .08em; color: var(--muted); }
    .motor { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: .7rem; }
    .motor .card { display: flex; flex-direction: column; gap: .4rem; }
    .vo2 { color: var(--corre); }
    .zonas { color: var(--nado); }
    .cab { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
    .motor .cab strong, .motor td, .motor th { color: #e9eef4; }

    .gran { display: flex; align-items: baseline; gap: .3rem; }
    .gran .n { font-size: 1.75rem; font-weight: 650; line-height: 1.05; }
    .gran .u { font-size: .78rem; color: var(--muted); }
    .l { font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }

    .cuenta { font-size: .82rem; margin: .2rem 0; color: var(--muted); }
    .cuenta strong { color: var(--corre); }

    .proyeccion { border: 1px solid var(--line); border-radius: 8px; padding: .5rem .6rem; }
    .proyeccion .fila { display: flex; justify-content: space-between; font-size: .85rem;
                        color: var(--muted); padding: .12rem 0; }
    .proyeccion .fila strong { font-variant-numeric: tabular-nums; color: #e9eef4; }
    .proyeccion .fila.meta strong { color: var(--ok); }
    .proyeccion .gan { display: block; margin-top: .3rem; font-size: .76rem; color: var(--ok); }

    .contraste { display: flex; gap: .5rem; margin-top: .2rem; }
    .contraste .lado { flex: 1; border: 1px solid var(--line); border-radius: 8px;
                       padding: .45rem .55rem; display: flex; flex-direction: column; }
    .contraste .n { font-size: 1.55rem; font-weight: 650; line-height: 1;
                    font-variant-numeric: tabular-nums; color: var(--muted); }
    .contraste .real .n { color: var(--nado); }
    .contraste .vs { align-self: center; font-size: .72rem; color: var(--muted); }
    .l.centro { text-align: center; }

    table.mini { width: 100%; border-collapse: collapse; font-size: .8rem; margin-top: .3rem; }
    table.mini td, table.mini th { padding: .22rem .35rem; border-bottom: 1px solid var(--line); }
    table.mini .num { text-align: right; font-variant-numeric: tabular-nums; }
    table.mini th { font-size: .7rem; font-weight: 500; color: var(--muted); }
    tr.nunca td { opacity: .55; }
    .nunca-txt { color: var(--bad); font-size: .74rem; }

    .aviso { font-size: .78rem; line-height: 1.4; color: #e8dcc0; margin: .1rem 0;
             padding-left: .5rem; border-left: 2px solid var(--warn); }
    .vacio { font-size: .85rem; margin: .2rem 0; }
    details summary { font-size: .78rem; color: var(--muted); cursor: pointer; }

    .traduccion { border: 1px solid var(--line); border-radius: 8px; padding: .55rem .65rem; }
    .traduccion .linea { display: flex; align-items: baseline; justify-content: space-between;
                         gap: 1rem; flex-wrap: wrap; }
    .traduccion .etq { font-size: .85rem; color: var(--muted); }
    .traduccion .rango { font-size: 1.35rem; font-variant-numeric: tabular-nums; color: var(--nado); }
    .traduccion p { margin: .3rem 0 .6rem; font-size: .8rem; line-height: 1.45; }
    .traduccion .linea + .linea { border-top: 1px solid var(--line); padding-top: .5rem; }
    .traduccion .linea + .linea .rango { color: var(--corre); font-size: 1.1rem; }

    .propuesta { margin-top: .7rem; }
    .propuesta h2 { margin: 0 0 .2rem; }
    .propuesta .rango { font-weight: 650; font-size: .95rem; white-space: nowrap; }
    .propuesta code { background: var(--surface-2); padding: 0 .25rem; border-radius: 4px; }
    table.rend { width: 100%; border-collapse: collapse; font-size: .82rem; }
    table.rend th, table.rend td { padding: .34rem .5rem; border-bottom: 1px solid var(--line); }
    table.rend td.num, table.rend th.num { text-align: right; }
  `],
})
export class MotorPage {
  private store = inject(StorageService);
  private plan = inject(PlanService);
  readonly strava = inject(StravaService);

  readonly mmss = mmss;
  readonly etiquetaSemana = etiquetaSemana;
  readonly nivelVO2max = nivelVO2max;
  readonly paraQue = PARA_QUE_SIRVE;
  readonly ventanaVdot = VENTANA_VDOT_DIAS;
  readonly metaKg = ANTROPOMETRIA.metaKg;

  constructor() {
    // Las zonas llegan con el estado de Strava, y hasta ahora eso solo lo pedia
    // la pantalla de Cumplimiento. Entrando directo aca —o por el menu— las
    // zonas quedaban en null para siempre y la tarjeta decia "sin zonas en
    // Strava" teniendolas configuradas. Se pide solo si faltan: no hace falta
    // repetir la llamada en cada navegacion.
    if (!this.strava.zonas()) void this.strava.consultarEstado();
  }

  /** El peso mas reciente registrado; si no hay, el del punto de partida. */
  readonly pesoKg = computed(() => {
    const p = this.store.estado().pesos;
    return p.length ? p[p.length - 1].kg : ANTROPOMETRIA.pesoKg;
  });

  readonly vo2 = computed(() => estimarVO2max(
    this.store.actividades(), this.plan.hoy(), this.pesoKg(), ANTROPOMETRIA.metaKg));

  /** Las advertencias del VO2max, menos la de "no hay datos" que ya se muestra sola. */
  readonly avisosVo2 = computed(() =>
    this.vo2().vo2max === null ? [] : this.vo2().advertencias);

  /**
   * Las zonas de Strava, normalizadas.
   *
   * Strava manda la ultima zona con `max: -1` para decir "sin techo". Dejarlo
   * pasar haria que ninguna FC cayera en la Z5 —todas serian mayores que -1— y
   * la zona mas alta se veria vacia por un detalle de formato, no por como
   * entrena.
   */
  private zonasConfiguradas = computed<ZonaConfigurada[] | null>(() => {
    const z = this.strava.zonas()?.fc;
    if (!z?.length) return null;
    return z.map(x => ({ min: x.min, max: x.max > 0 ? x.max : null }));
  });

  readonly zonas = computed(() =>
    analizarZonas(this.store.actividades(), this.zonasConfiguradas()));

  readonly lthr = computed(() => estimarLTHR(this.store.actividades()));

  readonly recomendadas = computed(() => {
    const l = this.lthr().lthr;
    return l ? zonasRecomendadas(l) : [];
  });

  /**
   * A que pulso hacer las sesiones que el plan llama "Z2".
   *
   * Hay dos convenciones de zonas y no dicen lo mismo. La de Strava reparte
   * porcentajes del maximo y su Z2 es la banda aerobica ancha —donde de verdad
   * va el fondo—; la de Friel reparte sobre el umbral y ahi el fondo cae entre
   * Z1 y Z2, con una Z2 estrecha. El plan usa "Z2" en el primer sentido.
   *
   * Asi que cuando las zonas de Strava ya estan bien calibradas, lo util no es
   * proponerle otra tabla: es decirle a que pulso hacer la salida del domingo,
   * leyendo el numero de la tabla que ya tiene puesta. Se toma la Z2 de Strava
   * tal cual, que es exactamente lo que el plan quiere decir.
   */
  readonly zonaBase = computed(() => {
    const z = this.zonasConfiguradas();
    if (!z || z.length < 2) return null;
    const base = z[1];
    if (base.max === null) return null;
    return { min: base.min, max: base.max };
  });

  /** Las zonas de Strava con el tiempo que se paso en cada una. */
  readonly filasZonas = computed(() => {
    const z = this.zonasConfiguradas() ?? [];
    const horas = this.zonas().horasPorZona;
    return z.map((x, i) => ({
      n: i + 1,
      rango: x.max === null ? `${x.min} +` : i === 0 ? `< ${x.max}` : `${x.min} - ${x.max}`,
      horas: horas[i] ?? 0,
    }));
  });

  etiquetaVeredicto(): string {
    switch (this.zonas().veredicto) {
      case 'sin-datos': return 'falta sincronizar';
      case 'sin-zonas': return 'sin zonas en Strava';
      case 'desalineada': return 'mal calibradas';
      default: return 'coherentes';
    }
  }

  colorVeredicto(): string {
    const v = this.zonas().veredicto;
    return v === 'desalineada' ? 'bad' : v === 'coherente' ? 'ok' : 'warn';
  }

  async traerTodo() {
    await this.strava.resincronizarTodo();
    await this.store.sincronizar();
  }
}
