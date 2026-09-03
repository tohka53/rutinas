import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { PlanService } from '../services/plan.service';
import { TIPOS_DIA, MENUS, ALIMENTOS, ANTROPOMETRIA, TDEE_POR_DIA } from '../data/nutricion.data';

@Component({
  selector: 'p-nutricion',
  imports: [FormsModule, DecimalPipe],
  template: `
    <h1>Nutrición</h1>
    <p class="muted">
      Cuatro tipos de día según lo que entrenás. El promedio semanal queda en
      {{ antro.kcalPromedioPlan | number }} kcal contra un gasto estimado de
      {{ antro.tdeePromedio | number }}.
    </p>

    <div class="card">
      <h2>Por qué no es un número fijo</h2>
      <p style="font-size:.9rem">
        Un domingo con bici larga y trote quemás cerca de {{ tdee['domingo'] | number }} kcal;
        un viernes de solo CrossFit, {{ tdee['viernes'] | number }}. Comer lo mismo los dos días
        significa pasarte un día y quedarte corto el otro, y quedarse corto el domingo es
        justamente lo que te hace abandonar la salida larga.
      </p>
      <div class="nota">
        Estos números son un punto de partida calculado, no una verdad. La balanza manda:
        si en tres semanas seguidas no baja nada, le quitamos 150 kcal al promedio diario.
        Si baja más de 1 kg por semana de forma sostenida, le sumamos — perder tan rápido
        con este volumen te va a costar músculo y sesiones.
      </div>
    </div>

    <h2 style="margin:1.4rem 0 .6rem">Elegí el tipo de día</h2>
    <div class="tabs">
      @for (t of tipos; track t) {
        <button [class.primary]="sel() === t" (click)="sel.set(t)">
          {{ t }} <span class="dim">{{ objetivo(t).kcal }}</span>
        </button>
      }
    </div>
    <p class="dim">{{ cuando[sel()] }}</p>

    <div class="grid g4" style="margin-top:.6rem">
      <div class="stat"><span class="n">{{ objetivo(sel()).kcal | number }}</span><span class="l">kcal</span></div>
      <div class="stat"><span class="n">{{ objetivo(sel()).p }}</span><span class="l">g proteína</span></div>
      <div class="stat"><span class="n">{{ objetivo(sel()).c }}</span><span class="l">g carbo</span></div>
      <div class="stat"><span class="n">{{ objetivo(sel()).g }}</span><span class="l">g grasa</span></div>
    </div>

    @for (c of menu(); track c.nombre) {
      <div class="card comida">
        <div class="cab">
          <div><h3 style="margin:0">{{ c.nombre }}</h3><span class="dim">{{ c.hora }}</span></div>
          <div class="mac dim">
            <strong style="color:var(--text)">{{ c.kcal }}</strong> kcal ·
            P {{ c.p }} · C {{ c.c }} · G {{ c.g }}
          </div>
        </div>
        <ul class="pasos">
          @for (i of c.items; track i.alimento) {
            <li>{{ i.g }} g — {{ i.alimento }}</li>
          }
        </ul>
      </div>
    }

    <div class="card">
      <h2>Sustituciones</h2>
      <p class="dim">
        Todo se puede cambiar mientras se respeten las columnas. Los precios varían,
        así que la última columna es solo una guía de qué suele salir más barato.
      </p>
      <div class="scroll-x">
        <table>
          <thead>
            <tr>
              <th>Alimento (por 100 g)</th><th class="num">kcal</th>
              <th class="num">P</th><th class="num">C</th><th class="num">G</th><th>Costo</th>
            </tr>
          </thead>
          <tbody>
            @for (a of alimentos; track a.nombre) {
              <tr>
                <td>{{ a.nombre }}</td>
                <td class="num">{{ a.kcal }}</td>
                <td class="num">{{ a.p }}</td>
                <td class="num">{{ a.c }}</td>
                <td class="num">{{ a.g }}</td>
                <td><span class="chip" [class.ok]="a.costo === 'barato'">{{ a.costo }}</span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Calculadora rápida</h2>
      <p class="dim">Para cuando cambiés una porción y quieras saber en qué queda.</p>
      <div class="calc">
        <select [ngModel]="alimentoSel()" (ngModelChange)="alimentoSel.set($event)">
          @for (a of alimentos; track a.nombre) { <option [value]="a.nombre">{{ a.nombre }}</option> }
        </select>
        <input type="number" [ngModel]="gramos()" (ngModelChange)="gramos.set(+$event || 0)"
               min="0" step="10" />
        <span class="dim">gramos</span>
      </div>
      @if (calculado(); as r) {
        <div class="grid g4" style="margin-top:.7rem">
          <div class="stat"><span class="n">{{ r.kcal }}</span><span class="l">kcal</span></div>
          <div class="stat"><span class="n">{{ r.p }}</span><span class="l">g proteína</span></div>
          <div class="stat"><span class="n">{{ r.c }}</span><span class="l">g carbo</span></div>
          <div class="stat"><span class="n">{{ r.g }}</span><span class="l">g grasa</span></div>
        </div>
      }
    </div>

    <div class="card">
      <h2>Reglas que importan más que el menú</h2>
      <ul class="pasos">
        <li><strong>Proteína primero.</strong> Los {{ objetivo('medio').p }} g diarios no se negocian:
            son los que hacen que bajes grasa y no el músculo que ya tenés.</li>
        <li><strong>Los carbos rodean el entrenamiento.</strong> Antes y después. En el resto del día
            son los primeros que se recortan.</li>
        <li><strong>Comé arriba de la bici.</strong> 60–80 g de carbohidrato por hora desde la primera hora.
            Un banano y pan francés cumplen igual que un gel de Q30.</li>
        <li><strong>Agua y sal.</strong> A 127 kg y en Guatemala sudás mucho: 500–750 ml por hora,
            con sal si la salida pasa de dos horas.</li>
        <li><strong>Sos programador.</strong> Ocho horas sentado son ocho horas sin gastar nada.
            Levantate cada hora aunque sea a llenar el vaso: eso solo ya suma unas 150 kcal al día.</li>
      </ul>
    </div>
  `,
  styles: [`
    .tabs { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: .4rem; }
    .tabs button { text-transform: capitalize; }
    .tabs .dim { font-family: var(--mono); font-size: .75rem; margin-left: .25rem; }
    .tabs button.primary .dim { color: #04202e; opacity: .75; }
    .cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .mac { font-size: .8rem; font-family: var(--mono); }
    .comida { margin-top: .6rem; }
    .calc { display: flex; gap: .5rem; align-items: center; }
    .calc select { flex: 3; } .calc input { flex: 1; min-width: 80px; }
    .calc .dim { flex: 0 0 auto; }
  `],
})
export class NutricionPage {
  private plan = inject(PlanService);
  antro = ANTROPOMETRIA;
  tdee = TDEE_POR_DIA;
  alimentos = ALIMENTOS;
  tipos = ['ligero', 'medio', 'fuerte', 'grande'];
  cuando: Record<string, string> = {
    ligero: 'Viernes: solo CrossFit y un trote suave.',
    medio: 'Lunes y miércoles: natación de 45 min más CrossFit.',
    fuerte: 'Martes, jueves y sábado: spinning con CrossFit, o la natación larga.',
    grande: 'Domingo: bici larga en ruta más el trote al bajar.',
  };

  sel = signal<string>(this.plan.diaBaseHoy().tipoDia);
  alimentoSel = signal<string>(ALIMENTOS[0].nombre);
  gramos = signal<number>(100);

  objetivo(t: string) { return TIPOS_DIA[t]; }
  menu = computed(() => MENUS[this.sel()]);

  calculado = computed(() => {
    const a = ALIMENTOS.find(x => x.nombre === this.alimentoSel());
    const g = this.gramos();
    if (!a || !isFinite(g) || g < 0) return null;
    const f = g / 100;
    return {
      kcal: Math.round(a.kcal * f), p: +(a.p * f).toFixed(1),
      c: +(a.c * f).toFixed(1), g: +(a.g * f).toFixed(1),
    };
  });
}
