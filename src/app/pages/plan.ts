import { Component, inject, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { SEMANAS } from '../data/plan.data';
import { PlanService, fechaCorta } from '../services/plan.service';
import { RITMOS, ZONAS_FC } from '../data/sesiones.data';
import { DECISION_SEMANA_9 } from '../data/carreras.data';

@Component({
  selector: 'p-plan',
  imports: [DecimalPipe],
  template: `
    <h1>Macrociclo de 26 semanas</h1>
    <p class="muted">
      7 sep 2026 → 7 mar 2027. Promedio de 11 h por semana, pico de 14.7 h.
      El volumen de bici es el que más sube: de 55 a 140 km semanales.
    </p>

    <div class="card">
      <div class="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Sem</th><th>Fechas</th><th>Fase</th>
              <th class="num">Nado</th><th class="num">Bici</th><th class="num">Corre</th>
              <th class="num">Horas</th><th>Sesión larga de bici</th><th class="num">Peso obj.</th>
            </tr>
          </thead>
          <tbody>
            @for (s of semanas; track s.n) {
              <tr [class.hoy]="s.n === actual().n" [class.race]="s.carrera" [class.deload]="s.descarga">
                <td class="num"><strong>{{ s.n }}</strong></td>
                <td class="dim">{{ fechaCorta(s.inicio) }}</td>
                <td>
                  {{ s.fase }}
                  @if (s.carrera) { <span class="chip warn" style="margin-left:.3rem">carrera</span> }
                </td>
                <td class="num">{{ s.nadoM | number }}</td>
                <td class="num">{{ s.biciKm }}</td>
                <td class="num">{{ s.correKm }}</td>
                <td class="num">{{ s.horas }}</td>
                <td class="dim">{{ s.biciLarga }}</td>
                <td class="num">{{ s.pesoObjetivoKg }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card decision">
      <h2>{{ dec.titulo }}</h2>
      <p class="muted">{{ dec.texto }}</p>
      @for (c of dec.criterios; track c.criterio) {
        <div class="crit">
          <span class="chip" [class.bad]="c.peso === 'Innegociable'" [class.warn]="c.peso === 'Decisivo'">
            {{ c.peso }}
          </span>
          <span>{{ c.criterio }}</span>
        </div>
      }
      <div class="nota">{{ dec.planB }}</div>
    </div>

    <div class="grid g2" style="margin-top:.85rem">
      <div class="card">
        <h2>De dónde salís y a dónde vas</h2>
        <p class="dim">Números tomados de tus actividades reales de Strava, no de promedios genéricos.</p>
        <div class="scroll-x">
          <table>
            <thead><tr><th>Métrica</th><th>Hoy</th><th>Meta</th></tr></thead>
            <tbody>
              @for (r of ritmos; track r.metrica + r.disciplina) {
                <tr>
                  <td><strong>{{ r.disciplina }}</strong><br><span class="dim">{{ r.metrica }}</span></td>
                  <td class="mono">{{ r.actual }}</td>
                  <td class="mono" style="color:var(--ok)">{{ r.meta }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>Tus zonas de frecuencia cardíaca</h2>
        <p class="dim">Las que ya tenés configuradas en Strava.</p>
        <div class="scroll-x">
          <table>
            <thead><tr><th>Zona</th><th>Rango</th><th>Para qué</th></tr></thead>
            <tbody>
              @for (z of zonas; track z.z) {
                <tr>
                  <td><strong>{{ z.z }}</strong><br><span class="dim">{{ z.nombre }}</span></td>
                  <td class="mono">{{ z.rango }}</td>
                  <td class="dim">{{ z.uso }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="nota">
          El error clásico del principiante es entrenar todo en Z3: demasiado fuerte para acumular base,
          demasiado suave para mejorar el umbral. Tus domingos van en Z2, sin excepción.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .decision { border-color: color-mix(in srgb, var(--bici) 40%, transparent); margin-top: .85rem; }
    .crit { display: flex; gap: .6rem; align-items: center; padding: .35rem 0; font-size: .88rem; }
    .crit .chip { flex: 0 0 auto; min-width: 96px; justify-content: center; }
  `],
})
export class PlanPage {
  private p = inject(PlanService);
  semanas = SEMANAS;
  ritmos = RITMOS;
  zonas = ZONAS_FC;
  dec = DECISION_SEMANA_9;
  fechaCorta = fechaCorta;
  actual = computed(() => this.p.semanaActual());
}
