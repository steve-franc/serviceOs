export interface PaymentMethodConfig {
  name: string;
  currency: string;
  account_number: string;
  conversion_rate: number;
}

export const DEFAULT_PAYMENT_METHOD_CONFIGS: PaymentMethodConfig[] = [
  { name: "Cash", currency: "TRY", account_number: "", conversion_rate: 1 },
  { name: "Card", currency: "TRY", account_number: "", conversion_rate: 1 },
];

export function parsePaymentMethods(raw: unknown): PaymentMethodConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_PAYMENT_METHOD_CONFIGS];
  
  // Handle legacy string arrays
  if (typeof raw[0] === "string") {
    return raw.map((name: string) => ({
      name,
      currency: "TRY",
      account_number: "",
      conversion_rate: 1,
    }));
  }
  
  // Object array
  return raw.map((item: any) => ({
    name: item.name || "Unknown",
    currency: item.currency || "TRY",
    account_number: item.account_number || "",
    conversion_rate: Number(item.conversion_rate) || 1,
  }));
}

export function getMethodNames(methods: PaymentMethodConfig[]): string[] {
  return methods.map(m => m.name);
}
