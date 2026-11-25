import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { BranchView, BranchesApi } from '../../core/api/branches-api';
import { CompanyApi } from '../../core/api/company-api';
import { CreditNoteStatus, CreditNoteView, CreditNotesApi } from '../../core/api/credit-notes-api';
import { listAllPages } from '../../core/api/page';
import { FINAL_CONSUMER_ID } from '../../core/api/sales-api';
import { LanguageService } from '../../core/i18n/language.service';
import { SystemInfoService } from '../../core/system/system-info.service';
import { ProblemAlertComponent } from '../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../shared/forms/amounts';
import { LocalDateTimePipe } from '../../shared/pipes/local-date-time.pipe';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { branchLabel } from '../../shared/stores/branch-label';

/** Destino del botón "Volver": el listado con los filtros con que el usuario llegó, o /credit-notes. */
const LIST_URL = /^\/credit-notes(\?|$)/;

/**
 * Detalle de una nota de crédito: número, cliente, monto, saldo, estado, fecha de emisión y la
 * devolución que la originó. Es de solo lectura; los usos de la nota se agregan en otro paso.
 */
@Component({
  selector: 'app-credit-note-detail-page',
  imports: [RouterLink, ProblemAlertComponent, LocalDateTimePipe, TranslatePipe],
  templateUrl: './credit-note-detail-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditNoteDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CreditNotesApi);
  private readonly branchesApi = inject(BranchesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly language = inject(LanguageService);
  private readonly systemInfo = inject(SystemInfoService);

  protected readonly isCentral = this.systemInfo.isCentral;
  protected readonly finalConsumerId = FINAL_CONSUMER_ID;

  /** Listado al que vuelve el botón. El listado lo pasa en el estado de la navegación. */
  protected readonly backUrl = this.listUrlFromState();

  protected readonly invalidId = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<unknown>(null);
  protected readonly note = signal<CreditNoteView | null>(null);
  protected readonly currency = signal<string | null>(null);
  protected readonly branches = signal<readonly BranchView[]>([]);

  private readonly branchMap = computed(
    () => new Map(this.branches().map((branch) => [branch.id, branch] as const)),
  );

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }

    if (this.isCentral()) {
      // Sin el privilegio de sucursales, la fila muestra el id.
      listAllPages((request) => this.branchesApi.list(request), 'code').subscribe({
        next: (branches) => this.branches.set(branches),
        error: () => undefined,
      });
    }
    this.companyApi.get().subscribe({
      next: (company) => this.currency.set(company.currency),
      error: () => undefined,
    });

    this.api.get(id).subscribe({
      next: (note) => {
        this.note.set(note);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected back(): void {
    void this.router.navigateByUrl(this.backUrl);
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected branchName(branchId: number): string {
    return branchLabel(this.branchMap(), branchId) ?? String(branchId);
  }

  protected statusClass(status: CreditNoteStatus): string {
    return status === 'ACTIVE' ? 'badge text-bg-success' : 'badge text-bg-secondary';
  }

  private listUrlFromState(): string {
    const state = history.state as { readonly returnUrl?: unknown } | null;
    const url = state?.returnUrl;
    return typeof url === 'string' && LIST_URL.test(url) ? url : '/credit-notes';
  }
}
