import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../services/storage.service';
import { PlanService, iso, desdeIso, diasEntre, fechaCorta } from '../services/plan.service';
import { ANTROPOMETRIA } from '../data/nutricion.data';
import { INICIO_PLAN, SEMANAS } from '../data/plan.data';

// La curva objetivo sale del propio plan: una sola fuente de verdad. Si cambia
// el macrociclo, la gráfica cambia con él.
const CURVA = SEMANAS.map(s => ({ semana: s.n, kg: s.pesoObjetivoKg, lb: s.pesoObjetivoLb }));
const TOTAL_SEMANAS = SEMANAS.length;

const W = 720, H = 260, PAD_L = 42, PAD_R = 12, PAD_T = 14, PAD_B = 26;

@Component({
  selector: 'p-peso',
  imports: [FormsModule],
  template: `
    <h1>Peso</h1>
    <p class="muted">
      De {{ antro.pesoLb }} lb a {{ antro.metaLb }} lb. La curva cruza la meta en la
      semana {{ semanaMeta }}; de ahí en adelante la prioridad deja de ser bajar y
      pasa a ser rendir.
    </p>

    <div class="grid g4">
      <div class="stat card"><span class="n">{{ ultimo()?.kg ?? antro.pesoKg }}</span><span class="l">kg actual</span></div>
      <div class="stat card"><span class="n">{{ objetivoHoy() }}</span><span class="l">kg objetivo hoy</span></div>
      <div class="stat card">
        <span class="n" [style.color]="colorDelta()">{{ delta() > 0 ? '+' : '' }}{{ delta() }}</span>
        <span class="l">kg vs objetivo</span>
      </div>
      <div class="stat card"><span class="n">{{ faltan() }}</span><span class="l">kg para la meta</span></div>
    </div>

    <div class="card" style="margin-top:.85rem">
      <h2>Curva objetivo vs. real</h2>
      <div class="scroll-x">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="chart" role="img"
             aria-label="Gráfica de peso: curva objetivo contra registros reales">
          @for (t of ticksY(); track t.kg) {
            <line [attr.x1]="padL" [attr.x2]="W - padR" [attr.y1]="t.y" [attr.y2]="t.y" class="grid-l" />
            <text [attr.x]="padL - 6" [attr.y]="t.y + 4" class="lbl" text-anchor="end">{{ t.kg }}</text>
          }
          @for (t of ticksX(); track t.n) {
            <text [attr.x]="t.x" [attr.y]="H - 8" class="lbl" text-anchor="middle">{{ t.label }}</text>
          }
          <polyline [attr.points]="lineaObjetivo()" class="obj" />
          @if (puntosReales().length > 1) {
            <polyline [attr.points]="lineaReal()" class="real" />
          }
          @for (p of puntosReales(); track p.fecha) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" class="pt" />
          }
        </svg>
      </div>
      <div class="leyenda dim">
        <span><i class="sw obj"></i> objetivo</span>
        <span><i class="sw real"></i> tus registros</span>
        @if (!puntosReales().length) { <span>— todavía no hay registros</span> }
      </div>
    </div>

    <div class="card">
      <h2>Registrar peso</h2>
      <p class="dim">
        Pesate los sábados en ayunas, después del baño y antes de nadar. Siempre igual:
        lo que importa es la tendencia de tres semanas, no el número de un día.
      </p>
      <div class="form">
        <input type="date" [ngModel]="fecha()" (ngModelChange)="fecha.set($event)" />
        <input type="number" step="0.1" min="60" max="220" placeholder="kg"
               [ngModel]="kg()" (ngModelChange)="kg.set(+$event || null)" />
        <button class="primary" (click)="guardar()" [disabled]="!kg()">Guardar</button>
      </div>
      @if (registros().length) {
        <div class="scroll-x" style="margin-top:.8rem">
          <table>
            <thead>
              <tr><th>Fecha</th><th class="num">kg</th><th class="num">lb</th>
                  <th class="num">Δ</th><th class="num">vs objetivo</th><th></th></tr>
            </thead>
            <tbody>
              @for (r of registrosDesc(); track r.fecha) {
                <tr>
                  <td>{{ fechaCorta(r.fecha) }}</td>
                  <td class="num">{{ r.kg }}</td>
                  <td class="num">{{ r.lb }}</td>
                  <td class="num" [style.color]="r.diff !== null && r.diff < 0 ? 'var(--ok)' : 'var(--muted)'">
                    {{ r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + r.diff }}
                  </td>
                  <td class="num" [style.color]="r.vsObj <= 0 ? 'var(--ok)' : 'var(--warn)'">
                    {{ r.vsObj > 0 ? '+' : '' }}{{ r.vsObj }}
                  </td>
                  <td class="num"><button (click)="borrar(r.fecha)" class="x">×</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <div class="card">
      <h2>Cómo leer esto</h2>
      <ul class="pasos">
        <li><strong>Por encima de la línea no es fracaso.</strong> Entrenando fuerte retenés agua;
            un domingo de bici larga te puede dejar 1.5 kg arriba el lunes.</li>
        <li><strong>Tres semanas planas = ajustar.</strong> Ahí sí bajamos 150 kcal al promedio diario.</li>
        <li><strong>Más de 1 kg por semana sostenido = comer más.</strong> A esa velocidad perdés músculo
            y las sesiones del domingo se te empiezan a caer.</li>
        <li><strong>Las últimas 10 libras son las lentas.</strong> Está previsto: la curva pasa
            de 0.8 kg por semana al inicio a 0.2 en los bloques de volumen alto.</li>
        <li><strong>Después de abril se sostiene, no se persigue.</strong> Bajar durante un
            bloque de 16 h semanales te cuesta sesiones, y las sesiones son la carrera.</li>
      </ul>
    </div>
  `,
  styles: [`
    .chart { width: 100%; min-width: 480px; height: auto; }
    .grid-l { stroke: var(--line); stroke-width: 1; }
    .lbl { fill: var(--dim); font-size: 10px; font-family: var(--mono); }
    .obj { fill: none; stroke: var(--muted); stroke-width: 2; stroke-dasharray: 5 4; }
    .real { fill: none; stroke: var(--nado); stroke-width: 2.5; stroke-linejoin: round; }
    .pt { fill: var(--nado); stroke: var(--surface); stroke-width: 1.5; }
    .leyenda { display: flex; gap: 1rem; margin-top: .5rem; font-size: .78rem; flex-wrap: wrap; }
    .sw { display: inline-block; width: 14px; height: 2.5px; vertical-align: middle; margin-right: .25rem; }
    .sw.obj { background: var(--muted); } .sw.real { background: var(--nado); }
    .form { display: flex; gap: .5rem; flex-wrap: wrap; }
    .form input { flex: 1; min-width: 120px; } .form button { flex: 0 0 auto; }
    button.x { padding: .1rem .4rem; font-size: .9rem; line-height: 1; color: var(--muted); }
  `],
})
export class PesoPage {
  private store = inject(StorageService);
  private plan = inject(PlanService);
  antro = ANTROPOMETRIA;
  fechaCorta = fechaCorta;
  W = W; H = H; padL = PAD_L; padR = PAD_R;
  perdidaTotal = +(ANTROPOMETRIA.pesoKg - ANTROPOMETRIA.metaKg).toFixed(1);
  totalSemanas = TOTAL_SEMANAS;
  /** Semana en que la curva cruza la meta de 240 lb. */
  semanaMeta = CURVA.find(p => p.kg <= ANTROPOMETRIA.metaKg)?.semana ?? TOTAL_SEMANAS;

  fecha = signal<string>(iso(new Date()));
  kg = signal<number | null>(null);

  registros = computed(() => this.store.estado().pesos);

  /** Semana del plan (1-26) para una fecha dada; 0 = antes de que arranque. */
  private semanaDe(f: string): number {
    return Math.floor(diasEntre(desdeIso(INICIO_PLAN), desdeIso(f)) / 7) + 1;
  }

  private objetivoEn(sem: number): number {
    if (sem < 1) return ANTROPOMETRIA.pesoKg;
    const p = CURVA[Math.min(sem, CURVA.length) - 1];
    return p.kg;
  }

  objetivoHoy = computed(() => this.objetivoEn(this.semanaDe(this.plan.hoy())));
  ultimo = computed(() => this.registros().at(-1) ?? null);
  delta = computed(() => {
    const u = this.ultimo();
    return u ? +(u.kg - this.objetivoEn(this.semanaDe(u.fecha))).toFixed(1) : 0;
  });
  colorDelta = computed(() => this.delta() <= 0 ? 'var(--ok)' : 'var(--warn)');
  faltan = computed(() =>
    +(((this.ultimo()?.kg ?? ANTROPOMETRIA.pesoKg)) - ANTROPOMETRIA.metaKg).toFixed(1));

  // --- escalas de la gráfica ---
  private minKg = Math.min(...CURVA.map(p => p.kg)) - 3;
  private maxKg = ANTROPOMETRIA.pesoKg + 3;
  private x(sem: number) {
    return PAD_L + (sem / TOTAL_SEMANAS) * (W - PAD_L - PAD_R);
  }
  private y(kg: number) {
    const t = (kg - this.minKg) / (this.maxKg - this.minKg);
    return PAD_T + (1 - t) * (H - PAD_T - PAD_B);
  }

  ticksY = computed(() => {
    const out = [];
    for (let k = Math.ceil(this.minKg / 5) * 5; k <= this.maxKg; k += 5) {
      out.push({ kg: k, y: +this.y(k).toFixed(1) });
    }
    return out;
  });

  ticksX = computed(() =>
    [0, 9, 22, 32, 45, 59].map(n => ({
      n, x: +this.x(n).toFixed(1),
      label: n === 0 ? 'inicio' : 'S' + n,
    }))
  );

  lineaObjetivo = computed(() =>
    [`${this.x(0).toFixed(1)},${this.y(ANTROPOMETRIA.pesoKg).toFixed(1)}`]
      .concat(CURVA.map(p => `${this.x(p.semana).toFixed(1)},${this.y(p.kg).toFixed(1)}`))
      .join(' ')
  );

  puntosReales = computed(() =>
    this.registros().map(r => {
      const sem = Math.max(0, diasEntre(desdeIso(INICIO_PLAN), desdeIso(r.fecha)) / 7);
      return { ...r, x: +this.x(Math.min(sem, TOTAL_SEMANAS)).toFixed(1), y: +this.y(r.kg).toFixed(1) };
    })
  );

  lineaReal = computed(() => this.puntosReales().map(p => `${p.x},${p.y}`).join(' '));

  registrosDesc = computed(() => {
    const rs = this.registros();
    return rs.map((r, i) => ({
      ...r,
      lb: +(r.kg * 2.20462).toFixed(1),
      diff: i === 0 ? null : +(r.kg - rs[i - 1].kg).toFixed(1),
      vsObj: +(r.kg - this.objetivoEn(this.semanaDe(r.fecha))).toFixed(1),
    })).reverse();
  });

  guardar() {
    const k = this.kg();
    if (k && k > 40 && k < 250) {
      this.store.registrarPeso(this.fecha(), +k.toFixed(1));
      this.kg.set(null);
    }
  }
  borrar(f: string) { this.store.borrarPeso(f); }
}
