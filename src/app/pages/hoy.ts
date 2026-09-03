import { Component, inject, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlanService, fechaLarga } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { REGLAS_CROSSFIT, PENDIENTES } from '../data/sesiones.data';

@Component({
  selector: 'p-hoy',
  imports: [FormsModule, RouterLink],
  template: `
    @if (plan.antesDelPlan()) {
      <div class="card aviso">
        <strong>El plan arranca el lunes 7 de septiembre.</strong>
        <p class="muted" style="margin:.4rem 0 0">
          Mientras tanto: resolvé el ajuste de la bici y conseguí un culotte con badana.
          Abajo ves cómo se va a ver un lunes cualquiera.
        </p>
      </div>
    }

    <div class="card">
      <div class="cab">
        <div>
          <h1>{{ dia().nombre }}</h1>
          <span class="muted">{{ fechaLarga(plan.hoy()) }}</span>
        </div>
        <div class="derecha">
          <span class="chip">Semana {{ sem().n }} / 26</span>
          <span class="chip" [class.warn]="sem().descarga">{{ sem().fase }}</span>
        </div>
      </div>
      <p class="foco muted">{{ sem().foco }}</p>

      <div class="grid g4" style="margin-top:.9rem">
        <div class="stat"><span class="n">{{ macros().kcal }}</span><span class="l">kcal hoy</span></div>
        <div class="stat"><span class="n">{{ macros().p }}</span><span class="l">g proteína</span></div>
        <div class="stat"><span class="n">{{ macros().c }}</span><span class="l">g carbo</span></div>
        <div class="stat"><span class="n">{{ macros().g }}</span><span class="l">g grasa</span></div>
      </div>
      <p class="dim center" style="margin:.35rem 0 0">
        Día <strong>{{ dia().tipoDia }}</strong> · el menú exacto está en
        <a routerLink="/nutricion">Nutrición</a>
      </p>
    </div>

    <h2 style="margin:1.4rem 0 .6rem">Sesiones de hoy</h2>
    @for (s of sesiones(); track $index) {
      <div class="card sesion" [class.hecha]="hecha($index)">
        <div class="cab">
          <div>
            <span class="chip" [class]="'chip ' + s.disciplina">{{ s.disciplina }}</span>
            <h3 style="margin:.45rem 0 .1rem">{{ s.titulo }}</h3>
            <span class="dim">{{ s.min }} min · {{ s.zona }}</span>
          </div>
          <button (click)="alternar($index)" [class.primary]="!hecha($index)">
            {{ hecha($index) ? 'Hecha ✓' : 'Marcar' }}
          </button>
        </div>
        <ul class="pasos">@for (p of s.pasos; track $index) { <li>{{ p }}</li> }</ul>
        @if (s.nota) { <div class="nota">{{ s.nota }}</div> }
      </div>
    }

    @if (tieneCrossfit()) {
      <div class="card">
        <h3>Pegá el WOD de hoy</h3>
        <p class="dim" style="margin:.2rem 0 .5rem">
          Lo guardo acá y en la conversación te digo qué escalar según lo que venga después.
        </p>
        <textarea rows="4" [ngModel]="wod()" (ngModelChange)="guardarWod($event)"
                  placeholder="Ej. 5 rondas: 400 m carrera, 15 thrusters 43 kg, 15 pull-ups"></textarea>
        <div class="reglas">
          @for (r of reglas; track r.regla) {
            <div class="regla"><strong>{{ r.regla }}</strong><span class="dim">{{ r.porque }}</span></div>
          }
        </div>
      </div>
    }

    @if (pendientes().length) {
      <div class="card">
        <h3>Pendientes de esta etapa</h3>
        @for (p of pendientes(); track p.item) {
          <div class="pend">
            <span class="chip warn">Sem {{ p.semana }}</span>
            <div><strong>{{ p.item }}</strong><span class="dim">{{ p.detalle }}</span></div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .derecha { display: flex; flex-direction: column; gap: .3rem; align-items: flex-end; }
    .foco { margin: .5rem 0 0; font-size: .9rem; }
    .aviso { border-color: color-mix(in srgb, var(--bici) 45%, transparent);
             background: color-mix(in srgb, var(--bici) 7%, var(--surface)); margin-bottom: .85rem; }
    .sesion.hecha { opacity: .58; }
    .sesion.hecha h3 { text-decoration: line-through; }
    .reglas { margin-top: .9rem; display: grid; gap: .45rem; }
    .regla { border-left: 2px solid var(--fuerza); padding-left: .6rem; }
    .regla strong { display: block; font-size: .85rem; font-weight: 600; }
    .regla .dim { display: block; }
    .pend { display: flex; gap: .6rem; align-items: flex-start; padding: .5rem 0; border-bottom: 1px solid var(--line); }
    .pend:last-child { border-bottom: none; }
    .pend strong { display: block; font-size: .88rem; }
    .pend .dim { display: block; }
    textarea { font-family: var(--mono); font-size: .82rem; }
  `],
})
export class HoyPage {
  plan = inject(PlanService);
  private store = inject(StorageService);
  fechaLarga = fechaLarga;
  reglas = REGLAS_CROSSFIT;

  sem = this.plan.semanaActual;
  dia = this.plan.diaBaseHoy;
  macros = this.plan.macrosHoy;
  sesiones = computed(() => this.plan.sesionesDelDia(this.plan.diaSemana(), this.sem()));
  tieneCrossfit = computed(() => this.sesiones().some(s => s.disciplina === 'fuerza'));

  pendientes = computed(() => {
    const n = this.sem().n;
    return PENDIENTES.filter(p => p.semana >= n && p.semana <= n + 2);
  });

  hecha(i: number) { return this.store.estaHecha(`${this.plan.hoy()}:${i}`); }
  alternar(i: number) {
    const k = `${this.plan.hoy()}:${i}`;
    const s = this.sesiones()[i];
    this.store.marcar(k, !this.store.estaHecha(k), { disciplina: s?.disciplina, titulo: s?.titulo });
  }
  wod = computed(() => this.store.estado().wods[this.plan.hoy()] ?? '');
  guardarWod(t: string) { this.store.guardarWod(this.plan.hoy(), t); }
}
