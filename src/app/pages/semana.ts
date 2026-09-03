import { Component, inject, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlanService, fechaCorta } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { SEMANA_BASE } from '../data/sesiones.data';
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
      <div class="grid g4" style="margin-top:.9rem">
        <div class="stat"><span class="n">{{ sem().nadoM | number }}</span><span class="l">m nado</span></div>
        <div class="stat"><span class="n">{{ sem().biciKm }}</span><span class="l">km bici</span></div>
        <div class="stat"><span class="n">{{ sem().correKm }}</span><span class="l">km corriendo</span></div>
        <div class="stat"><span class="n">{{ sem().horas }}</span><span class="l">horas totales</span></div>
      </div>
      <div style="margin-top:.9rem">
        <div class="dim" style="display:flex;justify-content:space-between">
          <span>{{ completadas() }} de {{ total() }} sesiones marcadas</span>
          <span>{{ pct() }} %</span>
        </div>
        <div class="bar"><i [style.width.%]="pct()"></i></div>
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
                <span class="dim min">{{ s.min }}′ · {{ s.zona }}</span>
                <span class="flecha" [class.girada]="abierta(d.fecha, s.i)">▸</span>
              </button>
            </div>
            @if (abierta(d.fecha, s.i)) {
              <div class="detalle">
                <ul class="pasos">@for (p of s.pasos; track $index) { <li>{{ p }}</li> }</ul>
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
                </label>
              }
            }
          </div>
        }

        @if (d.crossfit && !d.todoHecho) {
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
  private store = inject(StorageService);
  fechaCorta = fechaCorta;
  sem = this.plan.semanaActual;

  dias = computed(() => {
    const fechas = this.plan.fechasSemana();
    const s = this.sem();
    return SEMANA_BASE.map((d, i) => {
      const fecha = fechas[i];
      // `i` original se conserva en cada sesión: es la clave con la que se
      // guarda el marcado, y no puede cambiar al separar hechas de pendientes.
      const sesiones = this.plan.sesionesDelDia(d.dow, s).map((x, i2) => ({ ...x, i: i2 }));
      const hechas = sesiones.filter(x => this.store.estaHecha(`${fecha}:${x.i}`));
      const pendientes = sesiones.filter(x => !this.store.estaHecha(`${fecha}:${x.i}`));
      return {
        ...d, fecha, sesiones, hechas, pendientes,
        todoHecho: sesiones.length > 0 && pendientes.length === 0,
        crossfit: d.sesiones.some(x => x.disciplina === 'fuerza'),
      };
    });
  });

  kcal(t: string) { return TIPOS_DIA[t].kcal; }
  prot(t: string) { return TIPOS_DIA[t].p; }

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
