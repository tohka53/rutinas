import { Component, inject, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PlanService, fechaCorta } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { ApiService } from '../services/api.service';
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

    @if (!store.actividades().length) {
      <div class="card vacio">
        <strong>Todavía no hay actividades importadas.</strong>
        <p class="muted" style="margin:.4rem 0 0">
          @if (api.conexion() === 'conectado') {
            Corré <code>scripts/importar-strava.mjs</code> para traer tu historial.
          } @else {
            Esta vista necesita la sincronización con Supabase activa. Mientras tanto
            podés marcar las sesiones a mano en <strong>Semana</strong>.
          }
        </p>
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
                <td>{{ f.etiqueta }}</td>
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
                <div class="linea" [class.falta]="d.faltantes.includes(norm(p.disciplina)) && !d.descanso">
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
    @media (max-width: 560px) { .cols { grid-template-columns: 1fr; gap: .5rem; } }
  `],
})
export class CumplimientoPage {
  plan = inject(PlanService);
  store = inject(StorageService);
  api = inject(ApiService);
  fechaCorta = fechaCorta;
  dur = duracion;
  sem = this.plan.semanaActual;

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
      { etiqueta: 'Bici (km)', hecho: t.biciKm, objetivo: s.biciKm, porc: pct(t.biciKm, s.biciKm) },
      { etiqueta: 'Carrera (km)', hecho: t.correKm, objetivo: s.correKm, porc: pct(t.correKm, s.correKm) },
      { etiqueta: 'Sesiones de fuerza', hecho: t.sesionesFuerza, objetivo: s.crossfitDias, porc: pct(t.sesionesFuerza, s.crossfitDias) },
      { etiqueta: 'Horas totales', hecho: t.horas, objetivo: s.horas, porc: pct(t.horas, s.horas) },
    ];
  });

  alternarDescanso(fecha: string) {
    this.store.marcarDescanso(fecha, !this.store.esDescanso(fecha));
  }
}
