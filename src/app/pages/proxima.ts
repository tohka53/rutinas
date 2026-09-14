import { Component, inject, computed } from '@angular/core';
import { PlanService, fechaCorta } from '../services/plan.service';
import { StorageService } from '../services/storage.service';
import { SEMANA_BASE } from '../data/sesiones.data';
import { TIPOS_DIA } from '../data/nutricion.data';
import { volumenPorSesion, etiquetaVolumen, claveSesion } from '../data/volumen';
import { miles } from '../data/rendimiento';
import type { Semana } from '../data/plan.data';

/** Lo que se compara contra la semana en curso. */
interface Cambio {
  etiqueta: string;
  actual: string;
  proxima: string;
  pct: number | null;
  clave: 'nado' | 'bici' | 'corre' | 'horas';
}

/**
 * La semana que viene.
 *
 * No es la pantalla Semana con otra fecha, y la diferencia importa. Semana
 * responde "¿cómo voy?": marca sesiones, descuenta volumen, compara contra
 * Strava. Nada de eso existe todavía para una semana que no empezó — marcar el
 * futuro no significa nada y compararlo contra Strava da cero siempre.
 *
 * Lo que sí se puede responder por adelantado es otra cosa: qué viene, cuánto
 * sube respecto de esta semana, y si los WOD del box ya están cargados. Eso es
 * lo que se mira un jueves para saber si el sábado hay que despejar la mañana.
 */
@Component({
  selector: 'p-proxima',
  template: `
    <h1>Próxima semana</h1>

    @if (!sem()) {
      <p class="muted">Estás en la última semana del macrociclo: no hay una siguiente.</p>
    } @else {
      <p class="muted">
        Lo que viene, y cuánto cambia respecto de la semana en curso. Acá no se marca
        nada — para eso está <strong>Semana</strong>, cuando llegue.
      </p>

      <!-- ------------------------------------------------------- encabezado -->
      <div class="card cab">
        <div class="titulo">
          <div>
            <span class="n">Semana {{ sem()!.n }}</span>
            <span class="dim">{{ fechaCorta(sem()!.inicio) }} – {{ fechaCorta(sem()!.fin) }}</span>
          </div>
          <div class="chips">
            @if (sem()!.carrera) { <span class="chip bad">semana de carrera</span> }
            @else if (sem()!.descarga) { <span class="chip ok">descarga</span> }
            <span class="chip">{{ sem()!.bloque }}</span>
            <span class="chip">en {{ faltanDias() }} días</span>
          </div>
        </div>
        <p class="foco">{{ sem()!.foco }}</p>

        <div class="grid g4 metas">
          <div class="stat">
            <span class="n">{{ miles(sem()!.nadoM) }}</span><span class="l">m de nado</span>
          </div>
          <div class="stat">
            <span class="n">{{ sem()!.biciKm }}</span><span class="l">km de bici</span>
          </div>
          <div class="stat">
            <span class="n">{{ sem()!.correKm }}</span><span class="l">km corriendo</span>
          </div>
          <div class="stat">
            <span class="n">{{ sem()!.horas }}</span><span class="l">horas</span>
          </div>
        </div>
      </div>

      <!-- --------------------------------------------------- qué cambia -->
      <div class="card">
        <h2>Qué cambia respecto de esta semana</h2>
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th></th><th class="num">Esta</th><th class="num">Próxima</th><th class="num">Cambio</th></tr>
            </thead>
            <tbody>
              @for (c of cambios(); track c.clave) {
                <tr>
                  <td><strong>{{ c.etiqueta }}</strong></td>
                  <td class="num dim">{{ c.actual }}</td>
                  <td class="num">{{ c.proxima }}</td>
                  <td class="num">
                    @if (c.pct === null) { <span class="dim">—</span> }
                    @else {
                      <span [class]="'delta ' + (c.pct > 0 ? 'sube' : c.pct < 0 ? 'baja' : 'igual')">
                        {{ c.pct > 0 ? '+' : '' }}{{ c.pct }}%
                      </span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (aviso(); as a) { <p class="nota">{{ a }}</p> }
      </div>

      <!-- ------------------------------------------------------ día por día -->
      <div class="dias">
        @for (d of dias(); track d.fecha) {
          <div class="card dia" [class.descanso]="!d.sesiones.length">
            <div class="cab-dia">
              <div>
                <strong>{{ d.nombre }}</strong>
                <span class="dim">{{ fechaCorta(d.fecha) }}</span>
              </div>
              <span class="kcal dim">{{ kcal(d.tipoDia) }} kcal · {{ prot(d.tipoDia) }} g prot</span>
            </div>

            @if (!d.sesiones.length) {
              <p class="dim vacio">Descanso.</p>
            } @else {
              @for (s of d.sesiones; track s.i) {
                <div class="ses">
                  <div class="ses-cab">
                    <span class="pill" [class]="'pill ' + s.disciplina"></span>
                    <strong>{{ s.titulo }}</strong>
                    @if (s.vol) { <span class="vol">{{ s.vol }}</span> }
                    <span class="dim min">{{ s.min }}'</span>
                  </div>
                  @if (s.disciplina === 'fuerza' && d.wod) {
                    <pre class="wod">{{ d.wod }}</pre>
                  } @else {
                    <ul class="pasos">@for (p of s.pasos; track $index) { <li>{{ p }}</li> }</ul>
                  }
                </div>
              }
            }
          </div>
        }
      </div>

      <!-- ------------------------------------------------------ los WOD -->
      <div class="card">
        <h2>WOD del box</h2>
        @if (diasConWod() === 0) {
          <p class="vacio">
            Todavía no hay ninguno cargado para esta semana.
          </p>
          <p class="dim">
            Subí el PDF de la programación en el chat del proyecto y la tarea los escribe
            sola, de lunes a viernes. Hasta entonces, los días de CrossFit muestran la
            sesión genérica del plan.
          </p>
        } @else {
          <p class="dim">
            <strong>{{ diasConWod() }} de 5</strong> días de CrossFit ya tienen el WOD del box
            acomodado contra el plan.
            @if (diasConWod() < 5) { Los que faltan muestran la sesión genérica. }
          </p>
        }
      </div>
    }
  `,
  styles: [`
    .cab { display: flex; flex-direction: column; gap: .5rem; }
    .titulo { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .titulo .n { font-size: 1.3rem; font-weight: 650; margin-right: .5rem; }
    .chips { display: flex; gap: .35rem; flex-wrap: wrap; }
    .foco { margin: 0; font-size: .9rem; color: var(--muted); }
    .metas { margin-top: .3rem; }
    .metas .stat { border: 1px solid var(--line); border-radius: 8px; padding: .5rem .6rem;
                   display: flex; flex-direction: column; }
    .metas .n { font-size: 1.3rem; font-weight: 650; font-variant-numeric: tabular-nums; }
    .metas .l { font-size: .68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }

    table { width: 100%; border-collapse: collapse; font-size: .85rem; }
    th, td { padding: .35rem .5rem; border-bottom: 1px solid var(--line); }
    th { font-size: .7rem; font-weight: 500; color: var(--muted); }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .delta { font-weight: 650; }
    .delta.sube { color: var(--bici); }
    .delta.baja { color: var(--ok); }
    .delta.igual { color: var(--muted); }

    .dias { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
            gap: .7rem; margin-top: .85rem; }
    .dia { display: flex; flex-direction: column; gap: .45rem; }
    .dia.descanso { opacity: .6; }
    .cab-dia { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
    .cab-dia .dim { margin-left: .35rem; font-size: .78rem; }
    .kcal { font-size: .72rem; white-space: nowrap; }

    .ses { border-top: 1px solid var(--line); padding-top: .4rem; }
    .ses-cab { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
    .pill { width: 8px; height: 8px; border-radius: 2px; flex: 0 0 auto; }
    .pill.nado { background: var(--nado); } .pill.bici { background: var(--bici); }
    .pill.corre { background: var(--corre); } .pill.fuerza { background: var(--fuerza); }
    .pill.brick { background: var(--brick); } .pill.descanso { background: var(--muted); }
    .ses-cab .min { font-size: .72rem; margin-left: auto; }
    .vol { font-size: .7rem; padding: .05rem .35rem; border-radius: 999px;
           border: 1px solid var(--line); color: var(--muted); }

    ul.pasos { margin: .3rem 0 0; padding-left: 1.1rem; }
    ul.pasos li { font-size: .82rem; margin-bottom: .18rem; }
    pre.wod { margin: .3rem 0 0; padding: .5rem .6rem; background: var(--surface-2);
              border-radius: 6px; font-family: var(--mono); font-size: .74rem;
              white-space: pre-wrap; line-height: 1.45; overflow-x: auto; }
    .vacio { font-size: .85rem; margin: .2rem 0; }
  `],
})
export class ProximaPage {
  private plan = inject(PlanService);
  private store = inject(StorageService);

  readonly fechaCorta = fechaCorta;
  readonly miles = miles;

  readonly sem = this.plan.semanaProxima;
  private actual = this.plan.semanaActual;

  readonly faltanDias = computed(() => {
    const s = this.sem();
    if (!s) return 0;
    const ms = new Date(s.inicio + 'T12:00:00Z').getTime()
             - new Date(this.plan.hoy() + 'T12:00:00Z').getTime();
    return Math.max(0, Math.round(ms / 86400000));
  });

  private volumenes = computed(() => {
    const s = this.sem();
    return s ? volumenPorSesion(s) : new Map();
  });

  readonly dias = computed(() => {
    const s = this.sem();
    if (!s) return [];
    const fechas = this.plan.fechasDe(s);
    const vols = this.volumenes();
    const wods = this.store.estado().wods;
    return SEMANA_BASE.map((d, i) => {
      const fecha = fechas[i];
      const sesiones = this.plan.sesionesDelDia(d.dow, s)
        .map((x, i2) => ({ ...x, i: i2, vol: etiquetaVolumen(vols.get(claveSesion(d.dow, i2))) }))
        .filter(x => x.disciplina !== 'descanso');
      return { ...d, fecha, sesiones, wod: (wods[fecha] ?? '').trim() };
    });
  });

  /** Cuántos días de CrossFit de la próxima semana ya tienen WOD escrito. */
  readonly diasConWod = computed(() =>
    this.dias().filter(d => d.wod && d.sesiones.some(s => s.disciplina === 'fuerza')).length);

  readonly cambios = computed<Cambio[]>(() => {
    const a = this.actual(), p = this.sem();
    if (!p) return [];
    const pct = (x: number, y: number) => x === 0 ? null : Math.round(((y - x) / x) * 100);
    return [
      { clave: 'nado', etiqueta: 'Natación', actual: miles(a.nadoM) + ' m',
        proxima: miles(p.nadoM) + ' m', pct: pct(a.nadoM, p.nadoM) },
      { clave: 'bici', etiqueta: 'Bici', actual: a.biciKm + ' km',
        proxima: p.biciKm + ' km', pct: pct(a.biciKm, p.biciKm) },
      { clave: 'corre', etiqueta: 'Carrera', actual: a.correKm + ' km',
        proxima: p.correKm + ' km', pct: pct(a.correKm, p.correKm) },
      { clave: 'horas', etiqueta: 'Horas', actual: a.horas + ' h',
        proxima: p.horas + ' h', pct: pct(a.horas, p.horas) },
    ];
  });

  /**
   * Una línea sobre el cambio, cuando hay algo que decir.
   *
   * Una semana de descarga que baja los números no es un retroceso y conviene
   * decirlo: si no, el -30 % se lee como un error del plan.
   */
  readonly aviso = computed<string | null>(() => {
    const p = this.sem();
    if (!p) return null;
    if (p.carrera) {
      return 'Es semana de carrera: el volumen baja a propósito y lo que importa es llegar fresco.';
    }
    if (p.descarga) {
      return 'Es semana de descarga. Bajar acá es parte del plan, no un retroceso: ' +
             'la adaptación ocurre cuando la carga afloja.';
    }
    const horas = this.cambios().find(c => c.clave === 'horas')?.pct ?? 0;
    if (horas >= 15) {
      return `Sube ${horas}% en horas. Es un salto grande: si esta semana quedó corta, ` +
             'el punto de partida real es lo que hiciste, no lo que pedía el plan.';
    }
    return null;
  });

  kcal(t: string) { return TIPOS_DIA[t].kcal; }
  prot(t: string) { return TIPOS_DIA[t].p; }
}
