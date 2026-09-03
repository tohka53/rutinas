import { Component, inject, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PlanService, fechaCorta } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { SEMANA_BASE } from '../data/sesiones.data';
import { TIPOS_DIA } from '../data/nutricion.data';

@Component({
  selector: 'p-semana',
  imports: [DecimalPipe],
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
    this.store.marcar(k, !this.store.estaHecha(k));
  }
}
