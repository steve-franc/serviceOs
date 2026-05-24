// Per-restaurant currency support. The active currency is set when the
// restaurant's settings load (see useRestaurantAndRole / PublicOrder), and
// all formatPrice/formatPriceCompact calls without an explicit code use it.

// Curated common currencies for the picker. Any ISO 4217 code is still
// accepted by formatPrice via Intl.NumberFormat.
export const SUPPORTED_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "DH" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "TWD", name: "Taiwan Dollar", symbol: "NT$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "CLP", name: "Chilean Peso", symbol: "$" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Złoty", symbol: "zł" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "UAH", name: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
  { code: "JOD", name: "Jordanian Dinar", symbol: "JD" },
  { code: "LBP", name: "Lebanese Pound", symbol: "ل.ل" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
  { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
  { code: "OMR", name: "Omani Rial", symbol: "OMR" },
];

export type CurrencyCode = string;

let _active: string = "TRY";

export function setActiveCurrency(code: string | null | undefined) {
  if (!code) return;
  _active = String(code).toUpperCase();
}

export function getActiveCurrency(): string {
  return _active;
}

function fallbackSymbol(code: string): string {
  const m = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return m?.symbol ?? code;
}

export const getCurrencySymbol = (code?: string | null): string => {
  const c = (code || _active || "TRY").toUpperCase();
  try {
    // Use Intl to extract the symbol part for any ISO code.
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: c,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    if (sym) return sym;
  } catch {
    /* invalid code — fall through */
  }
  return fallbackSymbol(c);
};

export const formatPrice = (amount: number, code?: string | null): string => {
  const c = (code || _active || "TRY").toUpperCase();
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: c,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${fallbackSymbol(c)}${value.toFixed(2)}`;
  }
};

// Compact format for tight UI (e.g. stat cards on mobile): 1.2k, 554.3k, 1.5M
export const formatPriceCompact = (amount: number, code?: string | null): string => {
  const sym = getCurrencySymbol(code);
  const value = Number.isFinite(amount) ? amount : 0;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${sym}${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return formatPrice(value, code);
};

// Kept for backwards compatibility with any old imports.
export const TRY_CURRENCY = { code: "TRY", symbol: "₺", name: "Turkish Lira" } as const;
