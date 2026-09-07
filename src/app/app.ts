import { Component, inject, computed, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PlanService, fechaCorta } from './services/plan.service';
import { ApiService } from './services/api.service';
import { StorageService } from './services/storage.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  template: `
    @if (api.conexion() === 'sin-codigo' || api.conexion() === 'rechazado') {
      <div class="puerta">
        <form class="card caja" (submit)="entrar($event)">
          <span class="mark">70.3</span>
          <h1>Rutina de Miguel</h1>
          <p class="muted">Escribí el código de acceso para sincronizar tu progreso.</p>
          <input type="password" inputmode="numeric" autocomplete="off" placeholder="Código"
                 [ngModel]="codigo()" (ngModelChange)="codigo.set($event)" name="codigo" autofocus />
          @if (api.ultimoError()) { <p class="err">{{ api.ultimoError() }}</p> }
          <button class="primary" type="submit" [disabled]="!codigo().trim()">Entrar</button>
        </form>
      </div>
    }

    <header>
      <div class="wrap top">
        <div class="brand">
          <span class="mark">70.3</span>
          <div>
            <strong>Rutina de Miguel</strong>
            <span class="dim">Dos olímpicos · dos 70.3 · 60 semanas</span>
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
        <button class="estado" [class]="'estado ' + api.conexion()" (click)="tocarEstado()"
                [title]="titulo()">
          <i></i>{{ etiqueta() }}
          @if (store.pendientes()) { <span class="badge">{{ store.pendientes() }}</span> }
        </button>
      </nav>
    </header>

    @if (api.ultimoError() && api.conexion() !== 'sin-codigo') {
      <div class="wrap">
        <div class="aviso-conexion">
          <strong>No se está guardando en la nube.</strong>
          <span>{{ api.ultimoError() }}</span>
          <button (click)="store.sincronizar()">Reintentar</button>
        </div>
      </div>
    }

    <main class="wrap"><router-outlet /></main>

    <footer class="wrap dim">
      Plan de 60 semanas · 7 sep 2026 → 31 oct 2027 · ritmos calibrados con tus datos de Strava.
      @if (api.conexion() === 'conectado') {
        Tu progreso se guarda en Supabase y se ve desde cualquier dispositivo.
      } @else {
        Sin conexión con el servidor: los cambios quedan en cola y suben al reconectar.
      }
      <button class="salir" (click)="salir()">Salir</button>
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
    nav { display: flex; gap: .15rem; overflow-x: auto; align-items: center; }
    nav a { color: var(--muted); text-decoration: none; font-size: .87rem; font-weight: 600;
            padding: .5rem .7rem; border-bottom: 2px solid transparent; white-space: nowrap; }
    nav a:hover { color: var(--text); }
    nav a.on { color: var(--text); border-bottom-color: var(--nado); }
    main { padding-top: 1.1rem; }
    footer { padding-top: 1.5rem; font-size: .78rem; border-top: 1px solid var(--line); margin-top: 2rem; }

    .estado { margin-left: auto; display: flex; align-items: center; gap: .35rem; white-space: nowrap;
              background: none; border: none; font-size: .74rem; color: var(--muted); padding: .5rem .4rem; }
    .estado i { width: 7px; height: 7px; border-radius: 99px; background: var(--dim); flex: 0 0 auto; }
    .estado.conectado i { background: var(--ok); }
    .estado.offline i, .estado.rechazado i { background: var(--warn); }
    .estado.verificando i { background: var(--nado); animation: late 1.2s ease-in-out infinite; }
    @keyframes late { 50% { opacity: .25; } }
    .badge { background: var(--warn); color: #2a1f00; border-radius: 99px; padding: 0 .32rem;
             font-weight: 700; font-size: .68rem; }

    .aviso-conexion { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
      margin-top: 1rem; padding: .6rem .8rem; border-radius: var(--r);
      background: color-mix(in srgb, var(--warn) 9%, var(--surface));
      border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent); font-size: .84rem; }
    .aviso-conexion strong { color: var(--warn); flex: 0 0 auto; }
    .aviso-conexion span { color: var(--muted); flex: 1; min-width: 200px; }
    .aviso-conexion button { flex: 0 0 auto; }

    .puerta { position: fixed; inset: 0; z-index: 100; background: var(--bg);
              display: grid; place-items: center; padding: 1rem; }
    .caja { width: min(360px, 100%); display: flex; flex-direction: column; gap: .6rem; text-align: center; }
    .caja .mark { align-self: center; }
    .caja h1 { margin: 0; font-size: 1.15rem; }
    .caja p { margin: 0; font-size: .85rem; }
    .caja input { text-align: center; font-family: var(--mono); font-size: 1.1rem; letter-spacing: .2em; }
    .err { color: var(--bad) !important; font-size: .82rem !important; }
    .caja .dim { font-size: .74rem; line-height: 1.4; }
    button.salir { background: none; border: none; color: var(--muted); font-size: .76rem;
                   text-decoration: underline; padding: 0 .3rem; margin-left: .4rem; }

    @media (max-width: 560px) { .cuentas { width: 100%; } .cuenta { flex: 1; } }
  `],
})
export class App {
  private plan = inject(PlanService);
  api = inject(ApiService);
  store = inject(StorageService);

  codigo = signal('');

  links = [
    { path: '', label: 'Hoy' },
    { path: 'semana', label: 'Semana' },
    { path: 'cumplimiento', label: 'Cumplimiento' },
    { path: 'rendimiento', label: 'Rendimiento' },
    { path: 'plan', label: 'Plan 60 sem' },
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

  etiqueta = computed(() => ({
    'sin-codigo': 'local', verificando: 'conectando', conectado: 'en la nube',
    rechazado: 'código malo', offline: 'sin conexión',
  }[this.api.conexion()]));

  titulo = computed(() => this.store.pendientes()
    ? `${this.store.pendientes()} cambio(s) sin subir. Tocá para reintentar.`
    : 'Tocá para volver a sincronizar');

  entrar(e: Event) {
    e.preventDefault();
    this.api.fijarCodigo(this.codigo());
    this.codigo.set('');
    void this.store.sincronizar();
  }

  tocarEstado() { void this.store.sincronizar(); }

  salir() {
    this.api.olvidarCodigo();
    this.codigo.set('');
  }
}
