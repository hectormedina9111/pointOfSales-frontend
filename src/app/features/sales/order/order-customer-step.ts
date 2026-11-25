import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { EMPTY, Observable, catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs';

import { CustomerView, CustomersApi } from '../../../core/api/customers-api';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { CustomerFormComponent } from '../../customers/customer-form/customer-form';
import { FINAL_CONSUMER, OrderCustomer, OrderDraftStore, orderCustomerOf } from './order-draft.store';

/** Pausa tras teclear antes de buscar, en milisegundos. */
const SEARCH_DEBOUNCE_MS = 300;

/** Clientes que muestra la lista de resultados. */
const SEARCH_SIZE = 10;

/**
 * Paso 1 de la orden: el cliente. Busca clientes activos, elige uno, o usa el consumidor final.
 * Dar de alta un cliente abre el formulario y lo selecciona al guardar. El cliente siempre tiene
 * valor (por defecto, el consumidor final), así que el paso siempre se puede avanzar.
 */
@Component({
  selector: 'app-order-customer-step',
  imports: [ReactiveFormsModule, ProblemAlertComponent, FieldLabelComponent, IfPrivilegeDirective, TranslatePipe],
  templateUrl: './order-customer-step.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderCustomerStepComponent {
  private readonly customers = inject(CustomersApi);
  private readonly modal = inject(NgbModal);
  protected readonly store = inject(OrderDraftStore);

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly searching = signal(false);
  protected readonly searchError = signal<unknown>(null);
  protected readonly results = signal<readonly CustomerView[]>([]);
  protected readonly searchedText = signal('');

  constructor() {
    this.search.valueChanges
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        map((text) => text.trim()),
        distinctUntilChanged(),
        switchMap((text) => this.runSearch(text)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected selectCustomer(customer: CustomerView): void {
    this.choose(orderCustomerOf(customer));
  }

  protected selectFinalConsumer(): void {
    this.choose(FINAL_CONSUMER);
  }

  /** Da de alta un cliente en el formulario compartido y lo selecciona al guardarlo. */
  protected newCustomer(): void {
    const ref = this.modal.open(CustomerFormComponent, { size: 'lg', scrollable: true });
    ref.componentInstance.customer = null;
    ref.result.then((saved: CustomerView) => this.selectCustomer(saved), () => undefined);
  }

  private choose(customer: OrderCustomer): void {
    this.store.setCustomer(customer);
    this.results.set([]);
    this.searchedText.set('');
    this.search.setValue('');
  }

  private runSearch(text: string): Observable<unknown> {
    if (text === '') {
      this.results.set([]);
      this.searchedText.set('');
      this.searchError.set(null);
      return EMPTY;
    }
    this.searching.set(true);
    this.searchError.set(null);
    return this.customers.list({ page: 0, size: SEARCH_SIZE }, { search: text, active: true }).pipe(
      tap((page) => {
        this.searching.set(false);
        this.searchedText.set(text);
        this.results.set(page.content);
      }),
      catchError((error: unknown) => {
        this.searching.set(false);
        this.searchError.set(error);
        return EMPTY;
      }),
    );
  }
}
