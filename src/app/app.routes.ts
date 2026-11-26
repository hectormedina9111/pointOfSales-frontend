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
    path: 'catalog/categories/:id/attributes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/catalog/categories/category-attributes-page').then(
        (module) => module.CategoryAttributesPageComponent,
      ),
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
    path: 'sales',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sales/list/sales-list').then((module) => module.SalesListComponent),
  },
  {
    path: 'sales/orders/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sales/list/order-detail-page').then((module) => module.OrderDetailPageComponent),
  },
  {
    path: 'sales/orders/:id/return',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sales/returns/return-page').then((module) => module.ReturnPageComponent),
  },
  {
    path: 'sales/returns/lookup',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sales/returns/return-lookup-page').then((module) => module.ReturnLookupPageComponent),
  },
  {
    path: 'sales/pos',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sales/order/order-page').then((module) => module.OrderPageComponent),
  },
  {
    path: 'sales/pos/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sales/order/order-page').then((module) => module.OrderPageComponent),
  },
  {
    path: 'sales/checkout/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sales/checkout/checkout-page').then((module) => module.CheckoutPageComponent),
  },
  {
    path: 'sales/tickets/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sales/ticket/sale-ticket').then((module) => module.SaleTicketComponent),
  },
  {
    path: 'cash/session',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/cash/session/cash-session').then((module) => module.CashSessionComponent),
  },
  {
    path: 'cash/sessions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/cash/sessions/cash-sessions').then((module) => module.CashSessionsComponent),
  },
  {
    path: 'cash/registers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/cash/registers/cash-registers').then((module) => module.CashRegistersComponent),
  },
  {
    path: 'sales/payment-methods',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sales/payment-methods/payment-methods').then((module) => module.PaymentMethodsComponent),
  },
  {
    path: 'customers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/customers/customers').then((module) => module.CustomersComponent),
  },
  {
    path: 'credit-notes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/credit-notes/credit-notes').then((module) => module.CreditNotesComponent),
  },
  {
    path: 'credit-notes/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/credit-notes/credit-note-detail-page').then((module) => module.CreditNoteDetailPageComponent),
  },
  {
    path: 'inventory/stock',
    canActivate: [authGuard],
    loadComponent: () => import('./features/inventory/stock/stock-list').then((module) => module.StockListComponent),
  },
  {
    path: 'inventory/stock/:productId/:branchId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/stock/stock-detail-page').then((module) => module.StockDetailPageComponent),
  },
  {
    path: 'inventory/documents',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/documents/documents-list').then((module) => module.DocumentsListComponent),
  },
  {
    path: 'inventory/documents/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/documents/new/document-page').then((module) => module.DocumentPageComponent),
  },
  {
    path: 'inventory/documents/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/documents/document-detail-page').then(
        (module) => module.DocumentDetailPageComponent,
      ),
  },
  {
    path: 'inventory/transfers',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/transfers/transfers-list').then((module) => module.TransfersListComponent),
  },
  {
    path: 'inventory/transfers/new',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/transfers/new/transfer-page').then((module) => module.TransferPageComponent),
  },
  {
    path: 'inventory/transfers/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/transfers/transfer-detail-page').then((module) => module.TransferDetailPageComponent),
  },
  {
    path: 'inventory/transfers/:id/receive',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/transfers/receive/transfer-receive-page').then(
        (module) => module.TransferReceivePageComponent,
      ),
  },
  {
    path: 'inventory/serials',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inventory/serials/serial-search').then((module) => module.SerialSearchComponent),
  },
  // Cualquier otra dirección: página no encontrada, solo para usuarios con sesión.
  {
    path: '**',
    canActivate: [authGuard],
    data: { variant: 'notFound' },
    loadComponent: () =>
      import('./features/under-construction/under-construction').then((module) => module.UnderConstructionComponent),
  },
];
