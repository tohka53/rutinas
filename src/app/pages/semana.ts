import { Component, inject, computed } from '@angular/core';
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
          @if (d.fecha === plan.hoy()) { <span class="chip">Hoy</span> }
        </div>

        @for (s of d.sesiones; track $index) {
          <label class="fila">
            <input type="checkbox" [checked]="hecha(d.fecha, $index)"
                   (change)="alternar(d.fecha, $index)" />
            <span class="chip" [class]="'chip ' + s.disciplina">{{ s.disciplina }}</span>
            <span class="tit" [class.tachado]="hecha(d.fecha, $index)">{{ s.titulo }}</span>
            <span class="dim min">{{ s.min }}′</span>
          </label>
        }
        @if (d.crossfit) {
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
    .fila { display: flex; align-items: center; gap: .55rem; padding: .45rem 0;
            border-bottom: 1px solid var(--line); cursor: pointer; }
    .fila:last-of-type { border-bottom: none; }
    .fila input { width: auto; accent-color: var(--nado); flex: 0 0 auto; }
    .tit { flex: 1; font-size: .88rem; }
    .tit.tachado { text-decoration: line-through; color: var(--dim); }
    .min { flex: 0 0 auto; font-family: var(--mono); font-size: .78rem; }
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
    return SEMANA_BASE.map((d, i) => ({
      ...d,
      fecha: fechas[i],
      sesiones: this.plan.sesionesDelDia(d.dow, s),
      crossfit: d.sesiones.some(x => x.disciplina === 'fuerza'),
    }));
  });

  kcal(t: string) { return TIPOS_DIA[t].kcal; }
  prot(t: string) { return TIPOS_DIA[t].p; }

  total = computed(() => this.dias().reduce((a, d) => a + d.sesiones.length, 0));
  completadas = computed(() =>
    this.dias().reduce((a, d) =>
      a + d.sesiones.filter((_, i) => this.store.estaHecha(`${d.fecha}:${i}`)).length, 0)
  );
  pct = computed(() => this.total() ? Math.round(100 * this.completadas() / this.total()) : 0);

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
