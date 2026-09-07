import { Component, inject, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanService, fechaCorta } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { SEMANA_BASE } from '../data/sesiones.data';
import { volumenPorSesion, sumar, etiquetaVolumen, claveSesion } from '../data/volumen';
import { totalizar, pct as porcentaje } from '../data/cumplimiento';
import { resumen, ETIQUETA_CAMPO, PASO_MIN, PASO_MAX, TECHO_FACTOR } from '../data/adaptacion';
import { TIPOS_DIA } from '../data/nutricion.data';

@Component({
  selector: 'p-semana',
  imports: [DecimalPipe, FormsModule],
  template: `
    <div class="card">
      <div class="cab">
        <div>
          <h1>Semana {{ sem().n }} · {{ sem().fase }}</h1>
          <span class="muted">{{ fechaCorta(sem().inicio) }} – {{ fechaCorta(sem().fin) }} · {{ sem().foco }}</span>
        </div>
        @if (sem().descarga) { <span class="chip warn">Descarga</span> }
      </div>
      <p class="rotulo">
        {{ algoHecho() ? 'Lo que falta esta semana' : 'Lo que pide esta semana' }}
      </p>
      <div class="grid g4">
        <div class="stat">
          <span class="n">{{ falta().nadoM | number }}</span>
          <span class="l">m nado</span>
          @if (algoHecho()) { <span class="de">de {{ sem().nadoM | number }}</span> }
        </div>
        <div class="stat">
          <span class="n">{{ falta().biciKm }}</span>
          <span class="l">km bici</span>
          @if (algoHecho()) { <span class="de">de {{ sem().biciKm }}</span> }
        </div>
        <div class="stat">
          <span class="n">{{ falta().correKm }}</span>
          <span class="l">km corriendo</span>
          @if (algoHecho()) { <span class="de">de {{ sem().correKm }}</span> }
        </div>
        <div class="stat">
          <span class="n">{{ falta().horas }}</span>
          <span class="l">horas</span>
          @if (algoHecho()) { <span class="de">de {{ sem().horas }}</span> }
        </div>
      </div>
      <div style="margin-top:.9rem">
        <div class="dim" style="display:flex;justify-content:space-between">
          <span>{{ completadas() }} de {{ total() }} sesiones marcadas</span>
          <span>{{ pct() }} %</span>
        </div>
        <div class="bar"><i [style.width.%]="pct()"></i></div>
      </div>

      <div class="adapta">
        <div class="cab">
          <div>
            <span class="rotulo" style="margin:0">El plan se ajusta a lo que entrenás</span>
            <span class="dim sub">
              @if (subidas().length) {
                Subió por lo que registraste en Strava: {{ textoSubidas() }}.
                Se revisa los domingos, junto con la programación de la semana.
                Sube entre {{ pasoMinPct }} y {{ pasoMaxPct }} % según cómo salga la semana,
                y nunca más de +{{ techoPct }} % sobre el plan original.
              } @else if (!plan.adaptar()) {
                Apagado. El plan queda como se diseñó, pase lo que pase en Strava.
              } @else {
                Todavía no subió nada. Cada domingo, al armar la semana, se revisa lo que
                registró Strava: si te pasaste de la meta el plan sube {{ pasoMinPct }} %,
                {{ pasoMedPct }} % si cumpliste la semana entera, {{ pasoMaxPct }} % si fueron dos seguidas.
              }
            </span>
          </div>
          <button (click)="plan.adaptar.set(!plan.adaptar())" [class.primary]="plan.adaptar()">
            {{ plan.adaptar() ? 'Ajuste activo' : 'Ajuste apagado' }}
          </button>
        </div>

        @if (plan.adaptar() && pasos().length) {
          <details>
            <summary class="dim sub">Ver de dónde salió ({{ pasos().length }} subida(s))</summary>
            <div class="scroll-x">
              <table>
                <thead>
                  <tr><th>Semana</th><th>Qué</th><th class="num">Pedía</th><th class="num">Hiciste</th><th class="num">Subió a</th></tr>
                </thead>
                <tbody>
                  @for (p of pasos(); track p.semana + p.campo) {
                    <tr>
                      <td>S{{ p.semana }}</td>
                      <td>
                        {{ etiqueta(p.campo) }}
                        <div class="dim sub">
                          Paso +{{ pct2(p.paso) }} % · {{ p.porQue }}@if (p.frenado) {. Hiciste más, pero se cortó acá}
                        </div>
                      </td>
                      <td class="num dim">{{ p.pedido | number }}</td>
                      <td class="num"><strong>{{ p.real | number }}</strong></td>
                      <td class="num mono">+{{ pct2(p.despues) }} %</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        }
      </div>

      <div class="strava-cmp">
        <p class="rotulo" style="margin-top:0">Lo que dice Strava</p>
        <div class="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Volumen</th>
                <th class="num">Plan</th>
                <th class="num">Strava</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (c of comparacion(); track c.etiqueta) {
                <tr>
                  <td>
                    {{ c.etiqueta }}
                    @if (c.nota) { <div class="dim sub">{{ c.nota }}</div> }
                  </td>
                  <td class="num dim">{{ c.plan | number }}</td>
                  <td class="num"><strong>{{ c.real | number }}</strong></td>
                  <td>
                    @if (c.cumplida) {
                      <span class="chip ok">Cumplida</span>
                    } @else if (semanaEnCurso()) {
                      <span class="dim mono">{{ c.porc }} %</span>
                    } @else {
                      <span class="chip dim">Meta no alcanzada</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="dim sub" style="margin:.5rem 0 0">
          Solo informativo. No mueve la barra de arriba ni el descuento de las sesiones
          — una meta no alcanzada es un dato, no una falta.
          @if (semanaEnCurso()) {
            Falta semana por delante: hasta el domingo ves el porcentaje, no el veredicto.
          }
        </p>
      </div>
    </div>

    @for (d of dias(); track d.dow) {
      <div class="card dia" [class.hoy]="d.fecha === plan.hoy()">
        <div class="cab">
          <div>
            <h2 style="margin:0">{{ d.nombre }}
              <span class="dim" style="font-weight:400">· {{ fechaCorta(d.fecha) }}</span>
            </h2>
            <span class="dim">
              Día {{ d.tipoDia }} · {{ kcal(d.tipoDia) }} kcal ·
              {{ prot(d.tipoDia) }} g proteína
            </span>
          </div>
          <div class="derecha">
            @if (d.fecha === plan.hoy()) { <span class="chip">Hoy</span> }
            @if (d.todoHecho) { <span class="chip ok">Completo</span> }
          </div>
        </div>

        @if (d.todoHecho) {
          <p class="listo">Nada pendiente hoy.</p>
        }

        @for (s of d.pendientes; track s.i) {
          <div class="sesion">
            <div class="fila">
              <input type="checkbox" [checked]="false"
                     (change)="alternar(d.fecha, s.i)"
                     [attr.aria-label]="'Marcar ' + s.titulo" />
              <button class="abrir" (click)="alternarDetalle(d.fecha, s.i)"
                      [attr.aria-expanded]="abierta(d.fecha, s.i)">
                <span class="chip" [class]="'chip ' + s.disciplina">{{ s.disciplina }}</span>
                <span class="tit">{{ s.titulo }}</span>
                @if (s.disciplina === 'fuerza' && d.wod) { <span class="vol">WOD listo</span> }
                @if (s.vol) { <span class="vol">{{ s.vol }}</span> }
                <span class="dim min">{{ s.min }}′ · {{ s.zona }}</span>
                <span class="flecha" [class.girada]="abierta(d.fecha, s.i)">▸</span>
              </button>
            </div>
            @if (abierta(d.fecha, s.i)) {
              <div class="detalle">
                @if (s.disciplina === 'fuerza' && d.wod) {
                  <!-- Con el WOD del día ya acomodado, los pasos genéricos
                       ("pasame el WOD") sobran y además se contradicen. -->
                  <pre class="wod">{{ d.wod }}</pre>
                } @else {
                  <ul class="pasos">@for (p of s.pasos; track $index) { <li>{{ p }}</li> }</ul>
                }
                @if (s.nota) { <div class="nota">{{ s.nota }}</div> }
              </div>
            }
          </div>
        }

        @if (d.hechas.length) {
          <div class="hechas">
            <button class="tira" (click)="alternarHechas(d.fecha)"
                    [attr.aria-expanded]="hechasAbiertas(d.fecha)">
              <span class="tic">✓</span>
              {{ d.hechas.length }} {{ d.hechas.length === 1 ? 'hecha' : 'hechas' }}
              <span class="flecha" [class.girada]="hechasAbiertas(d.fecha)">▸</span>
            </button>
            @if (hechasAbiertas(d.fecha)) {
              @for (s of d.hechas; track s.i) {
                <label class="fila hecha">
                  <input type="checkbox" checked (change)="alternar(d.fecha, s.i)"
                         [attr.aria-label]="'Desmarcar ' + s.titulo" />
                  <span class="chip" [class]="'chip ' + s.disciplina">{{ s.disciplina }}</span>
                  <span class="tit tachado">{{ s.titulo }}</span>
                  @if (s.vol) { <span class="vol menos">−{{ s.vol }}</span> }
                </label>
              }
            }
          </div>
        }

        @if (d.crossfit && !d.todoHecho && !d.wod) {
          <p class="dim" style="margin:.5rem 0 0">
            CrossFit esta semana: {{ sem().crossfitDias }} días. Pasame los WOD y los acomodo.
          </p>
        }
      </div>
    }

    <div class="card">
      <h2>Cómo te sentiste esta semana</h2>
      <p class="dim" style="margin:.2rem 0 .7rem">
        Esto es lo que da la señal temprana de sobreentrenamiento — antes que la balanza
        y antes que los ritmos. Lo leo los domingos.
      </p>

      <div class="escalas">
        <label>
          <span class="dim">Sueño</span>
          <select [ngModel]="nota().sueno ?? null" (ngModelChange)="cambiar('sueno', $event)">
            <option [ngValue]="null">—</option>
            @for (n of [1,2,3,4,5]; track n) { <option [ngValue]="n">{{ n }} · {{ escala[n] }}</option> }
          </select>
        </label>
        <label>
          <span class="dim">Energía</span>
          <select [ngModel]="nota().energia ?? null" (ngModelChange)="cambiar('energia', $event)">
            <option [ngValue]="null">—</option>
            @for (n of [1,2,3,4,5]; track n) { <option [ngValue]="n">{{ n }} · {{ escala[n] }}</option> }
          </select>
        </label>
      </div>

      <label class="campo">
        <span class="dim">Molestias (rodilla, espalda, Aquiles, hombro…)</span>
        <input type="text" [ngModel]="nota().molestias ?? ''" (ngModelChange)="cambiar('molestias', $event)"
               placeholder="Ninguna" />
      </label>

      <label class="campo">
        <span class="dim">Notas libres</span>
        <textarea rows="3" [ngModel]="nota().sensaciones ?? ''"
                  (ngModelChange)="cambiar('sensaciones', $event)"
                  placeholder="La bici larga se sintió pesada desde el km 40, el nado bien…"></textarea>
      </label>
    </div>
  `,
  styles: [`
    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .rotulo { margin: .9rem 0 .1rem; font-size: .72rem; color: var(--muted);
              text-transform: uppercase; letter-spacing: .06em; }
    .stat .de { display: block; font-size: .7rem; color: var(--dim);
                font-family: var(--mono); margin-top: .2rem; }
    .vol { flex: 0 0 auto; font-family: var(--mono); font-size: .75rem; color: var(--nado); }
    .vol.menos { color: var(--ok); }
    .strava-cmp { margin-top: 1rem; padding-top: .8rem; border-top: 1px dashed var(--line); }
    .adapta { margin-top: 1rem; padding-top: .8rem; border-top: 1px dashed var(--line); }
    .adapta .cab { align-items: center; }
    .adapta details { margin-top: .5rem; }
    .adapta summary { cursor: pointer; }
    .adapta table { margin-top: .4rem; }
    .sub { font-size: .74rem; line-height: 1.4; }
    .mono { font-family: var(--mono); font-size: .78rem; }
    .chip.dim { color: var(--dim); }
    .dia.hoy { border-color: color-mix(in srgb, var(--nado) 45%, transparent); }
    .sesion { border-bottom: 1px solid var(--line); }
    .sesion:last-of-type { border-bottom: none; }
    .fila { display: flex; align-items: center; gap: .55rem; padding: .45rem 0; }
    .fila input { width: auto; accent-color: var(--nado); flex: 0 0 auto; cursor: pointer; }
    .abrir { flex: 1; display: flex; align-items: center; gap: .55rem; text-align: left;
             background: none; border: none; padding: .15rem .2rem; border-radius: 6px; }
    .abrir:hover { background: var(--surface-2); border-color: transparent; }
    .tit { flex: 1; font-size: .88rem; font-weight: 400; }
    .tit.tachado { text-decoration: line-through; color: var(--dim); }
    .min { flex: 0 0 auto; font-family: var(--mono); font-size: .75rem; }
    .flecha { flex: 0 0 auto; color: var(--muted); font-size: .8rem;
              transition: transform .15s ease; display: inline-block; }
    .flecha.girada { transform: rotate(90deg); }
    .detalle { padding: 0 0 .7rem 2rem; }
    .detalle .pasos { margin-top: 0; }
    .detalle .wod { margin: 0; white-space: pre-wrap; font-family: var(--mono);
                    font-size: .78rem; line-height: 1.55; overflow-x: auto; }
    .derecha { display: flex; gap: .35rem; flex-wrap: wrap; justify-content: flex-end; }
    .listo { margin: .5rem 0 0; font-size: .85rem; color: var(--ok); }
    .hechas { margin-top: .5rem; padding-top: .5rem; border-top: 1px dashed var(--line); }
    .tira { background: none; border: none; color: var(--muted); font-size: .78rem;
            display: flex; align-items: center; gap: .35rem; padding: .15rem .2rem; }
    .tira:hover { color: var(--text); }
    .tic { color: var(--ok); font-weight: 700; }
    .fila.hecha { opacity: .55; cursor: pointer; padding-left: .2rem; }
    .fila.hecha .tit { font-size: .84rem; }
    .escalas { display: flex; gap: .7rem; flex-wrap: wrap; }
    .escalas label { flex: 1; min-width: 140px; }
    .escalas span, .campo span { display: block; font-size: .76rem; margin-bottom: .2rem; }
    .campo { display: block; margin-top: .7rem; }
    .campo textarea { font-size: .86rem; }
  `],
})
export class SemanaPage {
  plan = inject(PlanService);
  store = inject(StorageService);
  fechaCorta = fechaCorta;
  sem = this.plan.semanaActual;

  dias = computed(() => {
    const fechas = this.plan.fechasSemana();
    const s = this.sem();
    return SEMANA_BASE.map((d, i) => {
      const fecha = fechas[i];
      // `i` original se conserva en cada sesión: es la clave con la que se
      // guarda el marcado, y no puede cambiar al separar hechas de pendientes.
      const vols = this.volumenes();
      const sesiones = this.plan.sesionesDelDia(d.dow, s).map((x, i2) => ({
        ...x, i: i2, vol: etiquetaVolumen(vols.get(claveSesion(d.dow, i2))),
      }));
      const hechas = sesiones.filter(x => this.store.estaHecha(`${fecha}:${x.i}`));
      const pendientes = sesiones.filter(x => !this.store.estaHecha(`${fecha}:${x.i}`));
      return {
        ...d, fecha, sesiones, hechas, pendientes,
        todoHecho: sesiones.length > 0 && pendientes.length === 0,
        crossfit: d.sesiones.some(x => x.disciplina === 'fuerza'),
        // El WOD del box, ya acomodado contra el plan. Vive en rutina_wod.
        wod: (this.store.estado().wods[fecha] ?? '').trim(),
      };
    });
  });

  kcal(t: string) { return TIPOS_DIA[t].kcal; }
  prot(t: string) { return TIPOS_DIA[t].p; }

  /** Cuánto le toca a cada sesión del total de la semana. */
  volumenes = computed(() => volumenPorSesion(this.sem()));

  /**
   * Lo hecho se descuenta del objetivo; al desmarcar vuelve solo, porque esto
   * se recalcula desde las sesiones marcadas y no guarda un acumulado aparte.
   */
  hecho = computed(() => {
    const v = this.volumenes();
    const marcadas = this.dias().flatMap(d =>
      d.hechas.map(s => v.get(claveSesion(d.dow, s.i))).filter(x => !!x));
    return sumar(marcadas);
  });

  algoHecho = computed(() => this.completadas() > 0);

  falta = computed(() => {
    const s = this.sem(), h = this.hecho();
    const piso = (n: number, dec = 0) => {
      const r = Math.max(0, n);
      return dec ? +r.toFixed(dec) : Math.round(r);
    };
    return {
      nadoM: piso(s.nadoM - h.nadoM),
      biciKm: piso(s.biciKm - h.biciKm, 1),
      correKm: piso(s.correKm - h.correKm, 1),
      horas: piso(s.horas - h.horas, 1),
    };
  });

  // --------------------------------------------- el plan que se ajusta solo
  pasoMinPct = Math.round((PASO_MIN - 1) * 100);
  pasoMaxPct = Math.round((PASO_MAX - 1) * 100);
  techoPct = Math.round((TECHO_FACTOR - 1) * 100);

  subidas = computed(() => resumen(this.plan.adaptacion().factores));
  pasos = computed(() => this.plan.adaptacion().pasos);
  etiqueta(c: string) { return ETIQUETA_CAMPO[c as keyof typeof ETIQUETA_CAMPO]; }
  pct2(f: number) { return Math.round((f - 1) * 100); }
  pasoMedPct = Math.round(((PASO_MIN + PASO_MAX) / 2 - 1) * 100);
  textoSubidas() {
    return this.subidas().map(s => `${this.etiqueta(s.campo)} +${s.pct} %`).join(' · ');
  }

  /**
   * Si todavía faltan días, un "meta no alcanzada" el martes no dice nada.
   *
   * El corte es el domingo, no el lunes siguiente: la vista siempre muestra la
   * semana en curso, así que un veredicto que esperara al cierre no se vería
   * nunca. El domingo ya está todo el volumen sobre la mesa y es el día en que
   * se revisa la semana.
   *
   * "Cumplida" no espera a nada: si la meta ya se alcanzó el jueves, se dice.
   */
  semanaEnCurso = computed(() => this.plan.hoy() < this.sem().fin);

  /**
   * Plan contra lo que Strava registró en las fechas de esta semana.
   *
   * Es informativo a propósito: no toca el avance por sesiones. Marcar una
   * sesión es lo que uno declara haber hecho; Strava es lo que quedó grabado.
   * Cuando no coinciden, casi siempre es que algo no se registró — no que no
   * se entrenó. Por eso una meta no alcanzada se muestra en gris y sin castigo.
   */
  comparacion = computed(() => {
    const s = this.sem();
    const fechas = new Set(this.plan.fechasSemana());
    const t = totalizar(this.store.actividades().filter(a => fechas.has(a.fecha)));
    const fila = (etiqueta: string, real: number, plan: number, nota = '') => ({
      etiqueta, real, plan, nota,
      porc: porcentaje(real, plan),
      cumplida: porcentaje(real, plan) >= 95,
    });
    return [
      fila('Natación (m)', t.nadoM, s.nadoM),
      fila('Bici (km)', t.biciKm, s.biciKm, t.biciIndoorN
        ? `Incluye ${t.biciIndoorKm} km estimados de ${t.biciIndoorN} sesión(es) indoor `
          + `(${t.biciIndoorH} h a 18 km/h): Strava no les da distancia.`
        : ''),
      fila('Carrera (km)', t.correKm, s.correKm),
      fila('Sesiones de fuerza', t.sesionesFuerza, s.crossfitDias),
      fila('Horas totales', t.horas, s.horas),
    ];
  });

  total = computed(() => this.dias().reduce((a, d) => a + d.sesiones.length, 0));
  completadas = computed(() => this.dias().reduce((a, d) => a + d.hechas.length, 0));
  pct = computed(() => this.total() ? Math.round(100 * this.completadas() / this.total()) : 0);

  /** Qué sesiones están desplegadas. Solo visual, no se guarda. */
  private desplegadas = signal<Set<string>>(new Set());
  private hechasVisibles = signal<Set<string>>(new Set());

  private alternarEn(sig: typeof this.desplegadas, k: string) {
    sig.update(s => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  abierta(f: string, i: number) { return this.desplegadas().has(`${f}:${i}`); }
  alternarDetalle(f: string, i: number) { this.alternarEn(this.desplegadas, `${f}:${i}`); }

  hechasAbiertas(f: string) { return this.hechasVisibles().has(f); }
  alternarHechas(f: string) { this.alternarEn(this.hechasVisibles, f); }

  hecha(f: string, i: number) { return this.store.estaHecha(`${f}:${i}`); }
  alternar(f: string, i: number) {
    const k = `${f}:${i}`;
    const dia = this.dias().find(d => d.fecha === f);
    const s = dia?.sesiones[i];
    this.store.marcar(k, !this.store.estaHecha(k), { disciplina: s?.disciplina, titulo: s?.titulo });
  }

  // --------------------------------------------------------- nota de la semana
  escala: Record<number, string> = { 1: 'muy mal', 2: 'mal', 3: 'normal', 4: 'bien', 5: 'muy bien' };
  nota = computed(() => this.store.nota(this.sem().n));

  cambiar(campo: 'sueno' | 'energia' | 'molestias' | 'sensaciones', valor: unknown) {
    const actual = this.nota();
    const limpio = valor === '' || valor === null ? null
      : (campo === 'sueno' || campo === 'energia') ? Number(valor) : String(valor);
    this.store.guardarNota(this.sem().n, { ...actual, [campo]: limpio });
  }
}
