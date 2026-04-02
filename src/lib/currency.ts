const CURRENCY_MAP: Record<string, { symbol: string; name: string }> = {
  TRY: { symbol: '₺', name: 'Turkish Lira' },
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  NGN: { symbol: '₦', name: 'Nigerian Naira' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
};

export type CurrencyCode = keyof typeof CURRENCY_MAP;

export const getCurrencySymbol = (code?: string): string => {
  if (!code) return '₺';
  return CURRENCY_MAP[code]?.symbol ?? code;
};

export const formatPrice = (amount: number, currencyCode?: string): string => {
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${amount.toFixed(2)}`;
};

export const SUPPORTED_CURRENCIES = Object.entries(CURRENCY_MAP).map(([code, info]) => ({
  code,
  ...info,
}));
