import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  debounceTime,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { CashSessionsApi } from '../../../core/api/cash-sessions-api';
import { CompanyApi } from '../../../core/api/company-api';
import { ProductView, ProductsApi } from '../../../core/api/products-api';
import {
  DiscountType,
  SaleDraftRequest,
  SaleLineView,
  SaleQuoteView,
  SaleView,
  SalesApi,
} from '../../../core/api/sales-api';
import { PrivilegesService } from '../../../core/auth/privileges.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SystemInfoService } from '../../../core/system/system-info.service';
import { openConfirmDialog } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { FieldLabelComponent } from '../../../shared/components/field-label/field-label';
import { ProblemAlertComponent } from '../../../shared/components/problem-alert/problem-alert';
import {
  formatMoney,
  numberToThousandths,
  quantityToThousandths,
  thousandthsToQuantity,
} from '../../../shared/forms/amounts';
import { IfPrivilegeDirective } from '../../../shared/directives/if-privilege.directive';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { CheckoutModalComponent } from './checkout-modal';
import { DiscountChoice, DiscountFormComponent } from '../shared/discount-form';
import { HoldsModalComponent } from '../order/holds-modal';
import { SaleTotalsComponent } from '../shared/sale-totals';

/** Pausa tras el último cambio antes de pedir los totales, en milisegundos. */
const QUOTE_DEBOUNCE_MS = 300;

/** Productos que muestra la lista de resultados de la búsqueda. */
const SEARCH_SIZE = 10;

/** Una unidad en milésimas: sumar o restar una unidad a la cantidad. */
const ONE_UNIT = 1000;

/**
 * Una línea del carrito. La cantidad va en milésimas enteras (2.500 = 2500) para sumar sin coma
 * flotante. Los montos (precio, total) no se guardan: vienen de la cotización del servidor.
 */
export interface CartLine {
  readonly key: number;
  readonly productId: number;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
}

/** Estado de la caja para esta pantalla: cargando, sin sesión abierta, con sesión o con error al consultarla. */
type SessionState = 'loading' | 'none' | 'open' | 'error';

/**
 * Punto de venta de la tienda. Busca productos (código de barras primero, luego por texto), arma
 * el carrito y muestra los totales que calcula el servidor, recalculados con una pausa tras cada
 * cambio. Cobrar, poner en espera y reanudar están aquí; el ticket se abre al cobrar.
 * En la central solo muestra un aviso: las ventas se hacen en las tiendas.
 */
@Component({
  selector: 'app-pos',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProblemAlertComponent,
    FieldLabelComponent,
    IfPrivilegeDirective,
    SaleTotalsComponent,
    TranslatePipe,
  ],
  templateUrl: './pos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosComponent {
  private readonly products = inject(ProductsApi);
  private readonly sales = inject(SalesApi);
  private readonly cashSessions = inject(CashSessionsApi);
  private readonly companyApi = inject(CompanyApi);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);
  private readonly injector = inject(Injector);
  protected readonly privileges = inject(PrivilegesService);
  protected readonly system = inject(SystemInfoService);

  protected readonly isStore = this.system.isStore;
  protected readonly isCentral = this.system.isCentral;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  protected readonly search = new FormControl('', { nonNullable: true });

  protected readonly sessionState = signal<SessionState>('loading');
  protected readonly loadError = signal<unknown>(null);
  protected readonly currency = signal<string | null>(null);

  protected readonly searching = signal(false);
  protected readonly searchError = signal<unknown>(null);
  protected readonly searchResults = signal<readonly ProductView[]>([]);
  protected readonly searchedText = signal('');
  protected readonly lineMessage = signal<string | null>(null);

  protected readonly lines = signal<readonly CartLine[]>([]);
  protected readonly saleDiscount = signal<DiscountChoice>({ type: null, value: null });
  protected readonly quote = signal<SaleQuoteView | null>(null);
  protected readonly quoteError = signal<unknown>(null);
  /** Verdadero mientras los totales no corresponden al carrito actual. */
  protected readonly pendingQuote = signal(false);

  protected readonly holdId = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<unknown>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly hasLines = computed(() => this.lines().length > 0);
  /** Se puede cobrar: hay líneas y los totales están al día. */
  protected readonly ready = computed(
    () => this.hasLines() && this.quote() !== null && !this.pendingQuote(),
  );

  private readonly recalc = new Subject<void>();
  /** Cambia con cada cambio del carrito; una cotización vieja no se aplica. */
  private revision = 0;
  private nextKey = 1;
  private started = false;

  constructor() {
    this.recalc
      .pipe(
        debounceTime(QUOTE_DEBOUNCE_MS),
        switchMap(() => this.requestQuote()),
        takeUntilDestroyed(),
      )
      .subscribe();

    // Los datos del nodo llegan de forma asíncrona: la carga empieza cuando se sabe que es una tienda.
    effect(() => {
      if (this.isStore() && !this.started) {
        this.started = true;
        untracked(() => this.load());
      }
    });
  }

  /** Atajos: F2 enfoca la búsqueda y F9 cobra. No actúan con un diálogo abierto. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (this.sessionState() !== 'open' || this.modal.hasOpenModals()) {
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      this.focusSearch();
    } else if (event.key === 'F9') {
      event.preventDefault();
      if (this.privileges.has('POST_SALES')) {
        this.openCheckout();
      }
    }
  }

  protected money(value: number): string {
    return formatMoney(value, this.currency(), this.language.current());
  }

  protected quotedLine(index: number): SaleLineView | undefined {
    return this.quote()?.lines.find((line) => line.lineNumber === index + 1);
  }

  /** Monto de un descuento guardado como texto, para mostrarlo con formatMoney. */
  protected numeric(value: string | null): number {
    return Number(value ?? 0);
  }

  protected quantityText(line: CartLine): string {
    return thousandthsToQuantity(line.quantity);
  }

  /** Enter en la búsqueda: primero el código de barras exacto; si no existe, la búsqueda por texto. */
  protected onSearchEnter(): void {
    const text = this.search.value.trim();
    if (text === '') {
      return;
    }
    this.lineMessage.set(null);
    this.searchError.set(null);
    this.searchResults.set([]);
    this.searchedText.set('');
    this.searching.set(true);
    this.products.byBarcode(text).subscribe({
      next: (product) => {
        this.searching.set(false);
        this.addProduct(product);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.runSearch(text);
          return;
        }
        this.searching.set(false);
        this.searchError.set(error);
      },
    });
  }

  /** Agrega el producto elegido, o suma uno si ya está en el carrito. */
  protected addProduct(product: ProductView): void {
    this.search.setValue('');
    this.searchResults.set([]);
    this.searchedText.set('');
    if (!product.active) {
      this.lineMessage.set('sales.pos.productInactive');
      this.focusSearch();
      return;
    }
    this.lineMessage.set(null);
    const existing = this.lines().find((line) => line.productId === product.id);
    if (existing) {
      this.updateLine(existing.key, (line) => ({ ...line, quantity: line.quantity + ONE_UNIT }));
    } else {
      this.setLines([
        ...this.lines(),
        {
          key: this.nextKey++,
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: ONE_UNIT,
          discountType: null,
          discountValue: null,
        },
      ]);
    }
    this.focusSearch();
  }

  protected increase(line: CartLine): void {
    this.setQuantity(line, line.quantity + ONE_UNIT);
  }

  protected decrease(line: CartLine): void {
    this.setQuantity(line, line.quantity - ONE_UNIT);
  }

  /** Cantidad escrita a mano (hasta 3 decimales). Si no es válida, se restaura la anterior. */
  protected onQuantityChange(line: CartLine, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const thousandths = quantityToThousandths(input.value);
    if (thousandths === null) {
      this.lineMessage.set('sales.pos.lines.invalidQuantity');
      input.value = thousandthsToQuantity(line.quantity);
      return;
    }
    this.lineMessage.set(null);
    this.setQuantity(line, thousandths);
  }

  protected removeLine(key: number): void {
    this.setLines(this.lines().filter((line) => line.key !== key));
  }

  protected editLineDiscount(line: CartLine): void {
    const ref = this.modal.open(DiscountFormComponent, { centered: true });
    ref.componentInstance.titleKey = 'sales.pos.lineDiscount.title';
    ref.componentInstance.current = { type: line.discountType, value: line.discountValue };
    ref.result.then(
      (choice: DiscountChoice) =>
        this.updateLine(line.key, (current) => ({
          ...current,
          discountType: choice.type,
          discountValue: choice.value,
        })),
      () => undefined,
    );
  }

  protected editSaleDiscount(): void {
    const ref = this.modal.open(DiscountFormComponent, { centered: true });
    ref.componentInstance.titleKey = 'sales.pos.saleDiscount.title';
    ref.componentInstance.current = this.saleDiscount();
    ref.result.then(
      (choice: DiscountChoice) => {
        this.saleDiscount.set(choice);
        this.changed();
      },
      () => undefined,
    );
  }

  /** Poner en espera: guarda el borrador. Si la venta venía de una espera, la reemplaza. */
  protected putOnHold(): void {
    if (!this.hasLines() || this.busy()) {
      return;
    }
    const previous = this.holdId();
    const create = this.sales.createHold(this.draft());
    const request =
      previous === null
        ? create
        : this.sales.deleteHold(previous).pipe(
            tap(() => this.holdId.set(null)),
            switchMap(() => create),
          );
    this.busy.set(true);
    this.actionError.set(null);
    this.notice.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.resetCart();
        this.notice.set('sales.pos.heldNotice');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(error);
      },
    });
  }

  protected openHolds(): void {
    const ref = this.modal.open(HoldsModalComponent, { size: 'lg' });
    ref.componentInstance.currency = this.currency();
    ref.result.then((holdId: number) => this.resume(holdId), () => undefined);
  }

  /** Quitar todo el carrito y la venta en espera (si la hay) tras confirmar. */
  protected async cancelSale(): Promise<void> {
    if (!this.hasLines() && this.holdId() === null) {
      return;
    }
    const confirmed = await openConfirmDialog(this.modal, {
      titleKey: 'sales.pos.cancel.title',
      messageKey: 'sales.pos.cancel.message',
      confirmKey: 'sales.pos.cancel.confirm',
    });
    if (!confirmed) {
      return;
    }
    const holdId = this.holdId();
    if (holdId === null) {
      this.resetCart();
      return;
    }
    this.busy.set(true);
    this.actionError.set(null);
    this.sales.deleteHold(holdId).subscribe({
      next: () => {
        this.busy.set(false);
        this.resetCart();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(error);
      },
    });
  }

  protected openCheckout(): void {
    const quote = this.quote();
    if (quote === null || !this.ready() || this.busy()) {
      return;
    }
    const ref = this.modal.open(CheckoutModalComponent, { size: 'xl' });
    ref.componentInstance.draft = this.draft();
    ref.componentInstance.quote = quote;
    ref.componentInstance.holdId = this.holdId();
    ref.componentInstance.currency = this.currency();
    ref.result.then(
      (sale: SaleView) => {
        this.resetCart();
        void this.router.navigate(['/sales/tickets', sale.id]);
      },
      () => undefined,
    );
  }

  private load(): void {
    this.companyApi
      .get()
      .pipe(
        map((company) => company.currency),
        catchError(() => of(null)),
      )
      .subscribe((currency) => this.currency.set(currency));

    this.cashSessions.current().subscribe({
      next: (session) => {
        this.sessionState.set(session === null ? 'none' : 'open');
        if (session !== null) {
          afterNextRender(() => this.focusSearch(), { injector: this.injector });
        }
      },
      error: (error: unknown) => {
        this.loadError.set(error);
        this.sessionState.set('error');
      },
    });
  }

  private runSearch(text: string): void {
    this.products
      .search(
        { page: 0, size: SEARCH_SIZE, sort: 'name' },
        { q: text, categoryId: null, type: null, active: true },
      )
      .subscribe({
        next: (page) => {
          this.searching.set(false);
          this.searchedText.set(text);
          this.searchResults.set(page.content);
        },
        error: (error: unknown) => {
          this.searching.set(false);
          this.searchError.set(error);
        },
      });
  }

  /** Reanuda una venta en espera: carga sus líneas y su descuento, y recuerda su id. */
  private resume(holdId: number): void {
    if (!this.hasLines()) {
      this.loadHold(holdId);
      return;
    }
    openConfirmDialog(this.modal, {
      titleKey: 'sales.pos.resume.replaceTitle',
      messageKey: 'sales.pos.resume.replaceMessage',
      confirmKey: 'sales.pos.resume.replaceConfirm',
    }).then((confirmed) => {
      if (confirmed) {
        this.loadHold(holdId);
      }
    });
  }

  private loadHold(holdId: number): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.sales.getHold(holdId).subscribe({
      next: (sale) => {
        this.busy.set(false);
        this.applyHold(sale);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(error);
      },
    });
  }

  private applyHold(sale: SaleView): void {
    this.notice.set(null);
    this.saleDiscount.set({
      type: sale.discountType,
      value: sale.discountValue === null ? null : sale.discountValue.toFixed(2),
    });
    this.holdId.set(sale.id);
    this.setLines(
      sale.lines.map((line) => ({
        key: this.nextKey++,
        productId: line.productId,
        sku: line.sku,
        name: line.description,
        quantity: numberToThousandths(line.quantity),
        discountType: line.discountType,
        discountValue: line.discountValue === null ? null : line.discountValue.toFixed(2),
      })),
    );
  }

  private setQuantity(line: CartLine, thousandths: number): void {
    if (thousandths <= 0) {
      return;
    }
    this.updateLine(line.key, (current) => ({ ...current, quantity: thousandths }));
  }

  private updateLine(key: number, change: (line: CartLine) => CartLine): void {
    this.setLines(this.lines().map((line) => (line.key === key ? change(line) : line)));
  }

  private setLines(lines: readonly CartLine[]): void {
    this.lines.set(lines);
    this.changed();
  }

  /** Marca los totales como viejos y pide una cotización con pausa. */
  private changed(): void {
    this.revision++;
    this.pendingQuote.set(true);
    this.recalc.next();
  }

  private requestQuote(): Observable<unknown> {
    const revision = this.revision;
    if (this.lines().length === 0) {
      this.quote.set(null);
      this.quoteError.set(null);
      this.pendingQuote.set(false);
      return EMPTY;
    }
    return this.sales.quote(this.draft()).pipe(
      tap((result) => {
        if (revision === this.revision) {
          this.quote.set(result);
          this.quoteError.set(null);
          this.pendingQuote.set(false);
        }
      }),
      catchError((error: unknown) => {
        if (revision === this.revision) {
          this.quote.set(null);
          this.quoteError.set(error);
          this.pendingQuote.set(false);
        }
        return EMPTY;
      }),
    );
  }

  /** Cuerpo del borrador que se cotiza, se pone en espera o se cobra. */
  private draft(): SaleDraftRequest {
    const discount = this.saleDiscount();
    return {
      lines: this.lines().map((line) => ({
        productId: line.productId,
        quantity: thousandthsToQuantity(line.quantity),
        discountType: line.discountType,
        discountValue: line.discountValue,
      })),
      discountType: discount.type,
      discountValue: discount.value,
      notes: null,
    };
  }

  private resetCart(): void {
    this.revision++;
    this.lines.set([]);
    this.saleDiscount.set({ type: null, value: null });
    this.quote.set(null);
    this.quoteError.set(null);
    this.pendingQuote.set(false);
    this.holdId.set(null);
    this.search.setValue('');
    this.searchResults.set([]);
    this.searchedText.set('');
    this.lineMessage.set(null);
    this.focusSearch();
  }

  private focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }
}
