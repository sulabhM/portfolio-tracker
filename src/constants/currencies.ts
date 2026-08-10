/** ISO 4217 codes supported in forms and conversion. */
export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'CHF'
  | 'CNY'
  | 'HKD'
  | 'INR'
  | 'NZD'
  | 'SEK'
  | 'NOK'
  | 'DKK'
  | 'SGD'
  | 'KRW'
  | 'MXN'
  | 'BRL'
  | 'ZAR'
  | 'ILS';

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'CNY', label: 'CNY — Chinese Yuan' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'INR', label: 'INR — Indian Rupee' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'SEK', label: 'SEK — Swedish Krona' },
  { code: 'NOK', label: 'NOK — Norwegian Krone' },
  { code: 'DKK', label: 'DKK — Danish Krone' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'KRW', label: 'KRW — South Korean Won' },
  { code: 'MXN', label: 'MXN — Mexican Peso' },
  { code: 'BRL', label: 'BRL — Brazilian Real' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'ILS', label: 'ILS — Israeli Shekel' },
];

/** Map a reported ISO code to a supported code, or undefined if missing/invalid. */
export function normalizeCurrency(
  code: string | undefined | null
): CurrencyCode | undefined {
  const upper = (code ?? '').toUpperCase().trim();
  if (!upper) return undefined;
  if (SUPPORTED_CURRENCIES.some((c) => c.code === upper)) {
    return upper as CurrencyCode;
  }
  if (/^[A-Z]{3}$/.test(upper)) {
    return upper as CurrencyCode;
  }
  return undefined;
}

/** Like normalizeCurrency but falls back to USD (cash accounts, USD dashboard totals). */
export function normalizeCurrencyWithDefault(
  code: string | undefined | null
): CurrencyCode {
  return normalizeCurrency(code) ?? DEFAULT_CURRENCY;
}

/**
 * Some exchanges quote in a sub-unit rather than the major currency: London in
 * pence (`GBp`/`GBX`), Johannesburg in cents (`ZAc`), Tel Aviv in agorot
 * (`ILA`). These are case-sensitive — `GBp` is pence, `GBP` is pounds — so they
 * must be detected before any uppercasing.
 */
const SUB_UNIT_QUOTES: Record<string, { code: CurrencyCode; scale: number }> = {
  GBp: { code: 'GBP', scale: 0.01 },
  GBX: { code: 'GBP', scale: 0.01 },
  ZAc: { code: 'ZAR', scale: 0.01 },
  ZAX: { code: 'ZAR', scale: 0.01 },
  ILA: { code: 'ILS', scale: 0.01 },
};

/**
 * Resolve a currency as reported by a quote feed into a major-unit ISO code
 * plus the factor needed to convert quoted amounts into that major unit.
 * Multiply every price-like field by `scale` before storing or displaying.
 */
export function parseQuotedCurrency(code: string | undefined | null): {
  code: CurrencyCode;
  scale: number;
} {
  const trimmed = (code ?? '').trim();
  const subUnit =
    SUB_UNIT_QUOTES[trimmed] ??
    (trimmed.toUpperCase() === 'GBX'
      ? SUB_UNIT_QUOTES.GBX
      : undefined);
  if (subUnit) return subUnit;
  return { code: normalizeCurrencyWithDefault(trimmed), scale: 1 };
}
