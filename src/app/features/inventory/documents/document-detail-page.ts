import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CompanyApi } from '../../../core/api/company-api';
import {
  InventoryApi,
  InventoryDocumentLineView,
  InventoryDocumentView,
} from '../../../core/api/inventory-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { formatDifference, formatQuantity } from '../shared/inventory-math';

/** Destino del botón "Volver": el listado con los filtros con que llegó el usuario, o el listado. */
const LIST_URL = /^\/inventory\/documents(\?|$)/;

/**
 * Detalle de un documento de inventario guardado. Solo lectura: un documento no se edita ni se
 * borra. Muestra cada línea con lo que se movió; en un ajuste, también el saldo anterior, lo contado
 * y la diferencia.
 */
@Component({
  selector: 'app-document-detail-page',
  imports: [RouterLink, ProblemAlertComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './document-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(InventoryApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly language = inject(LanguageService);

  protected readonly backUrl = this.listUrlFromState();
  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly document = signal<InventoryDocumentView | null>(null);
  protected readonly currency = signal<string | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });
    this.api.document(id).subscribe({
      next: (document) => {
        this.document.set(document);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected quantity(value: number | null): string {
    return value === null ? '—' : formatQuantity(value);
  }

  protected money(value: number | null): string {
    return value === null ? '—' : formatMoney(value, this.currency(), this.language.current());
  }

  /** Diferencia de un ajuste: lo contado menos el saldo anterior. Null en otros tipos de línea. */
  protected difference(line: InventoryDocumentLineView): string | null {
    if (line.countedQuantity === null || line.previousQuantity === null) {
      return null;
    }
    return formatDifference(Math.round((line.countedQuantity - line.previousQuantity) * 1000));
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/inventory/documents';
  }
}
