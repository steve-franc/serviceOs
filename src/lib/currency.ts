// Only Turkish Lira is supported
export const TRY_CURRENCY = { code: 'TRY', symbol: '₺', name: 'Turkish Lira' } as const;

export type CurrencyCode = 'TRY';

export const getCurrencySymbol = (_code?: string): string => TRY_CURRENCY.symbol;

export const formatPrice = (amount: number, _currencyCode?: string): string => {
  return `${TRY_CURRENCY.symbol}${amount.toFixed(2)}`;
};

// Compact format for tight UI (e.g. stat cards on mobile): 1.2k, 554.3k, 1.5M
export const formatPriceCompact = (amount: number): string => {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${TRY_CURRENCY.symbol}${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${TRY_CURRENCY.symbol}${(amount / 1_000).toFixed(amount % 1_000 === 0 ? 0 : 1)}k`;
  return `${TRY_CURRENCY.symbol}${amount.toFixed(2)}`;
};
