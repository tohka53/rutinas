import { Component, inject, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { PlanService, fechaCorta } from './services/plan.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <div class="wrap top">
        <div class="brand">
          <span class="mark">70.3</span>
          <div>
            <strong>Rutina de Miguel</strong>
            <span class="dim">Camino al Gran Jaguar · Petén</span>
          </div>
        </div>
        <div class="cuentas">
          @for (c of destacadas(); track c.id) {
            <div class="cuenta" [class.urgente]="c.faltan <= 21">
              <span class="d">{{ c.faltan }}</span>
              <span class="dim">días · {{ c.corto }}</span>
            </div>
          }
        </div>
      </div>
      <nav class="wrap">
        @for (l of links; track l.path) {
          <a [routerLink]="l.path" routerLinkActive="on"
             [routerLinkActiveOptions]="{ exact: l.path === '' }">{{ l.label }}</a>
        }
      </nav>
    </header>

    <main class="wrap"><router-outlet /></main>

    <footer class="wrap dim">
      Plan de 26 semanas · 7 sep 2026 → 7 mar 2027 · ritmos calibrados con tus datos de Strava.
      El progreso se guarda solo en este navegador.
    </footer>
  `,
  styles: [`
    header { border-bottom: 1px solid var(--line); background: var(--surface); position: sticky; top: 0; z-index: 10; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-top: .8rem; padding-bottom: .6rem; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: .65rem; }
    .mark { font-family: var(--mono); font-weight: 700; font-size: .82rem; letter-spacing: -.02em;
            background: var(--nado); color: #04202e; padding: .3rem .45rem; border-radius: 7px; }
    .brand strong { display: block; font-size: .95rem; line-height: 1.2; }
    .brand .dim { display: block; font-size: .74rem; }
    .cuentas { display: flex; gap: .5rem; }
    .cuenta { text-align: right; background: var(--surface-2); border: 1px solid var(--line);
              border-radius: 9px; padding: .3rem .6rem; min-width: 92px; }
    .cuenta.urgente { border-color: color-mix(in srgb, var(--bici) 50%, transparent); }
    .cuenta .d { font-family: var(--mono); font-size: 1.15rem; font-weight: 700; display: block; line-height: 1.1; }
    .cuenta .dim { font-size: .68rem; }
    nav { display: flex; gap: .15rem; overflow-x: auto; padding-bottom: 0; }
    nav a { color: var(--muted); text-decoration: none; font-size: .87rem; font-weight: 600;
            padding: .5rem .7rem; border-bottom: 2px solid transparent; white-space: nowrap; }
    nav a:hover { color: var(--text); }
    nav a.on { color: var(--text); border-bottom-color: var(--nado); }
    main { padding-top: 1.1rem; }
    footer { padding-top: 1.5rem; font-size: .78rem; border-top: 1px solid var(--line); margin-top: 2rem; }
    @media (max-width: 560px) { .cuentas { width: 100%; } .cuenta { flex: 1; } }
  `],
})
export class App {
  private plan = inject(PlanService);

  links = [
    { path: '', label: 'Hoy' },
    { path: 'semana', label: 'Semana' },
    { path: 'plan', label: 'Plan 26 sem' },
    { path: 'nutricion', label: 'Nutrición' },
    { path: 'peso', label: 'Peso' },
    { path: 'carreras', label: 'Carreras' },
  ];

  destacadas = computed(() =>
    this.plan.carrerasOrdenadas()
      .filter(c => c.faltan >= 0 && c.estado !== 'opcional')
      .slice(0, 2)
      .map(c => ({ ...c, corto: fechaCorta(c.fecha) }))
  );
}
