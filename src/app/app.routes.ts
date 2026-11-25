import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/session/login/login').then((module) => module.LoginComponent),
  },
  {
    path: 'change-password',
    canActivate: [authGuard],
    // Es la única ruta a la que se entra con la contraseña pendiente.
    data: { allowPendingPassword: true },
    loadComponent: () =>
      import('./features/session/change-password/change-password').then((module) => module.ChangePasswordComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/home').then((module) => module.HomeComponent),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/users/users').then((module) => module.UsersComponent),
  },
  {
    path: 'admin/roles',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/roles/roles').then((module) => module.RolesComponent),
  },
  {
    path: 'organization/countries',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/organization/countries/countries').then((module) => module.CountriesComponent),
  },
  {
    path: 'organization/company',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/organization/company/company').then((module) => module.CompanyComponent),
  },
  {
    path: 'organization/branches',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/organization/branches/branches').then((module) => module.BranchesComponent),
  },
  {
    path: 'catalog/units',
    canActivate: [authGuard],
    loadComponent: () => import('./features/catalog/units/units').then((module) => module.UnitsComponent),
  },
  {
    path: 'catalog/taxes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/catalog/taxes/taxes').then((module) => module.TaxesComponent),
  },
  {
    path: 'catalog/categories',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/categories/categories').then((module) => module.CategoriesComponent),
  },
  {
    path: 'catalog/products',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/products/products').then((module) => module.ProductsComponent),
  },
  {
    path: 'pricing/price-lists',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/pricing/price-lists/price-lists').then((module) => module.PriceListsComponent),
  },
  {
    path: 'pricing/price-lists/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/pricing/price-lists/price-list-detail').then((module) => module.PriceListDetailComponent),
  },
  {
    path: 'pricing/price-check',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/pricing/price-check/price-check').then((module) => module.PriceCheckComponent),
  },
  {
    path: 'stores/nodes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/stores/nodes/store-nodes').then((module) => module.StoreNodesComponent),
  },
  {
    path: 'stores/sync-status',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/stores/sync-status/sync-status').then((module) => module.SyncStatusComponent),
  },
  {
    path: 'audit',
    canActivate: [authGuard],
    loadComponent: () => import('./features/audit/audit-log').then((module) => module.AuditLogComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
