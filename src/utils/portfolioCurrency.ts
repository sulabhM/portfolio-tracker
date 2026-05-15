import {
  normalizeCurrency,
  normalizeCurrencyWithDefault,
  DEFAULT_CURRENCY,
} from '../constants/currencies';
import { toUsd } from '../services/exchangeRates';
import type { Holding, CashAccount, PriceData } from '../types';

export function quoteCurrency(
  price: PriceData | undefined,
  holding: Holding
): string {
  return (
    normalizeCurrency(price?.currency) ??
    normalizeCurrency(holding.currency) ??
    DEFAULT_CURRENCY
  );
}

export function collectPortfolioCurrencies(
  holdings: Holding[],
  cashAccounts: CashAccount[],
  prices: Map<string, PriceData>
): string[] {
  const set = new Set<string>([DEFAULT_CURRENCY]);
  for (const h of holdings) {
    const hc = normalizeCurrency(h.currency);
    if (hc) set.add(hc);
    const p = prices.get(h.ticker.toUpperCase());
    const pc = normalizeCurrency(p?.currency);
    if (pc) set.add(pc);
  }
  for (const a of cashAccounts) {
    const ac = normalizeCurrencyWithDefault(a.currency);
    set.add(ac);
  }
  return [...set];
}

export { toUsd };
