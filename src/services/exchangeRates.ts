import { normalizeCurrencyWithDefault, DEFAULT_CURRENCY } from '../constants/currencies';
import { getBaseUrl, yahooFetch } from './yahooFinance';

const CACHE_DURATION_MS = 15 * 60 * 1000;

/** USD per 1 unit of the given currency (multiply local amount by this for USD). */
const rateCache = new Map<string, { rate: number; at: number }>();

function parseChartPrice(data: unknown): number | null {
  const result = (data as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } })
    ?.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  return typeof price === 'number' && price > 0 ? price : null;
}

async function fetchFxPairPrice(pair: string): Promise<number | null> {
  try {
    const url = `${getBaseUrl()}/v8/finance/chart/${encodeURIComponent(pair)}?interval=1d&range=1d`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return parseChartPrice(data);
  } catch {
    return null;
  }
}

/**
 * Returns how many USD one unit of `currency` is worth.
 * Uses Yahoo FX pairs (e.g. EURUSD=X or USDJPY=X).
 */
export async function fetchRateToUsd(currency: string): Promise<number> {
  const ccy = normalizeCurrencyWithDefault(currency);
  if (ccy === DEFAULT_CURRENCY) return 1;

  const cached = rateCache.get(ccy);
  if (cached && Date.now() - cached.at < CACHE_DURATION_MS) {
    return cached.rate;
  }

  const directPair = `${ccy}USD=X`;
  const direct = await fetchFxPairPrice(directPair);
  if (direct != null) {
    rateCache.set(ccy, { rate: direct, at: Date.now() });
    return direct;
  }

  const inversePair = `USD${ccy}=X`;
  const inverse = await fetchFxPairPrice(inversePair);
  if (inverse != null) {
    const rate = 1 / inverse;
    rateCache.set(ccy, { rate, at: Date.now() });
    return rate;
  }

  console.warn(`Could not fetch FX rate for ${ccy}; treating as 1:1 with USD`);
  return 1;
}

export async function fetchRatesToUsd(
  currencies: string[]
): Promise<Map<string, number>> {
  const unique = [...new Set(currencies.map(normalizeCurrencyWithDefault))];
  const rates = new Map<string, number>();
  rates.set(DEFAULT_CURRENCY, 1);

  await Promise.allSettled(
    unique
      .filter((c) => c !== DEFAULT_CURRENCY)
      .map(async (c) => {
        rates.set(c, await fetchRateToUsd(c));
      })
  );

  for (const c of unique) {
    if (!rates.has(c)) rates.set(c, 1);
  }

  return rates;
}

export function clearExchangeRateCache(): void {
  rateCache.clear();
}

export function toUsd(
  amount: number,
  currency: string,
  rates: Map<string, number>
): number {
  const ccy = normalizeCurrencyWithDefault(currency);
  if (ccy === DEFAULT_CURRENCY) return amount;
  return amount * (rates.get(ccy) ?? 1);
}
