import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/hoy').then(m => m.HoyPage), title: 'Hoy · Rutina 70.3' },
  { path: 'semana', loadComponent: () => import('./pages/semana').then(m => m.SemanaPage), title: 'Semana · Rutina 70.3' },
  { path: 'cumplimiento', loadComponent: () => import('./pages/cumplimiento').then(m => m.CumplimientoPage), title: 'Cumplimiento · Rutina 70.3' },
  { path: 'plan', loadComponent: () => import('./pages/plan').then(m => m.PlanPage), title: 'Plan 26 semanas · Rutina 70.3' },
  { path: 'nutricion', loadComponent: () => import('./pages/nutricion').then(m => m.NutricionPage), title: 'Nutrición · Rutina 70.3' },
  { path: 'peso', loadComponent: () => import('./pages/peso').then(m => m.PesoPage), title: 'Peso · Rutina 70.3' },
  { path: 'carreras', loadComponent: () => import('./pages/carreras').then(m => m.CarrerasPage), title: 'Carreras · Rutina 70.3' },
  { path: '**', redirectTo: '' },
];
