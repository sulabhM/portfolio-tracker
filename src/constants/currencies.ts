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
  | 'ZAR';

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
