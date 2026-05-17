import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard';
import { TransactionTableComponent } from './components/transaction-table/transaction-table';
import { CsvImporterComponent } from './components/csv-importer/csv-importer';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: DashboardComponent,
  },
  {
    path: 'transactions',
    component: TransactionTableComponent,
  },
  {
    path: 'import',
    component: CsvImporterComponent,
  },
  { path: '**', redirectTo: '' },
];
