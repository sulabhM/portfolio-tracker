import { normalizeCurrencyWithDefault, DEFAULT_CURRENCY } from '../constants/currencies';

/** Format a value in US dollars (portfolio totals, dashboard). */
export function formatCurrency(value: number): string {
  return formatMoney(value, DEFAULT_CURRENCY);
}

/**
 * Format a value in the given ISO 4217 currency (quotes, per-holding amounts).
 * A non-finite value means the amount could not be determined (e.g. missing FX
 * rate) and renders as a dash rather than "$NaN".
 */
export function formatMoney(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '—';
  const code = normalizeCurrencyWithDefault(currency);
  const fractionDigits = code === 'JPY' || code === 'KRW' ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
