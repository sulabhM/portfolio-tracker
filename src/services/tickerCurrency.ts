import { normalizeCurrency, type CurrencyCode } from '../constants/currencies';
import { fetchPrice, lookupTicker } from './yahooFinance';

/** Reported trading currency for a ticker (Yahoo quote summary / price cache). */
export async function fetchTickerCurrency(
  ticker: string
): Promise<CurrencyCode | undefined> {
  const key = ticker.toUpperCase().trim();
  if (!key) return undefined;

  const cached = await fetchPrice(key);
  if (cached?.currency) {
    return normalizeCurrency(cached.currency);
  }

  const info = await lookupTicker(key);
  if (info?.currency) {
    return normalizeCurrency(info.currency);
  }

  return undefined;
}
