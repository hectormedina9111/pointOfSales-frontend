import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, ValidationErrors, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, debounceTime, switchMap, tap } from 'rxjs';

import { CustomerDocumentType, CustomerView } from '../../../core/api/customers-api';
import { ProductView, SerialMode } from '../../../core/api/products-api';
import {
  AuthorizationRequest,
  DiscountType,
  FINAL_CONSUMER_ID,
  OrderType,
  SaleDraftRequest,
  SaleQuoteView,
  SaleView,
  SalesApi,
} from '../../../core/api/sales-api';
import { numberToThousandths, thousandthsToQuantity } from '../../../shared/forms/amounts';
import { needsSerialPerUnit } from '../../../shared/serials/serial-mode';
import { DiscountChoice } from '../shared/discount-form';

/** Pausa tras el último cambio antes de pedir los totales, en milisegundos. */
export const QUOTE_DEBOUNCE_MS = 300;

/** Una unidad en milésimas: sumar o restar una unidad a la cantidad. */
const ONE_UNIT = 1000;

/** Cliente de la venta, con lo necesario para mostrarlo y enviarlo. */
export interface OrderCustomer {
  readonly id: number;
  readonly finalConsumer: boolean;
  readonly displayName: string;
  readonly documentType: CustomerDocumentType;
  readonly documentNumber: string | null;
}

/** El consumidor final: cliente por defecto de toda venta nueva. */
export const FINAL_CONSUMER: OrderCustomer = {
  id: FINAL_CONSUMER_ID,
  finalConsumer: true,
  displayName: '',
  documentType: 'NONE',
  documentNumber: null,
};

/** Cliente de la API, en la forma que usa la venta. */
export function orderCustomerOf(customer: CustomerView): OrderCustomer {
  return {
    id: customer.id,
    finalConsumer: customer.finalConsumer,
    displayName: customer.displayName,
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
  };
}

/**
 * Una línea de la orden. La cantidad va en milésimas enteras (2.500 = 2500). unitPrice es el precio
 * cambiado a mano; null usa el precio de lista. Los montos no se guardan: vienen de la cotización.
 */
export interface CartLine {
  readonly key: number;
  readonly productId: number;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
  readonly unitPrice: number | null;
  /** Configuración de serie: con MANUAL o LIST la cantidad es el número de seriales y no se escribe a mano. */
  readonly serialMode: SerialMode;
  readonly serialNumbers: readonly string[];
}

/** Línea con los seriales dados; en un producto con seriales la cantidad sale de su número. */
function withSerials(line: CartLine, serialNumbers: readonly string[]): CartLine {
  return { ...line, serialNumbers, quantity: serialNumbers.length * ONE_UNIT };
}

/**
 * Estado de la orden que se arma en el asistente: cliente, tipo, líneas, descuento de la venta y
 * la última cotización. Vive en la pantalla de la orden (no es global), así que cada orden empieza
 * de cero. Los controles de validez dicen al asistente cuándo puede avanzar.
 */
@Injectable()
export class OrderDraftStore {
  private readonly sales = inject(SalesApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Moneda de la empresa; null si no está configurada. La asigna la pantalla. */
  readonly currency = signal<string | null>(null);

  readonly customer = signal<OrderCustomer>(FINAL_CONSUMER);
  readonly orderType = signal<OrderType>('CASH');
  readonly lines = signal<readonly CartLine[]>([]);
  readonly saleDiscount = signal<DiscountChoice>({ type: null, value: null });
  readonly quote = signal<SaleQuoteView | null>(null);
  readonly quoteError = signal<unknown>(null);
  /** Verdadero mientras los totales no corresponden a la orden actual. */
  readonly pendingQuote = signal(false);
  /** Id de la venta en espera que se edita, o null si la orden es nueva. */
  readonly savedId = signal<number | null>(null);
  /** Ocupado mientras se carga o se guarda una orden. */
  readonly busy = signal(false);
  readonly actionError = signal<unknown>(null);

  readonly hasLines = computed(() => this.lines().length > 0);
  /** Hay un producto con seriales sin ninguno todavía: la orden no se puede cotizar ni guardar. */
  readonly serialsIncomplete = computed(() =>
    this.lines().some((line) => needsSerialPerUnit(line.serialMode) && line.serialNumbers.length === 0),
  );
  /** Se puede guardar: hay líneas, todos los seriales están y los totales están al día. */
  readonly readyToSave = computed(
    () =>
      this.hasLines() &&
      !this.serialsIncomplete() &&
      this.quote() !== null &&
      !this.pendingQuote() &&
      this.quoteError() === null,
  );

  /** Validador del control de productos: declarado antes de usarlo en los campos de abajo. */
  private readonly productsValidator = (_control: AbstractControl): ValidationErrors | null => {
    if (!this.hasLines()) {
      return { required: true };
    }
    return this.readyToSave() ? null : { quote: true };
  };

  /** Cliente: siempre tiene uno (por defecto el consumidor final). */
  readonly customerControl = new FormControl<number | null>(FINAL_CONSUMER_ID, [Validators.required]);
  /** Tipo de venta: siempre tiene uno (por defecto al contado). */
  readonly orderTypeControl = new FormControl<OrderType | null>('CASH', [Validators.required]);
  /** Productos: exige líneas y totales al día. Se revalida con cada cambio. */
  readonly productsControl = new FormControl<number>(0, [this.productsValidator]);

  private readonly recalc = new Subject<void>();
  /** Cambia con cada cambio de la orden; una cotización vieja no se aplica. */
  private revision = 0;
  private nextKey = 1;

  constructor() {
    this.recalc
      .pipe(
        debounceTime(QUOTE_DEBOUNCE_MS),
        switchMap(() => this.requestQuote()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * Agrega el producto, o suma una unidad si ya está en la orden. Un producto con seriales no suma:
   * cada unidad es un serial, así que devuelve false y la pantalla pide escribir el serial en su línea.
   */
  addProduct(product: ProductView): boolean {
    const existing = this.lines().find((line) => line.productId === product.id);
    if (existing) {
      if (needsSerialPerUnit(existing.serialMode)) {
        return false;
      }
      this.updateLine(existing.key, (line) => ({ ...line, quantity: line.quantity + ONE_UNIT }));
      return true;
    }
    this.setLines([
      ...this.lines(),
      {
        key: this.nextKey++,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        // Un producto con seriales empieza sin unidades: la cantidad llega con cada serial.
        quantity: needsSerialPerUnit(product.serialMode) ? 0 : ONE_UNIT,
        discountType: null,
        discountValue: null,
        unitPrice: null,
        serialMode: product.serialMode,
        serialNumbers: [],
      },
    ]);
    return true;
  }

  /** Cambia la cantidad en milésimas. Cero o menos se ignora: quitar la línea es otra acción. Un producto con seriales no cambia a mano. */
  setQuantity(key: number, thousandths: number): void {
    if (thousandths <= 0) {
      return;
    }
    this.updateLine(key, (line) => (needsSerialPerUnit(line.serialMode) ? line : { ...line, quantity: thousandths }));
  }

  /** Agrega un serial a la línea de un producto con seriales. La cantidad pasa a ser el número de seriales. */
  addSerial(key: number, serial: string): void {
    this.updateLine(key, (line) => withSerials(line, [...line.serialNumbers, serial]));
  }

  removeSerial(key: number, serial: string): void {
    this.updateLine(key, (line) => withSerials(line, line.serialNumbers.filter((item) => item !== serial)));
  }

  removeLine(key: number): void {
    this.setLines(this.lines().filter((line) => line.key !== key));
  }

  setLineDiscount(key: number, choice: DiscountChoice): void {
    this.updateLine(key, (line) => ({ ...line, discountType: choice.type, discountValue: choice.value }));
  }

  /** Precio cambiado a mano; null vuelve al precio de lista. */
  setLinePrice(key: number, unitPrice: number | null): void {
    this.updateLine(key, (line) => ({ ...line, unitPrice }));
  }

  setSaleDiscount(choice: DiscountChoice): void {
    this.saleDiscount.set(choice);
    this.changed();
  }

  setCustomer(customer: OrderCustomer): void {
    this.customer.set(customer);
    this.customerControl.setValue(customer.id);
    this.changed();
  }

  setOrderType(type: OrderType): void {
    this.orderType.set(type);
    this.orderTypeControl.setValue(type);
    this.changed();
  }

  /** Carga una venta en espera para editarla: cliente, tipo, líneas, descuento y su id. */
  load(sale: SaleView): void {
    const customer: OrderCustomer = {
      id: sale.customerId,
      finalConsumer: sale.customerId === FINAL_CONSUMER_ID,
      displayName: sale.customerName,
      documentType: sale.customerDocumentType,
      documentNumber: sale.customerDocumentNumber,
    };
    this.customer.set(customer);
    this.customerControl.setValue(customer.id);
    this.orderType.set(sale.orderType);
    this.orderTypeControl.setValue(sale.orderType);
    this.saleDiscount.set({
      type: sale.discountType,
      value: sale.discountValue === null ? null : sale.discountValue.toFixed(2),
    });
    this.savedId.set(sale.id);
    this.setLines(
      sale.lines.map((line) => ({
        key: this.nextKey++,
        productId: line.productId,
        sku: line.sku,
        name: line.description,
        quantity: numberToThousandths(line.quantity),
        discountType: line.discountType,
        discountValue: line.discountValue === null ? null : line.discountValue.toFixed(2),
        unitPrice: line.priceOverridden ? line.unitPrice : null,
        serialMode: line.serialMode,
        serialNumbers: [...line.serialNumbers],
      })),
    );
  }

  /** La venta en espera ya no existe: la orden sigue, pero como nueva. */
  detach(): void {
    this.savedId.set(null);
  }

  /** Deja la orden vacía, como nueva. */
  reset(): void {
    this.revision++;
    this.customer.set(FINAL_CONSUMER);
    this.customerControl.setValue(FINAL_CONSUMER_ID);
    this.orderType.set('CASH');
    this.orderTypeControl.setValue('CASH');
    this.lines.set([]);
    this.saleDiscount.set({ type: null, value: null });
    this.quote.set(null);
    this.quoteError.set(null);
    this.pendingQuote.set(false);
    this.savedId.set(null);
    this.actionError.set(null);
    this.refreshValidity();
  }

  /** Cuerpo de la orden que se cotiza, se guarda o se actualiza. authorization solo en el reintento. */
  draft(authorization: AuthorizationRequest | null = null): SaleDraftRequest {
    const discount = this.saleDiscount();
    return {
      customerId: this.customer().id,
      orderType: this.orderType(),
      lines: this.lines().map((line) => ({
        productId: line.productId,
        quantity: thousandthsToQuantity(line.quantity),
        discountType: line.discountType,
        discountValue: line.discountValue,
        unitPrice: line.unitPrice,
        // Un serial por unidad: solo los productos con serie manual o de lista lo envían.
        ...(needsSerialPerUnit(line.serialMode) ? { serialNumbers: [...line.serialNumbers] } : {}),
      })),
      discountType: discount.type,
      discountValue: discount.value,
      notes: null,
      authorization,
    };
  }

  /** Guarda la orden como venta en espera nueva, o reemplaza la que se edita. */
  save(authorization: AuthorizationRequest | null = null): Observable<SaleView> {
    const body = this.draft(authorization);
    const id = this.savedId();
    return id === null ? this.sales.createHold(body) : this.sales.updateHold(id, body);
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
    this.refreshValidity();
    this.recalc.next();
  }

  private requestQuote(): Observable<unknown> {
    const revision = this.revision;
    // Sin líneas, o con un producto de seriales sin ninguno, no hay nada que cotizar todavía.
    if (this.lines().length === 0 || this.serialsIncomplete()) {
      this.quote.set(null);
      this.quoteError.set(null);
      this.pendingQuote.set(false);
      this.refreshValidity();
      return EMPTY;
    }
    return this.sales.quote(this.draft()).pipe(
      tap((result) => {
        if (revision === this.revision) {
          this.quote.set(result);
          this.quoteError.set(null);
          this.pendingQuote.set(false);
          this.refreshValidity();
        }
      }),
      catchError((error: unknown) => {
        if (revision === this.revision) {
          this.quote.set(null);
          this.quoteError.set(error);
          this.pendingQuote.set(false);
          this.refreshValidity();
        }
        return EMPTY;
      }),
    );
  }

  /** Vuelve a evaluar el control de productos: el asistente se entera del cambio de validez. */
  private refreshValidity(): void {
    this.productsControl.updateValueAndValidity();
  }
}
