/**
 * Order revenue helpers — single source of truth for "what counts as revenue today".
 *
 * Rule: Only PAID + CONFIRMED orders contribute to revenue.
 * Unpaid orders are tracked separately and shown as a deduction.
 */

export interface RevenueOrder {
  total: number | string;
  status?: string | null;
  payment_status?: string | null;
}

/** Sum of paid + confirmed orders. */
export function sumPaidRevenue(orders: RevenueOrder[]): number {
  return orders.reduce((sum, o) => {
    const status = o.status ?? "confirmed";
    const paid = (o.payment_status ?? "paid") === "paid";
    if (status !== "confirmed" || !paid) return sum;
    return sum + Number(o.total || 0);
  }, 0);
}

/** Sum of unpaid + confirmed orders (the deduction). */
export function sumUnpaidRevenue(orders: RevenueOrder[]): number {
  return orders.reduce((sum, o) => {
    const status = o.status ?? "confirmed";
    const unpaid = (o.payment_status ?? "paid") === "unpaid";
    if (status !== "confirmed" || !unpaid) return sum;
    return sum + Number(o.total || 0);
  }, 0);
}

/**
 * Daily share of fixed monthly bills, fixed at /30 per business rule.
 */
export function dailyBillsTarget(monthlyTotal: number): number {
  return (monthlyTotal || 0) / 30;
}
