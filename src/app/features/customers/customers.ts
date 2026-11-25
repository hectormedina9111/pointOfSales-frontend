import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, merge } from 'rxjs';

import { CustomerFilters, CustomerView, CustomersApi } from '../../core/api/customers-api';
import { SystemInfoService } from '../../core/system/system-info.service';
import { openConfirmDialog } from '../../shared/components/confirm-dialog/confirm-dialog';
import { PaginationComponent } from '../../shared/components/pagination/pagination';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { IfPrivilegeDirective } from '../../shared/directives/if-privilege.directive';
import { PagedList } from '../../shared/paging/paged-list';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CustomerFormComponent } from './customer-form/customer-form';

/** Pausa tras teclear antes de buscar, en milisegundos. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Listado de clientes con búsqueda (con pausa al teclear) y filtro de estado. Cualquier nodo con
 * el privilegio puede dar de alta un cliente; editar y desactivar es solo de la central. El
 * consumidor final no se edita ni se desactiva: solo muestra una marca.
 */
@Component({
  selector: 'app-customers',
  imports: [ReactiveFormsModule, TranslatePipe, ProblemAlertComponent, PaginationComponent, IfPrivilegeDirective],
  templateUrl: './customers.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(CustomersApi);
  private readonly modal = inject(NgbModal);
  private readonly fb = inject(NonNullableFormBuilder);

  /** La central edita y desactiva; una tienda solo da de alta. */
  protected readonly isCentral = inject(SystemInfoService).isCentral;

  protected readonly filterForm = this.fb.group({
    search: this.fb.control(''),
    active: this.fb.control<boolean | null>(null),
  });

  protected readonly customers = new PagedList<CustomerView>((request) => this.api.list(request, this.filters()));
  protected readonly notice = signal<string | null>(null);
  /** Error de una acción de la tabla (desactivar). El de la carga va aparte, en PagedList. */
  protected readonly actionError = signal<unknown>(null);

  constructor() {
    this.filterForm.controls.search.valueChanges
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.customers.goToPage(0));
    this.filterForm.controls.active.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.customers.goToPage(0));
  }

  ngOnInit(): void {
    this.customers.load();
  }

  protected create(): void {
    const ref = this.modal.open(CustomerFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.customer = null;
    this.afterClose(ref.result, 'customers.saved');
  }

  protected edit(customer: CustomerView): void {
    const ref = this.modal.open(CustomerFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.customer = customer;
    this.afterClose(ref.result, 'customers.saved');
  }

  protected async deactivate(customer: CustomerView): Promise<void> {
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'customers.deactivate.title',
      messageKey: 'customers.deactivate.message',
      messageParams: { name: customer.displayName },
      confirmKey: 'common.deactivate',
    });
    if (!confirmed) {
      return;
    }
    this.actionError.set(null);
    this.api.deactivate(customer.id).subscribe({
      next: () => {
        this.notice.set('customers.deactivated');
        this.customers.load();
      },
      error: (error: unknown) => this.actionError.set(error),
    });
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  /** Filtros actuales: el texto sin espacios de los extremos; un valor vacío no filtra. */
  private filters(): CustomerFilters {
    const value = this.filterForm.getRawValue();
    const search = value.search.trim();
    return {
      search: search === '' ? null : search,
      active: value.active,
    };
  }

  /** Si el diálogo se guarda, muestra el aviso y recarga la página; si se cancela, no hace nada. */
  private afterClose(result: Promise<unknown>, noticeKey: string): void {
    result.then(
      () => {
        this.notice.set(noticeKey);
        this.customers.load();
      },
      () => undefined,
    );
  }
}
