import { db } from '../db/database';
import {
  updateHolding,
  updateCashAccount,
  addTransaction,
  addDividendRecord,
} from '../db/hooks';
import { normalizeCurrencyWithDefault } from '../constants/currencies';
import { holdingKey, toHoldings } from '../utils/positions';
import { fetchDividendEvents, fetchPrice } from './yahooFinance';
import type { Holding } from '../types';

const SYNC_COOLDOWN_KEY = 'lastDividendSync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function shouldSync(): boolean {
  const last = localStorage.getItem(SYNC_COOLDOWN_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > SYNC_INTERVAL_MS;
}

function markSynced() {
  localStorage.setItem(SYNC_COOLDOWN_KEY, Date.now().toString());
}

export async function processDividends(): Promise<number> {
  if (!shouldSync()) return 0;

  const held = (await db.tickers.toArray()).filter(
    (t) => (t.positions ?? []).length > 0
  );
  let processed = 0;

  for (const entry of held) {
    try {
      processed += await processTickerDividends(entry.ticker);
    } catch (err) {
      console.warn(`Dividend processing failed for ${entry.ticker}:`, err);
    }
  }

  markSynced();
  return processed;
}

/**
 * Credit a dividend to a cash entry denominated in the same currency,
 * preferring one in the account that holds the position and falling back to
 * any account. Skips when there is no currency match: adding a EUR payout to
 * a USD balance as a raw number would silently corrupt it, and there is no
 * reliable historical FX rate for the ex-dividend date here.
 */
async function depositToCash(
  amount: number,
  currency: string,
  ticker: string,
  accountId: number
): Promise<void> {
  const ccy = normalizeCurrencyWithDefault(currency);
  const cash = await db.cashAccounts.toArray();
  const candidates = cash.filter(
    (a) => a.id != null && normalizeCurrencyWithDefault(a.currency) === ccy
  );
  const target =
    candidates.find((a) => a.accountId === accountId) ?? candidates[0];

  if (!target?.id) {
    console.warn(
      `Dividend for ${ticker} not deposited: no ${ccy} cash account found`
    );
    return;
  }

  await updateCashAccount(target.id, {
    principal: target.principal + amount,
  });
}

/**
 * Process every position in a ticker. Dividend events are fetched once per
 * ticker; each account's position is paid (and deduplicated) independently.
 */
async function processTickerDividends(ticker: string): Promise<number> {
  const entry = await db.tickers.get(ticker.toUpperCase());
  if (!entry || (entry.positions ?? []).length === 0) return 0;
  const holdings = toHoldings(entry);

  // Fetch from the earliest position's start so every account is covered.
  const sinceDate = new Date(
    Math.min(
      ...holdings.map((h) => new Date(h.addedDate ?? h.createdAt).getTime())
    )
  );
  const events = await fetchDividendEvents(entry.ticker, sinceDate);
  if (events.length === 0) return 0;

  let count = 0;
  for (const holding of holdings) {
    count += await processPositionDividends(holding, events);
  }
  return count;
}

async function processPositionDividends(
  holding: Holding,
  events: Array<{ date: number; amount: number }>
): Promise<number> {
  const upper = holding.ticker.toUpperCase();
  const positionStart = new Date(holding.addedDate ?? holding.createdAt).getTime() / 1000;

  const existing = await db.dividendRecords
    .where('[accountId+ticker+exDate]')
    .between(
      [holding.accountId, upper, -Infinity],
      [holding.accountId, upper, Infinity]
    )
    .toArray();
  const processedDates = new Set(existing.map((r) => r.exDate));

  const taxRate = holding.dividendTaxRate ?? 0;
  const id = holdingKey(holding.accountId, upper);
  let shares = holding.shares;
  let count = 0;

  for (const event of events) {
    if (processedDates.has(event.date)) continue;
    // Events before this account bought in don't belong to it.
    if (event.date < positionStart) continue;

    // Read from the running total, not the snapshot: a single sync can process
    // several missed events, and each DRIP reinvestment increases the share
    // count that the next one pays out on.
    const grossPayout = shares * event.amount;
    const taxWithheld = grossPayout * taxRate;
    const netPayout = grossPayout - taxWithheld;
    let reinvestedShares = 0;

    if (holding.drip && netPayout > 0) {
      const priceData = await fetchPrice(upper);
      const quoteCcy = normalizeCurrencyWithDefault(
        priceData?.currency ?? holding.currency
      );
      const holdingCcy = normalizeCurrencyWithDefault(holding.currency);
      const currentPrice = priceData?.price ?? holding.avgCost;
      if (quoteCcy === holdingCcy && currentPrice > 0) {
        reinvestedShares = netPayout / currentPrice;
        shares += reinvestedShares;
        await updateHolding(id, { shares });
      } else if (quoteCcy !== holdingCcy) {
        console.warn(
          `DRIP skipped for ${upper}: quote ${quoteCcy} vs holding ${holdingCcy}`
        );
      }
    } else if (netPayout > 0) {
      await depositToCash(netPayout, holding.currency, upper, holding.accountId);
    }

    await addDividendRecord({
      holdingId: id,
      accountId: holding.accountId,
      ticker: upper,
      exDate: event.date,
      amount: event.amount,
      totalAmount: grossPayout,
      taxWithheld,
      reinvestedShares,
      processedAt: new Date(),
    });

    const eventDate = new Date(event.date * 1000);
    await addTransaction({
      holdingId: id,
      accountId: holding.accountId,
      ticker: upper,
      type: 'dividend',
      shares: reinvestedShares,
      price: event.amount,
      currency: holding.currency,
      date: eventDate,
      notes: holding.drip
        ? `Auto-dividend: ${event.amount}/sh, reinvested ${reinvestedShares.toFixed(4)} shares (tax ${(taxRate * 100).toFixed(0)}%)`
        : `Auto-dividend: ${event.amount}/sh, ${netPayout.toFixed(2)} deposited to cash`,
    });

    count++;
  }

  return count;
}
