import { Component, inject } from '@angular/core';
import { PlanService, fechaLarga } from '../services/plan.service';
import { PREDICCION } from '../data/nutricion.data';

@Component({
  selector: 'p-carreras',
  template: `
    <h1>Carreras</h1>
    <p class="muted">
      Los tiempos son proyecciones desde tus ritmos actuales de Strava, sin asumir mejoras.
      Todo lo que entrenés de aquí a noviembre juega a favor.
    </p>

    @for (c of carreras(); track c.id) {
      <div class="card carrera" [class.objetivo]="c.estado === 'objetivo'">
        <div class="cab">
          <div>
            <span class="chip" [class.warn]="c.estado === 'objetivo'" [class.ok]="c.estado === 'hito'">
              {{ etiqueta[c.estado] }}
            </span>
            <h2 style="margin:.45rem 0 .15rem">{{ c.nombre }}</h2>
            <span class="muted">{{ fechaLarga(c.fecha) }} · {{ c.lugar }}</span><br>
            <span class="dim">{{ c.distancias }}</span>
          </div>
          <div class="cuenta">
            @if (c.faltan >= 0) {
              <span class="n">{{ c.faltan }}</span><span class="l">días</span>
            } @else {
              <span class="l">pasada</span>
            }
          </div>
        </div>

        @if (c.desglose) {
          <div class="desglose">
            <div class="dim" style="margin-bottom:.3rem">
              Proyección: <strong style="color:var(--text)">{{ c.prediccion }}</strong>
            </div>
            <div class="segs">
              @for (s of c.desglose; track s.segmento) {
                <div class="seg">
                  <span class="dim">{{ s.segmento }}</span>
                  <span class="mono">{{ s.tiempo }}</span>
                </div>
              }
            </div>
          </div>
        }

        <ul class="pasos">@for (n of c.notas; track n) { <li>{{ n }}</li> }</ul>

        @if (c.fuente) {
          <p class="dim" style="margin:.5rem 0 0">
            Fuente: <a [href]="c.fuente" target="_blank" rel="noopener">{{ c.fuente }}</a>
          </p>
        }
      </div>
    }

    <div class="card">
      <h2>La cuenta completa del Gran Jaguar</h2>
      <p style="font-size:.9rem">
        Nadar {{ pred.half.nado }} no te preocupa: en agosto hiciste 3500 m seguidos.
        Correr {{ pred.half.corre }} tampoco: ya terminaste una media maratón.
        Los {{ pred.half.bici }} de bici son el problema — tenés una sola salida registrada,
        de 12 km. Todo el plan gira alrededor de esa brecha.
      </p>
      <div class="nota">
        Total proyectado {{ pred.half.total }}, con corte típico de 8:30.
        Hay margen, pero se sostiene solo si las salidas largas del domingo no se caen.
      </div>
    </div>
  `,
  styles: [`
    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
    .carrera.objetivo { border-color: color-mix(in srgb, var(--bici) 45%, transparent); }
    .cuenta { text-align: right; flex: 0 0 auto; }
    .cuenta .n { font-family: var(--mono); font-size: 1.9rem; font-weight: 700; display: block; line-height: 1; }
    .cuenta .l { font-size: .7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
    .desglose { margin-top: .8rem; padding-top: .7rem; border-top: 1px solid var(--line); }
    .segs { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .4rem; }
    .seg { background: var(--surface-2); border-radius: 8px; padding: .4rem .55rem; }
    .seg .dim { display: block; font-size: .72rem; }
    .seg .mono { font-size: .95rem; font-weight: 600; }
  `],
})
export class CarrerasPage {
  private plan = inject(PlanService);
  carreras = this.plan.carrerasOrdenadas;
  fechaLarga = fechaLarga;
  pred = PREDICCION;
  etiqueta: Record<string, string> = {
    objetivo: 'Objetivo', preparatoria: 'Preparatoria', opcional: 'Opcional', hito: 'Hito',
  };
}
