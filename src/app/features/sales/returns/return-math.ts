import { QUANTITY_PATTERN, amountToCents, numberToCents } from '../../../shared/forms/amounts';

/**
 * Un reembolso de la devolución del mismo día, antes de enviarla. Tiene clave para quitarlo; no se
 * edita después de agregarlo. amount va como texto con dos decimales, tal como se envía.
 */
export interface RefundDraft {
  readonly key: number;
  readonly paymentMethodCode: string;
  readonly methodName: string;
  readonly amount: string;
  readonly reference: string | null;
}

/**
 * Forma de reembolso que se ofrece en el formulario: efectivo o un método de pago de la venta.
 * refundable es lo que todavía se puede devolver con ese método; null (efectivo) no tiene tope.
 */
export interface RefundOption {
  readonly code: string;
  readonly name: string;
  readonly requiresReference: boolean;
  readonly refundable: number | null;
}

/**
 * Milésimas de una cantidad escrita. Vacía vale cero; un texto que no es cantidad da null. Así una
 * línea sin cantidad no cuenta como error.
 */
export function quantityThousandths(text: string): number | null {
  const value = text.trim();
  if (value === '') {
    return 0;
  }
  if (!QUANTITY_PATTERN.test(value)) {
    return null;
  }
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}

/**
 * Validación de una cantidad a devolver: claves de error del formato o del máximo, o null si es
 * válida. maxThousandths es lo que la línea todavía puede devolver.
 */
export function returnQuantityError(text: string, maxThousandths: number): 'format' | 'max' | null {
  const thousandths = quantityThousandths(text);
  if (thousandths === null) {
    return 'format';
  }
  return thousandths > maxThousandths ? 'max' : null;
}

/** Suma de reembolsos, en centavos. */
export function sumRefundsCents(refunds: readonly { readonly amount: string }[]): number {
  return refunds.reduce((sum, refund) => sum + (amountToCents(refund.amount) ?? 0), 0);
}

/**
 * Clave de traducción del error de un reembolso que se quiere agregar, o null si es válido. El tope
 * de un método distinto de efectivo cuenta lo que ya se reembolsó con ese método en esta devolución.
 */
export function refundError(
  input: { readonly amount: string; readonly reference: string },
  option: RefundOption,
  alreadyRefundedCents: number,
  pendingCents: number,
): string | null {
  const amount = amountToCents(input.amount);
  if (amount === null || amount <= 0) {
    return 'error.INVALID_PAYMENT_AMOUNT';
  }
  if (pendingCents <= 0) {
    return 'sales.checkout.nothingPending';
  }
  if (amount > pendingCents) {
    return 'sales.return.refund.exceedsPending';
  }
  if (option.refundable !== null && amount + alreadyRefundedCents > numberToCents(option.refundable)) {
    return 'sales.return.refund.exceedsRefundable';
  }
  if (option.requiresReference && input.reference.trim() === '') {
    return 'sales.checkout.referenceRequired';
  }
  return null;
}
