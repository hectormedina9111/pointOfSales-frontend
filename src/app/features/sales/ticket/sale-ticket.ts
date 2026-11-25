import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map, catchError, of } from 'rxjs';

import { CompanyApi } from '../../../core/api/company-api';
import { SalesApi, TicketView } from '../../../core/api/sales-api';
import { LanguageService } from '../../../core/i18n/language.service';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import { formatMoney } from '../../../shared/forms/amounts';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * Ticket de una venta cobrada, de 80 mm. Solo el área del ticket se imprime (estilos de impresión
 * en styles.scss). Se abre al cobrar, o desde el id de la venta en la dirección.
 */
@Component({
  selector: 'app-sale-ticket',
  imports: [RouterLink, ProblemAlertComponent, TranslatePipe],
  templateUrl: './sale-ticket.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleTicketComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(SalesApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly language = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly invalidId = signal(false);
  protected readonly loadError = signal<unknown>(null);
  protected readonly ticket = signal<TicketView | null>(null);
  protected readonly currency = signal<string | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      this.invalidId.set(true);
      this.loading.set(false);
      return;
    }

    this.companyApi
      .get()
      .pipe(
        map((company) => company.currency),
        catchError(() => of(null)),
      )
      .subscribe((currency) => this.currency.set(currency));

    this.api.ticket(id).subscribe({
      next: (ticket) => {
        this.ticket.set(ticket);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.loading.set(false);
      },
    });
  }

  protected money(value: number | null): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected print(): void {
    window.print();
  }
}
