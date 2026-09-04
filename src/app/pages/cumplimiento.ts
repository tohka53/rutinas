import { Component, inject, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PlanService, fechaCorta, iso, desdeIso } from '../services/plan.service';
import { SEMANAS, INICIO_PLAN } from '../data/plan.data';
import { StorageService } from '../services/storage.service';
import { ApiService } from '../services/api.service';
import { StravaService } from '../services/strava.service';
import { SEMANA_BASE } from '../data/sesiones.data';
import {
  evaluarDia, totalizar, pct, duracion, ICONO,
  ETIQUETA_VEREDICTO, COLOR_VEREDICTO, type Actividad,
} from '../data/cumplimiento';

@Component({
  selector: 'p-cumplimiento',
  imports: [DecimalPipe],
  template: `
    <h1>Cumplimiento</h1>
    <p class="muted">
      Lo que el plan pedía contra lo que dice Strava. Un día que marcás como
      descanso sale del cálculo — descansar a propósito no es incumplir.
    </p>

    <div class="card strava" [class.vacio]="strava.estado() !== 'conectado'">
      <div class="cab">
        <div>
          <strong>
            @switch (strava.estado()) {
              @case ('conectado') { Strava conectado }
              @case ('desconectado') { Falta autorizar en Strava }
              @case ('sin-configurar') { Conectar Strava — se hace una sola vez }
              @default { Comprobando Strava… }
            }
          </strong>
          <span class="dim">
            @switch (strava.estado()) {
              @case ('conectado') {
                @if (strava.ultimoSync()) {
                  Última sincronización: {{ haceCuanto(strava.ultimoSync()!) }}.
                  Se actualiza sola al abrir la app, máximo cada 6 horas.
                } @else {
                  Todavía no se ha sincronizado nada.
                }
              }
              @case ('desconectado') {
                Las credenciales ya están guardadas. Falta darle permiso desde tu cuenta.
              }
              @case ('sin-configurar') {
                Mientras tanto ya estás viendo tu historial real de junio a septiembre:
                viene dentro de la app. Conectando Strava se actualiza solo.
              }
              @default { … }
            }
          </span>
        </div>
        <div class="acciones">
          @if (strava.estado() === 'desconectado') {
            <button class="primary" (click)="strava.conectar()">Autorizar en Strava</button>
          }
          @if (strava.estado() === 'conectado') {
            <button class="primary" (click)="sincronizar()" [disabled]="strava.sincronizando()">
              {{ strava.sincronizando() ? 'Sincronizando…' : 'Sincronizar ahora' }}
            </button>
            <button (click)="strava.desconectar()">Desconectar</button>
          }
        </div>
      </div>

      @if (strava.estado() === 'sin-configurar') {
        <ol class="pasos">
          <li>
            Abrí
            <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a>
            y creá una aplicación con estos datos:
            <table class="mini">
              <tbody>
                <tr><td>Application Name</td><td><code>Rutina 70.3</code></td></tr>
                <tr><td>Category</td><td><code>Training</code></td></tr>
                <tr><td>Website</td><td><code>https://{{ dominio() }}</code></td></tr>
                <tr><td>Authorization Callback Domain</td><td><code>{{ dominio() }}</code></td></tr>
              </tbody>
            </table>
            El callback va sin <code>https://</code> y sin barras: solo el dominio.
          </li>
          <li>
            Copiá el <strong>Client ID</strong> y el <strong>Client Secret</strong>
            — el segundo aparece al tocar <em>Show</em>.
          </li>
          <li>
            Pegalos acá abajo. Se guardan en tu Supabase, detrás del código de acceso;
            no quedan en el navegador ni hay que tocar Vercel.
          </li>
        </ol>

        <div class="form">
          <label>
            <span class="dim etiq">Client ID</span>
            <input inputmode="numeric" autocomplete="off" placeholder="123456"
                   [value]="clientId()" (input)="clientId.set(texto($event))">
          </label>
          <label>
            <span class="dim etiq">Client Secret</span>
            <input [type]="verSecret() ? 'text' : 'password'" autocomplete="off"
                   placeholder="••••••••••••" spellcheck="false"
                   [value]="clientSecret()" (input)="clientSecret.set(texto($event))">
          </label>
          <div class="acciones">
            <button class="primary" (click)="guardarCredenciales()"
                    [disabled]="strava.guardando() || !clientId().trim() || !clientSecret().trim()">
              {{ strava.guardando() ? 'Guardando…' : 'Guardar y conectar' }}
            </button>
            <button type="button" (click)="verSecret.set(!verSecret())">
              {{ verSecret() ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
        </div>
      }

      @if (strava.mensaje()) { <div class="nota">{{ strava.mensaje() }}</div> }
    </div>

    @if (!hayDatosSemana()) {
      <div class="card vacio partida">
        <strong>Esta semana todavía no tiene nada registrado.</strong>
        <p class="muted" style="margin:.35rem 0 .8rem">
          Así venías las 4 semanas antes de arrancar
          ({{ fechaCorta(partida().desde) }} – {{ fechaCorta(partida().hasta) }}),
          promedio por semana, contra lo que pide la semana 1. De ahí salió el
          volumen inicial del plan.
        </p>
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>Volumen</th><th class="num">Venías haciendo</th><th class="num">Semana 1 pide</th></tr>
            </thead>
            <tbody>
              @for (f of partida().filas; track f.etiqueta) {
                <tr>
                  <td>{{ f.etiqueta }}</td>
                  <td class="num"><strong>{{ f.real | number }}</strong></td>
                  <td class="num dim">{{ f.meta | number }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <div class="card">
      <div class="cab">
        <div>
          <h2 style="margin:0">Semana {{ sem().n }} · {{ sem().fase }}</h2>
          <span class="dim">{{ fechaCorta(sem().inicio) }} – {{ fechaCorta(sem().fin) }}</span>
        </div>
        <div class="resumen">
          <span class="n">{{ diasCumplidos() }}/{{ diasEvaluables() }}</span>
          <span class="dim">días cumplidos</span>
        </div>
      </div>

      <div class="scroll-x" style="margin-top:.9rem">
        <table>
          <thead>
            <tr><th>Volumen</th><th class="num">Hecho</th><th class="num">Objetivo</th><th>Avance</th></tr>
          </thead>
          <tbody>
            @for (f of filas(); track f.etiqueta) {
              <tr>
                <td>
                  {{ f.etiqueta }}
                  @if (f.nota) { <div class="dim sub">{{ f.nota }}</div> }
                </td>
                <td class="num"><strong>{{ f.hecho | number }}</strong></td>
                <td class="num dim">{{ f.objetivo | number }}</td>
                <td>
                  <div class="barra">
                    <div class="bar"><i [style.width.%]="min100(f.porc)"
                                        [style.background]="f.porc >= 90 ? 'var(--ok)' : f.porc >= 60 ? 'var(--warn)' : 'var(--bad)'"></i></div>
                    <span class="dim">{{ f.porc }} %</span>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    @for (d of dias(); track d.fecha) {
      <div class="card dia" [class.hoy]="d.fecha === plan.hoy()">
        <div class="cab">
          <div>
            <h3 style="margin:0">{{ d.nombre }}
              <span class="dim" style="font-weight:400">· {{ fechaCorta(d.fecha) }}</span>
            </h3>
          </div>
          <div class="acciones">
            <span class="chip" [class]="'chip ' + color(d.veredicto)">{{ etiqueta(d.veredicto) }}</span>
            @if (d.fecha <= plan.hoy()) {
              <button (click)="alternarDescanso(d.fecha)" [class.primary]="d.descanso">
                {{ d.descanso ? 'Es descanso' : 'Marcar descanso' }}
              </button>
            }
          </div>
        </div>

        <div class="cols">
          <div>
            <span class="dim etiq">Planificado</span>
            @if (d.planificadas.length) {
              @for (p of d.planificadas; track p.titulo) {
                <div class="linea" [class.falta]="d.veredicto !== 'futuro' && !d.descanso && d.faltantes.includes(norm(p.disciplina))">
                  <span class="ico">{{ icono(p.disciplina) }}</span>
                  <span>{{ p.titulo }}</span>
                </div>
              }
            } @else { <div class="linea dim">Nada</div> }
          </div>

          <div>
            <span class="dim etiq">Hecho</span>
            @if (d.hechas.length) {
              @for (a of d.hechas; track a.strava_id) {
                <div class="linea">
                  <span class="ico">{{ icono(a.disciplina) }}</span>
                  <span>
                    {{ a.nombre }}
                    <span class="dim">
                      @if (a.metros > 0) { · {{ fmtDistancia(a) }} }
                      · {{ dur(a.segundos) }}
                    </span>
                  </span>
                </div>
              }
            } @else {
              <div class="linea dim">{{ d.fecha > plan.hoy() ? 'Todavía no' : 'Sin actividad' }}</div>
            }
          </div>
        </div>

        @if (d.veredicto === 'extra' && d.fueraDePlan.length) {
          <div class="nota">
            Entrenaste {{ nombresDisciplinas(d.fueraDePlan) }}, pero no lo que tocaba hoy.
            Si fue a propósito, marcalo como descanso y deja de contar como incumplido.
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .acciones { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .resumen { text-align: right; }
    .resumen .n { font-family: var(--mono); font-size: 1.5rem; font-weight: 700; display: block; line-height: 1; }
    .resumen .dim { font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; }
    .vacio { border-color: color-mix(in srgb, var(--bici) 40%, transparent); }
    .strava { border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
    .strava.vacio { border-color: color-mix(in srgb, var(--bici) 40%, transparent); }
    .strava > .cab strong { display: block; font-size: .92rem; margin-bottom: .15rem; }
    .strava > .cab .dim { display: block; font-size: .82rem; line-height: 1.45; }
    .vacio code { font-family: var(--mono); font-size: .82rem; background: var(--surface-2);
                  padding: .1rem .3rem; border-radius: 4px; }
    .dia.hoy { border-color: color-mix(in srgb, var(--nado) 45%, transparent); }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: .7rem; }
    .etiq { display: block; font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; margin-bottom: .3rem; }
    .linea { display: flex; gap: .45rem; align-items: baseline; font-size: .85rem; padding: .2rem 0; }
    .linea.falta { opacity: .5; text-decoration: line-through; }
    .ico { flex: 0 0 auto; font-size: .95rem; }
    .barra { display: flex; align-items: center; gap: .5rem; min-width: 140px; }
    .barra .bar { flex: 1; }
    .barra .dim { font-family: var(--mono); font-size: .75rem; min-width: 38px; text-align: right; }
    .chip.dim { color: var(--dim); }
    .sub { font-size: .72rem; line-height: 1.35; margin-top: .12rem; max-width: 24ch; }
    .pasos { margin: .9rem 0 0; padding-left: 1.15rem; font-size: .85rem; line-height: 1.6; }
    .pasos li { margin-bottom: .6rem; }
    .pasos code { font-family: var(--mono); font-size: .8rem; background: var(--surface-2);
                  padding: .08rem .3rem; border-radius: 4px; }
    .mini { margin: .4rem 0; font-size: .8rem; border-collapse: collapse; }
    .mini td { padding: .18rem .6rem .18rem 0; vertical-align: top; }
    .mini td:first-child { color: var(--dim); white-space: nowrap; }
    .form { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,2fr); gap: .7rem;
            align-items: end; margin-top: .5rem; }
    .form label { display: block; }
    .form input { width: 100%; font-family: var(--mono); font-size: .85rem; }
    .form .acciones { grid-column: 1 / -1; }
    @media (max-width: 560px) { .form { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .cols { grid-template-columns: 1fr; gap: .5rem; } }
  `],
})
export class CumplimientoPage {
  plan = inject(PlanService);
  store = inject(StorageService);
  api = inject(ApiService);
  strava = inject(StravaService);
  fechaCorta = fechaCorta;
  dur = duracion;
  sem = this.plan.semanaActual;

  // Credenciales de la aplicación de Strava. Se escriben acá, se mandan al
  // servidor y no vuelven: el secret no se guarda en el navegador ni se relee.
  clientId = signal('');
  clientSecret = signal('');
  verSecret = signal(false);

  /** El dominio que pide Strava en "Authorization Callback Domain". */
  dominio = computed(() =>
    this.strava.dominio() || (typeof location === 'undefined' ? '' : location.host));

  texto(e: Event) { return (e.target as HTMLInputElement).value; }

  async guardarCredenciales() {
    const ok = await this.strava.configurar(this.clientId(), this.clientSecret());
    if (ok) { this.clientId.set(''); this.clientSecret.set(''); this.verSecret.set(false); }
  }

  constructor() {
    // Al abrir la vista se sincroniza sola, con tope de una vez cada 6 horas.
    void this.strava.sincronizarSiHaceFalta().then(hubo => {
      if (hubo) void this.store.sincronizar();
    });
  }

  async sincronizar() {
    const n = await this.strava.sincronizar();
    if (n !== null) await this.store.sincronizar();   // recarga lo que entró
  }

  /** "hace 3 horas", "hace 2 días". Mejor que una fecha cruda para esto. */
  haceCuanto(iso: string): string {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 2) return 'recién';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return `hace ${d} día${d === 1 ? '' : 's'}`;
  }

  icono(d: string) { return ICONO[d] ?? '•'; }
  etiqueta(v: any) { return ETIQUETA_VEREDICTO[v as keyof typeof ETIQUETA_VEREDICTO]; }
  color(v: any) { return COLOR_VEREDICTO[v as keyof typeof COLOR_VEREDICTO]; }
  norm(d: string) { return d === 'brick' ? 'corre' : d; }
  min100(n: number) { return Math.min(100, n); }

  fmtDistancia(a: Actividad) {
    return a.disciplina === 'nado' ? `${a.metros} m` : `${(a.metros / 1000).toFixed(1)} km`;
  }

  nombresDisciplinas(ds: string[]) {
    const n: Record<string, string> = { nado: 'natación', bici: 'bici', corre: 'carrera', fuerza: 'fuerza' };
    return ds.map(d => n[d] ?? d).join(' y ');
  }

  dias = computed(() => {
    const fechas = this.plan.fechasSemana();
    const s = this.sem();
    const acts = this.store.actividades();
    const hoy = this.plan.hoy();
    return SEMANA_BASE.map((base, i) => {
      const fecha = fechas[i];
      const planificadas = this.plan.sesionesDelDia(base.dow, s)
        .map(x => ({ disciplina: x.disciplina, titulo: x.titulo }));
      return evaluarDia(fecha, base.nombre, planificadas, acts, this.store.esDescanso(fecha), hoy);
    });
  });

  hayDatosSemana = computed(() => this.dias().some(d => d.hechas.length > 0));

  /**
   * Cómo venía entrenando en las 4 semanas previas al arranque del plan.
   *
   * Es el número con el que se calibró la semana 1, así que sirve de referencia
   * mientras no haya datos propios: la página dice algo cierto en vez de quedar
   * en blanco. Sale del historial que viaja en el bundle o de Strava, lo que haya.
   */
  partida = computed(() => {
    const lunes = desdeIso(INICIO_PLAN);
    const ini = new Date(lunes); ini.setDate(ini.getDate() - 28);
    const fin = new Date(lunes); fin.setDate(fin.getDate() - 1);
    const desde = iso(ini), hasta = iso(fin);
    const t = totalizar(this.store.actividades().filter(a => a.fecha >= desde && a.fecha <= hasta));
    const s1 = SEMANAS[0];
    const media = (n: number, dec = 0) => +(n / 4).toFixed(dec);
    return {
      desde, hasta,
      filas: [
        { etiqueta: 'Natación (m)', real: media(t.nadoM), meta: s1.nadoM , nota: '' },
        { etiqueta: 'Bici (km)', real: media(t.biciKm, 1), meta: s1.biciKm },
        { etiqueta: 'Carrera (km)', real: media(t.correKm, 1), meta: s1.correKm , nota: '' },
        { etiqueta: 'Sesiones de fuerza', real: media(t.sesionesFuerza, 1), meta: s1.crossfitDias , nota: '' },
        { etiqueta: 'Horas totales', real: media(t.horas, 1), meta: s1.horas , nota: '' },
      ],
    };
  });

  diasEvaluables = computed(() =>
    this.dias().filter(d => d.veredicto !== 'futuro' && d.veredicto !== 'descanso').length);

  diasCumplidos = computed(() =>
    this.dias().filter(d => d.veredicto === 'completo').length);

  filas = computed(() => {
    const s = this.sem();
    const fechas = new Set(this.plan.fechasSemana());
    const t = totalizar(this.store.actividades().filter(a => fechas.has(a.fecha)));
    return [
      { etiqueta: 'Natación (m)', hecho: t.nadoM, objetivo: s.nadoM, porc: pct(t.nadoM, s.nadoM) },
      { etiqueta: 'Bici (km)', hecho: t.biciKm, objetivo: s.biciKm, porc: pct(t.biciKm, s.biciKm),
        nota: t.biciIndoorN
          ? `Incluye ${t.biciIndoorKm} km estimados de ${t.biciIndoorN} sesión(es) indoor `
            + `(${t.biciIndoorH} h a 18 km/h): Strava no les da distancia.`
          : '' },
      { etiqueta: 'Carrera (km)', hecho: t.correKm, objetivo: s.correKm, porc: pct(t.correKm, s.correKm) },
      { etiqueta: 'Sesiones de fuerza', hecho: t.sesionesFuerza, objetivo: s.crossfitDias, porc: pct(t.sesionesFuerza, s.crossfitDias) },
      { etiqueta: 'Horas totales', hecho: t.horas, objetivo: s.horas, porc: pct(t.horas, s.horas) },
    ];
  });

  alternarDescanso(fecha: string) {
    this.store.marcarDescanso(fecha, !this.store.esDescanso(fecha));
  }
}
