import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { SalesApi } from '../../../core/api/sales-api';
import { FieldErrorComponent, isInvalidControl } from '../../../shared/components/field-error/field-error';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/** Largo máximo del número de recibo que se busca. */
const RECEIPT_MAX = 40;

/**
 * Búsqueda de una venta de otra sucursal por su número de recibo, para devolverla en esta tienda.
 * Necesita conexión con la central. Si la venta existe y la sucursal acepta devoluciones de otras,
 * lleva a la devolución de esa venta; si no, muestra el motivo.
 */
@Component({
  selector: 'app-return-lookup-page',
  imports: [ReactiveFormsModule, RouterLink, FieldErrorComponent, FieldLabelComponent, ProblemAlertComponent, TranslatePipe],
  templateUrl: './return-lookup-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnLookupPageComponent {
  private readonly sales = inject(SalesApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly isInvalid = isInvalidControl;
  protected readonly receiptMax = RECEIPT_MAX;
  protected readonly searching = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly notFound = signal(false);

  protected readonly form = this.fb.group({
    receiptNumber: this.fb.control('', [Validators.required, Validators.maxLength(RECEIPT_MAX)]),
  });

  /** Busca la venta y, si existe, abre su devolución. */
  protected search(): void {
    const receipt = this.form.controls.receiptNumber.value.trim();
    if (this.form.invalid || receipt === '' || this.searching()) {
      this.form.markAllAsTouched();
      return;
    }
    this.searching.set(true);
    this.error.set(null);
    this.notFound.set(false);
    this.sales.returnableLookup(receipt).subscribe({
      next: (found) => {
        void this.router.navigate(['/sales/orders', found.saleId, 'return']);
      },
      error: (error: unknown) => {
        this.searching.set(false);
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notFound.set(true);
          return;
        }
        this.error.set(error);
      },
    });
  }
}
