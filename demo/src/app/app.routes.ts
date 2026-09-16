import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'native-glass-poc',
    loadComponent: () => import('./native-glass-poc/native-glass-poc.page').then((m) => m.NativeGlassPocPage),
  },
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
