import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { CustomerDocumentType } from './customers-api';
import { Page, PageRequest, pageParams } from './page';

/** Estado de una venta (enum SaleStatus del backend). ON_HOLD está en espera; PAID está cobrada. */
export type SaleStatus = 'ON_HOLD' | 'PAID';

/** Forma de un descuento (enum DiscountType del backend): monto fijo o porcentaje. */
export type DiscountType = 'AMOUNT' | 'PERCENTAGE';

/** Id del consumidor final (cliente único que no se edita). Una venta a su nombre no lleva datos de cliente. */
export const FINAL_CONSUMER_ID = 1;

/** Tipo de venta (enum OrderType del backend): al contado o a crédito. CREDIT todavía no se acepta. */
export type OrderType = 'CASH' | 'CREDIT';

/**
 * Línea de un borrador o de una venta (record LineRequest). La cantidad y el descuento viajan como
 * texto. unitPrice es el precio cambiado a mano; null (o sin valor) usa el precio de lista.
 */
export interface SaleLineRequest {
  readonly productId: number;
  readonly quantity: string;
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
  readonly unitPrice?: number | null;
}

/**
 * Borrador de venta para cotizar, guardar o actualizar (record DraftRequest). authorization solo
 * va en el reintento de guardar, tras pedir la autorización de un jefe de tienda; nunca se guarda.
 */
export interface SaleDraftRequest {
  readonly customerId: number | null;
  readonly orderType: OrderType;
  readonly lines: readonly SaleLineRequest[];
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
  readonly notes: string | null;
  readonly authorization?: AuthorizationRequest | null;
}

/** Un pago de la venta (record PaymentRequest). amountReceived solo para métodos que dan vuelto. */
export interface PaymentRequest {
  readonly paymentMethodCode: string;
  readonly amount: string;
  readonly amountReceived: string | null;
  readonly reference: string | null;
  readonly cardLast4: string | null;
}

/** Credenciales de un jefe de tienda para autorizar un descuento (record AuthorizationRequest). Nunca se guardan. */
export interface AuthorizationRequest {
  readonly username: string;
  readonly password: string;
}

/**
 * Body de POST /api/v1/sales/holds/{id}/checkout (record HoldCheckoutRequest). Cobra una venta en
 * espera que ya no se puede modificar. La clave de idempotencia hace que un reintento devuelva la
 * misma venta.
 */
export interface HoldCheckoutRequest {
  readonly payments: readonly PaymentRequest[];
  readonly idempotencyKey: string;
  readonly notes: string | null;
}

/**
 * Línea calculada por el servidor (record SaleLineView). Los montos llegan como número con dos
 * decimales. listPrice es el precio de lista; priceOverridden indica que el precio se cambió a mano.
 */
export interface SaleLineView {
  readonly lineNumber: number;
  readonly productId: number;
  readonly sku: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly listPrice: number;
  readonly priceOverridden: boolean;
  readonly taxCode: string;
  readonly taxRate: number;
  readonly priceListId: number | null;
  readonly discountType: DiscountType | null;
  readonly discountValue: number | null;
  readonly discountAmount: number;
  readonly subtotal: number;
  readonly taxAmount: number;
  readonly total: number;
}

/** Totales de una venta (record SaleTotalsView). exento + gravado 15 % + gravado 18 % + otros gravados + ISV = total. */
export interface SaleTotalsView {
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly exemptAmount: number;
  readonly taxableAmount15: number;
  readonly taxableAmount18: number;
  readonly otherTaxableAmount: number;
  readonly taxTotal: number;
  readonly total: number;
}

/**
 * Datos del cliente que trae cada venta (en SaleView, SaleSummaryView y TicketView). Para el
 * consumidor final, customerId es FINAL_CONSUMER_ID y los demás datos vienen vacíos.
 */
export interface SaleCustomerFields {
  readonly customerId: number;
  readonly customerName: string;
  readonly customerDocumentType: CustomerDocumentType;
  readonly customerDocumentNumber: string | null;
  readonly orderType: OrderType;
}

/** Pago de una venta (record PaymentView). cardLast4 son solo los cuatro últimos dígitos. */
export interface PaymentView {
  readonly paymentMethodCode: string;
  readonly paymentMethodName: string;
  readonly amount: number;
  readonly amountReceived: number | null;
  readonly reference: string | null;
  readonly cardLast4: string | null;
}

/** Venta completa con líneas y pagos (record SaleView). */
export interface SaleView extends SaleCustomerFields {
  readonly id: number;
  readonly internalNumber: number | null;
  readonly receiptNumber: string | null;
  readonly type: string;
  readonly documentType: string;
  readonly status: SaleStatus;
  readonly branchId: number;
  readonly cashRegisterId: number | null;
  readonly cashSessionId: number | null;
  readonly cashierId: number;
  readonly exclusive: boolean;
  readonly totals: SaleTotalsView;
  readonly amountPaid: number | null;
  readonly changeDue: number | null;
  readonly discountType: DiscountType | null;
  readonly discountValue: number | null;
  readonly discountAuthorizedBy: number | null;
  readonly notes: string | null;
  readonly fiscalStatus: string;
  readonly paidAt: string | null;
  readonly syncedAt: string | null;
  readonly createdAt: string;
  readonly lines: readonly SaleLineView[];
  readonly payments: readonly PaymentView[];
}

/**
 * Venta sin líneas ni pagos, como sale en el listado (record SaleSummaryView). branchId es la
 * sucursal de la venta. El listado no trae pagos ni fecha de recepción; eso está en SaleView.
 */
export interface SaleSummaryView extends SaleCustomerFields {
  readonly id: number;
  readonly internalNumber: number | null;
  readonly receiptNumber: string | null;
  readonly status: SaleStatus;
  readonly branchId: number;
  readonly cashRegisterId: number | null;
  readonly cashSessionId: number | null;
  readonly cashierId: number;
  readonly total: number;
  readonly paidAt: string | null;
  readonly createdAt: string;
}

/**
 * Totales de un borrador (record SaleQuoteView). No se guardan. discountAuthorizationRequired es
 * verdadero cuando los descuentos superan el máximo y el usuario no puede darlos solo;
 * priceAuthorizationRequired, cuando hay un precio cambiado que necesita un jefe de tienda.
 */
export interface SaleQuoteView {
  readonly lines: readonly SaleLineView[];
  readonly totals: SaleTotalsView;
  readonly discountAuthorizationRequired: boolean;
  readonly priceAuthorizationRequired: boolean;
}

/** Línea del ticket (record TicketLine). discount es el descuento de la línea, con su parte de la venta. */
export interface TicketLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly total: number;
}

/** Datos de la empresa en el ticket (record TicketCompany). */
export interface TicketCompany {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
}

/** Sucursal en el ticket (record TicketBranch). */
export interface TicketBranch {
  readonly name: string;
  readonly address: string | null;
}

/**
 * Ticket de una venta cobrada (record TicketView). date y time vienen en la zona horaria de la
 * empresa, indicada en timeZone.
 */
export interface TicketView extends SaleCustomerFields {
  readonly company: TicketCompany;
  readonly branch: TicketBranch;
  readonly cashRegisterName: string;
  readonly receiptNumber: string;
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  readonly cashierName: string;
  readonly lines: readonly TicketLine[];
  readonly totals: SaleTotalsView;
  readonly payments: readonly PaymentView[];
  readonly changeDue: number | null;
}

/**
 * Filtros del listado de ventas. Un valor null no filtra. Las fechas son instantes ISO-8601.
 * cashierId solo se usa con ACTION_SALES_VIEW_ALL; sin ese privilegio el servidor muestra solo las
 * ventas del usuario. branchId solo tiene efecto en la central.
 */
export interface SaleFilters {
  readonly status: SaleStatus | null;
  readonly cashSessionId: number | null;
  readonly cashierId: number | null;
  readonly branchId: number | null;
  readonly from: string | null;
  readonly to: string | null;
}

/**
 * Llamadas a /api/v1/sales. Escrito a mano hasta que `npm run api:update` genere src/app/api a
 * partir del OpenAPI del backend. Cotizar, poner en espera, cobrar y borrar en espera son de la tienda.
 */
@Injectable({ providedIn: 'root' })
export class SalesApi {
  private readonly http = inject(HttpClient);

  /** Totales del borrador, sin guardarlo. Se llama al cambiar el carrito (con pausa). */
  quote(body: SaleDraftRequest): Observable<SaleQuoteView> {
    return this.http.post<SaleQuoteView>('/api/v1/sales/quote', body);
  }

  /** Guarda el borrador como venta en espera. */
  createHold(body: SaleDraftRequest): Observable<SaleView> {
    return this.http.post<SaleView>('/api/v1/sales/holds', body);
  }

  /** Reemplaza el contenido de una venta en espera por el borrador. */
  updateHold(id: number, body: SaleDraftRequest): Observable<SaleView> {
    return this.http.put<SaleView>(`/api/v1/sales/holds/${id}`, body);
  }

  listHolds(request: PageRequest): Observable<Page<SaleSummaryView>> {
    return this.http.get<Page<SaleSummaryView>>('/api/v1/sales/holds', { params: pageParams(request) });
  }

  getHold(id: number): Observable<SaleView> {
    return this.http.get<SaleView>(`/api/v1/sales/holds/${id}`);
  }

  deleteHold(id: number): Observable<void> {
    return this.http.delete<void>(`/api/v1/sales/holds/${id}`);
  }

  /** Cobra una venta en espera con sus pagos. Responde 201; con la misma clave de idempotencia, la misma venta. */
  checkoutHold(id: number, body: HoldCheckoutRequest): Observable<SaleView> {
    return this.http.post<SaleView>(`/api/v1/sales/holds/${id}/checkout`, body);
  }

  list(request: PageRequest, filters: SaleFilters): Observable<Page<SaleSummaryView>> {
    let params: HttpParams = pageParams(request);
    if (filters.status !== null) {
      params = params.set('status', filters.status);
    }
    if (filters.cashSessionId !== null) {
      params = params.set('cashSessionId', filters.cashSessionId);
    }
    if (filters.cashierId !== null) {
      params = params.set('cashierId', filters.cashierId);
    }
    if (filters.branchId !== null) {
      params = params.set('branchId', filters.branchId);
    }
    if (filters.from !== null) {
      params = params.set('from', filters.from);
    }
    if (filters.to !== null) {
      params = params.set('to', filters.to);
    }
    return this.http.get<Page<SaleSummaryView>>('/api/v1/sales', { params });
  }

  get(id: number): Observable<SaleView> {
    return this.http.get<SaleView>(`/api/v1/sales/${id}`);
  }

  ticket(id: number): Observable<TicketView> {
    return this.http.get<TicketView>(`/api/v1/sales/${id}/ticket`);
  }
}
