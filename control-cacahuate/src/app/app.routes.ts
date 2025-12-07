import { Routes } from '@angular/router';
import { CorteCajaComponent } from './features/corte-caja/corte-caja.component';

export const routes: Routes = [
  { path: 'corte-caja', component: CorteCajaComponent },

  {
    path: '',
    redirectTo: 'pos',
    pathMatch: 'full',
  },
  {
    path: 'pos',
    loadComponent: () =>
      import('./features/pos/pos.component').then((m) => m.PosComponent),
  },
  {
    path: 'produccion',
    loadComponent: () =>
      import('./features/produccion/produccion.component').then(
        (m) => m.ProduccionComponent
      ),
  },
  {
    path: 'clientes',
    loadComponent: () =>
      import('./features/clientes/clientes.component').then(
        (m) => m.ClientesComponent
      ),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'configuracion',
    loadComponent: () =>
      import('./features/configuracion/configuracion.component').then(
        (m) => m.ConfiguracionComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'pos',
  },
];
