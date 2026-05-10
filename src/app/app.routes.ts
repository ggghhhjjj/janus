import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./components/dashboard/dashboard').then((m) => m.DashboardComponent),
  },
  {
    path: 'transactions',
    loadComponent: () =>
      import('./components/transaction-table/transaction-table').then(
        (m) => m.TransactionTableComponent
      ),
  },
  {
    path: 'import',
    loadComponent: () =>
      import('./components/csv-importer/csv-importer').then((m) => m.CsvImporterComponent),
  },
  { path: '**', redirectTo: '' },
];
