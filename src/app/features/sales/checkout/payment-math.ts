import { PaymentRequest } from '../../../core/api/sales-api';
import { amountToCents, centsToAmount } from '../../../shared/forms/amounts';

/** Código del método de pago con tarjeta; solo para él se envían los cuatro últimos dígitos. */
const CARD_METHOD = 'CARD';

/** Reglas de un método de pago que se usan al agregar un pago. */
export interface PaymentMethodRules {
  readonly code: string;
  readonly requiresReference: boolean;
  readonly allowsChange: boolean;
}

/** Lo que la persona escribió en el formulario de pago, como texto. */
export interface PaymentInput {
  readonly amount: string;
  readonly amountReceived: string;
  readonly reference: string;
  readonly cardLast4: string;
}

/** Un pago que se acaba de agregar: el nombre del método para mostrarlo y el cuerpo que se envía. */
export interface NewPayment {
  readonly methodName: string;
  readonly request: PaymentRequest;
}

/** Pago agregado en la pantalla de cobro. Tiene clave para quitarlo; no se edita después de agregarlo. */
export interface AddedPayment extends NewPayment {
  readonly key: number;
}

/** Suma de los montos aplicados a la venta, en centavos. */
export function paidOf(payments: readonly PaymentRequest[]): number {
  return payments.reduce((sum, payment) => sum + (amountToCents(payment.amount) ?? 0), 0);
}

/**
 * Vuelto total, en centavos: en cada pago en efectivo que recibió más de lo que se aplica, la
 * diferencia. Un pago sin monto recibido no da vuelto.
 */
export function changeOf(payments: readonly PaymentRequest[]): number {
  return payments.reduce((sum, payment) => {
    if (payment.amountReceived === null) {
      return sum;
    }
    const amount = amountToCents(payment.amount) ?? 0;
    const received = amountToCents(payment.amountReceived) ?? amount;
    return sum + Math.max(0, received - amount);
  }, 0);
}

/** Lo que falta por cobrar, en centavos. Negativo si los pagos superan el total. */
export function pendingOf(totalCents: number, payments: readonly PaymentRequest[]): number {
  return totalCents - paidOf(payments);
}

/**
 * La venta se puede cobrar cuando hay al menos un pago y los pagos suman exactamente el total
 * (el servidor rechaza una suma distinta).
 */
export function canConfirmPayments(totalCents: number, payments: readonly PaymentRequest[]): boolean {
  return payments.length > 0 && pendingOf(totalCents, payments) === 0;
}

/** Monto que se propone para un pago nuevo: lo que falta, sin negativos. */
export function suggestedAmount(pendingCents: number): string {
  return centsToAmount(Math.max(0, pendingCents));
}

/**
 * Clave de traducción del error de un pago que se quiere agregar, o null si es válido. Las reglas
 * de cada método (referencia, monto recibido) dependen de la configuración de ese método.
 */
export function paymentError(input: PaymentInput, method: PaymentMethodRules): string | null {
  const amount = amountToCents(input.amount);
  if (amount === null || amount <= 0) {
    return 'error.INVALID_PAYMENT_AMOUNT';
  }
  if (method.requiresReference && input.reference.trim() === '') {
    return 'sales.checkout.referenceRequired';
  }
  if (method.allowsChange && input.amountReceived.trim() !== '') {
    const received = amountToCents(input.amountReceived);
    if (received !== null && received < amount) {
      return 'error.AMOUNT_RECEIVED_TOO_LOW';
    }
  }
  return null;
}

/** Cuerpo de un pago. amountReceived solo para métodos que dan vuelto (por defecto, el mismo monto). */
export function toPaymentRequest(input: PaymentInput, method: PaymentMethodRules): PaymentRequest {
  const amount = input.amount.trim();
  const cardLast4 = input.cardLast4.trim();
  return {
    paymentMethodCode: method.code,
    amount,
    amountReceived: method.allowsChange ? input.amountReceived.trim() || amount : null,
    reference: method.requiresReference ? input.reference.trim() : null,
    cardLast4: method.code === CARD_METHOD && cardLast4 !== '' ? cardLast4 : null,
  };
}
