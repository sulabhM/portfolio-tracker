import type { CashAccount, Holding, PriceData } from '../types';
import { quoteCurrency, toUsd } from './portfolioCurrency';
import { valueCashAccount } from './cashAccount';

export interface EffectivePrice {
  price: number;
  change: number;
  changePercent: number;
  isExtended: boolean;
}

export type PriceResolver = (
  p: PriceData | undefined,
  fallbackPrice?: number
) => EffectivePrice;

export interface PortfolioTotals {
  /** Market value of securities, USD. */
  securities: number;
  /** Cost basis of securities, USD. */
  cost: number;
  /** Today's value of cash & deposits, USD. */
  cash: number;
  /** securities + cash */
  total: number;
  /** securities - cost */
  pnl: number;
  pnlPct: number;
  /** Sum of today's price moves across held securities, USD. */
  dayChange: number;
  dayChangePct: number;
  /** Positions with a live quote; day change is only meaningful when > 0. */
  pricedCount: number;
}

/**
 * Aggregate a set of holdings and cash entries into USD totals. Pure so the
 * same numbers appear in the summary strip, account group headers and the
 * dashboard regardless of which subset is passed in.
 */
export function computePortfolioTotals(
  holdings: Holding[],
  cash: CashAccount[],
  prices: Map<string, PriceData>,
  rates: Map<string, number>,
  resolve: PriceResolver
): PortfolioTotals {
  let securities = 0;
  let cost = 0;
  let dayChange = 0;
  let pricedCount = 0;

  for (const h of holdings) {
    const raw = prices.get(h.ticker.toUpperCase());
    const ep = resolve(raw, h.avgCost);
    const qCcy = quoteCurrency(raw, h);
    securities += toUsd(h.shares * ep.price, qCcy, rates);
    cost += toUsd(h.shares * h.avgCost, h.currency, rates);
    if (raw) {
      pricedCount++;
      dayChange += toUsd(h.shares * ep.change, qCcy, rates);
    }
  }

  let cashValue = 0;
  for (const c of cash) {
    cashValue += toUsd(valueCashAccount(c).value, c.currency, rates);
  }

  const pnl = securities - cost;
  const prevClose = securities - dayChange;
  return {
    securities,
    cost,
    cash: cashValue,
    total: securities + cashValue,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    dayChange,
    dayChangePct: prevClose > 0 ? (dayChange / prevClose) * 100 : 0,
    pricedCount,
  };
}
