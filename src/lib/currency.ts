// Only Turkish Lira is supported
export const TRY_CURRENCY = { code: 'TRY', symbol: '₺', name: 'Turkish Lira' } as const;

export type CurrencyCode = 'TRY';

export const getCurrencySymbol = (_code?: string): string => TRY_CURRENCY.symbol;

export const formatPrice = (amount: number, _currencyCode?: string): string => {
  return `${TRY_CURRENCY.symbol}${amount.toFixed(2)}`;
};
