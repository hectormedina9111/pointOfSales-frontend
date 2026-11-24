import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

/** Rutas del menú que todavía son provisionales. Cada paso las reemplaza por su pantalla. */
const PLACEHOLDER_ROUTES: readonly { readonly path: string; readonly menuCode: string }[] = [
  { path: 'organization/countries', menuCode: 'MENU_ORGANIZATION_COUNTRIES' },
  { path: 'organization/company', menuCode: 'MENU_ORGANIZATION_COMPANY' },
  { path: 'organization/branches', menuCode: 'MENU_ORGANIZATION_BRANCHES' },
  { path: 'catalog/products', menuCode: 'MENU_CATALOG_PRODUCTS' },
  { path: 'catalog/categories', menuCode: 'MENU_CATALOG_CATEGORIES' },
  { path: 'catalog/units', menuCode: 'MENU_CATALOG_UNITS' },
  { path: 'catalog/taxes', menuCode: 'MENU_CATALOG_TAXES' },
  { path: 'pricing/price-lists', menuCode: 'MENU_PRICING_PRICE_LISTS' },
  { path: 'pricing/price-check', menuCode: 'MENU_PRICING_PRICE_CHECK' },
  { path: 'stores/nodes', menuCode: 'MENU_STORES_NODES' },
  { path: 'stores/sync-status', menuCode: 'MENU_STORES_SYNC_STATUS' },
  { path: 'audit', menuCode: 'MENU_AUDIT' },
];

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
  ...PLACEHOLDER_ROUTES.map(({ path, menuCode }) => ({
    path,
    canActivate: [authGuard],
    data: { menuCode },
    loadComponent: () =>
      import('./features/placeholder/placeholder').then((module) => module.PlaceholderComponent),
  })),
  {
    path: '**',
    redirectTo: '',
  },
];
