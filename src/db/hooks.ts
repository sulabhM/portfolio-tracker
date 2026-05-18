import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database';
import { notifyDataChanged } from '../services/dataSyncRegistry';
import { DEFAULT_CURRENCY, normalizeCurrencyWithDefault } from '../constants/currencies';
import { PORTFOLIO_AUTO_TAG } from '../constants/autoTags';
import { fetchTickerCurrency } from '../services/tickerCurrency';
import type {
  Holding,
  Transaction,
  Note,
  CashAccount,
  WatchlistItem,
  IntrinsicValue,
  TickerEntry,
  TickerPortfolioInfo,
} from '../types';

function toHolding(entry: TickerEntry): Holding | null {
  if (!entry.portfolio) return null;
  return {
    id: entry.ticker,
    ticker: entry.ticker,
    name: entry.name,
    ...entry.portfolio,
  };
}

function toWatchlistItem(entry: TickerEntry): WatchlistItem {
  return {
    id: entry.ticker,
    ticker: entry.ticker,
    name: entry.name,
    tags: entry.userTags,
    autoTags: entry.autoTags,
    addedAt: entry.addedAt,
  };
}

function intrinsicId(ticker: string, date: Date): string {
  return `${ticker.toUpperCase()}|${new Date(date).toISOString()}`;
}

export function useHoldings() {
  return useLiveQuery(async () => {
    const tickers = await db.tickers.toArray();
    return tickers
      .map(toHolding)
      .filter((h): h is Holding => h != null)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }) ?? [];
}

export function useTransactions(ticker?: string) {
  return useLiveQuery(
    async () => {
      const txs = await db.transactions.toArray();
      const filtered = ticker ? txs.filter((t) => t.ticker === ticker) : txs;
      return filtered.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    [ticker]
  ) ?? [];
}

export function useNotes(tag?: string, ticker?: string) {
  return useLiveQuery(
    async () => {
      let notes = await db.notes.toArray();
      if (tag) notes = notes.filter((n) => n.tags.includes(tag));
      if (ticker) notes = notes.filter((n) => n.tickerLinks.includes(ticker));
      return notes.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },
    [tag, ticker]
  ) ?? [];
}

export function useNote(id: number | undefined) {
  return useLiveQuery(
    () => (id !== undefined ? db.notes.get(id) : undefined),
    [id]
  );
}

export function useAllTags() {
  return useLiveQuery(async () => {
    const notes = await db.notes.toArray();
    const tags = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) tags.add(t);
    }
    return Array.from(tags).sort();
  }) ?? [];
}

export function useCashAccounts() {
  return useLiveQuery(() => db.cashAccounts.toArray()) ?? [];
}

// ---- Holding CRUD ----

export async function addHolding(
  holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>
) {
  const now = new Date();
  const ticker = holding.ticker.toUpperCase();
  const reported =
    (await fetchTickerCurrency(ticker)) ??
    normalizeCurrencyWithDefault(holding.currency);
  const existing = await db.tickers.get(ticker);
  const portfolio: TickerPortfolioInfo = {
    shares: holding.shares,
    avgCost: holding.avgCost,
    currency: reported,
    country: holding.country ?? '',
    sector: holding.sector,
    drip: holding.drip ?? false,
    dividendTaxRate: holding.dividendTaxRate ?? 0,
    addedDate: holding.addedDate ?? now,
    createdAt: now,
    updatedAt: now,
  };
  const autoTags = existing?.autoTags ?? [];
  await db.tickers.put({
    ticker,
    name: holding.name,
    userTags: existing?.userTags ?? [],
    autoTags: autoTags.includes(PORTFOLIO_AUTO_TAG)
      ? autoTags
      : [...autoTags, PORTFOLIO_AUTO_TAG],
    addedAt: existing?.addedAt ?? portfolio.addedDate,
    intrinsicValues: existing?.intrinsicValues ?? [],
    portfolio,
  });
  notifyDataChanged();
  return ticker;
}

export async function updateHolding(id: string, changes: Partial<Holding>) {
  const ticker = id.toUpperCase();
  const existing = await db.tickers.get(ticker);
  if (!existing?.portfolio) return;
  const nextTicker = (changes.ticker ?? ticker).toUpperCase();
  const updated: TickerEntry = {
    ...existing,
    ticker: nextTicker,
    name: changes.name ?? existing.name,
    portfolio: {
      ...existing.portfolio,
      ...changes,
      currency: changes.currency ?? existing.portfolio.currency,
      addedDate: changes.addedDate ?? existing.portfolio.addedDate,
      updatedAt: new Date(),
    },
  };
  if (!updated.autoTags.includes(PORTFOLIO_AUTO_TAG)) {
    updated.autoTags = [...updated.autoTags, PORTFOLIO_AUTO_TAG];
  }
  if (nextTicker !== ticker) {
    await db.transaction('rw', db.tickers, async () => {
      await db.tickers.delete(ticker);
      await db.tickers.put(updated);
    });
  } else {
    await db.tickers.put(updated);
  }
  notifyDataChanged();
}

export async function deleteHolding(id: string) {
  const ticker = id.toUpperCase();
  const existing = await db.tickers.get(ticker);
  if (!existing) return;
  await db.tickers.put({
    ...existing,
    autoTags: existing.autoTags.filter((t) => t !== PORTFOLIO_AUTO_TAG),
    portfolio: undefined,
  });
  notifyDataChanged();
}

// ---- Transaction CRUD ----

export async function addTransaction(tx: Omit<Transaction, 'id'>) {
  const id = await db.transactions.add({
    ...tx,
    currency: tx.currency ?? DEFAULT_CURRENCY,
  });
  notifyDataChanged();
  return id;
}

export async function deleteTransaction(id: number) {
  await db.transactions.delete(id);
  notifyDataChanged();
}

// ---- Note CRUD ----

export async function addNote(
  note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>
) {
  const now = new Date();
  const id = await db.notes.add({ ...note, createdAt: now, updatedAt: now });
  notifyDataChanged();
  return id;
}

export async function updateNote(id: number, changes: Partial<Note>) {
  await db.notes.update(id, { ...changes, updatedAt: new Date() });
  notifyDataChanged();
}

export async function deleteNote(id: number) {
  await db.notes.delete(id);
  notifyDataChanged();
}

// ---- Cash Account CRUD ----

export async function addCashAccount(
  account: Omit<CashAccount, 'id' | 'createdAt'>
) {
  const id = await db.cashAccounts.add({
    ...account,
    currency: account.currency ?? DEFAULT_CURRENCY,
    createdAt: new Date(),
  });
  notifyDataChanged();
  return id;
}

export async function updateCashAccount(
  id: number,
  changes: Partial<CashAccount>
) {
  await db.cashAccounts.update(id, changes);
  notifyDataChanged();
}

export async function deleteCashAccount(id: number) {
  await db.cashAccounts.delete(id);
  notifyDataChanged();
}

// ---- Watchlist CRUD ----

export function useWatchlist() {
  return useLiveQuery(async () => {
    const tickers = await db.tickers.toArray();
    return tickers
      .map(toWatchlistItem)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }) ?? [];
}

export function useWatchlistTags() {
  return useLiveQuery(async () => {
    const items = await db.tickers.toArray();
    const tags = new Set<string>();
    for (const w of items) {
      for (const t of w.userTags) tags.add(t);
      for (const t of w.autoTags ?? []) tags.add(t);
    }
    return Array.from(tags).sort();
  }) ?? [];
}

export async function addWatchlistItem(
  item: Omit<WatchlistItem, 'id' | 'addedAt' | 'autoTags'> & {
    autoTags?: string[];
  }
) {
  const ticker = item.ticker.toUpperCase();
  const existing = await db.tickers.get(ticker);
  if (existing) return existing.ticker;
  await db.tickers.add({
    ticker,
    name: item.name,
    userTags: item.tags,
    autoTags: item.autoTags ?? [],
    intrinsicValues: [],
    addedAt: new Date(),
  });
  notifyDataChanged();
  return ticker;
}

export async function updateWatchlistItem(
  id: string,
  changes: Partial<WatchlistItem>
) {
  const ticker = id.toUpperCase();
  const existing = await db.tickers.get(ticker);
  if (!existing) return;
  await db.tickers.put({
    ...existing,
    ticker: changes.ticker?.toUpperCase() ?? existing.ticker,
    name: changes.name ?? existing.name,
    userTags: changes.tags ?? existing.userTags,
    autoTags: changes.autoTags ?? existing.autoTags,
    addedAt: changes.addedAt ?? existing.addedAt,
  });
  notifyDataChanged();
}

export async function deleteWatchlistItem(id: string) {
  await db.tickers.delete(id.toUpperCase());
  notifyDataChanged();
}

// ---- Intrinsic Value CRUD ----

export function useIntrinsicValues(ticker?: string) {
  return useLiveQuery(
    async () => {
      if (!ticker) return [];
      const entry = await db.tickers.get(ticker.toUpperCase());
      return (entry?.intrinsicValues ?? [])
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((iv) => ({
          ...iv,
          id: intrinsicId(ticker, iv.date),
          ticker: ticker.toUpperCase(),
        }));
    },
    [ticker]
  ) ?? [];
}

export function useLatestIntrinsicValues() {
  return useLiveQuery(async () => {
    const all = await db.tickers.toArray();
    const latest = new Map<string, IntrinsicValue>();
    for (const entry of all) {
      for (const iv of entry.intrinsicValues) {
        const value = {
          ...iv,
          id: intrinsicId(entry.ticker, iv.date),
          ticker: entry.ticker,
        };
        const existing = latest.get(entry.ticker);
        if (
          !existing ||
          new Date(value.date).getTime() > new Date(existing.date).getTime()
        ) {
          latest.set(entry.ticker, value);
        }
      }
    }
    return latest;
  }) ?? new Map<string, IntrinsicValue>();
}

export async function addIntrinsicValue(
  ticker: string,
  value: number,
  date?: Date,
  currency?: string
) {
  const reported =
    (await fetchTickerCurrency(ticker)) ??
    normalizeCurrencyWithDefault(currency);
  const key = ticker.toUpperCase();
  const entry = await db.tickers.get(key);
  const intrinsicValues = [
    ...(entry?.intrinsicValues ?? []),
    { value, currency: reported, date: date ?? new Date() },
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  await db.tickers.put({
    ticker: key,
    name: entry?.name ?? key,
    userTags: entry?.userTags ?? [],
    autoTags: entry?.autoTags ?? [],
    addedAt: entry?.addedAt ?? new Date(),
    portfolio: entry?.portfolio,
    intrinsicValues,
  });
  notifyDataChanged();
  return intrinsicId(key, date ?? new Date());
}

export async function deleteIntrinsicValue(id: string) {
  const [ticker, isoDate] = id.split('|');
  const entry = await db.tickers.get(ticker);
  if (!entry) return;
  await db.tickers.put({
    ...entry,
    intrinsicValues: entry.intrinsicValues.filter(
      (iv) => new Date(iv.date).toISOString() !== isoDate
    ),
  });
  notifyDataChanged();
}

// ---- Portfolio-to-Watchlist Sync ----

export async function syncPortfolioToWatchlist() {
  await db.transaction('rw', db.tickers, async () => {
    const entries = await db.tickers.toArray();
    for (const entry of entries) {
      const hasPortfolio = !!entry.portfolio;
      const hasTag = entry.autoTags.includes(PORTFOLIO_AUTO_TAG);
      if (hasPortfolio && !hasTag) {
        await db.tickers.update(entry.ticker, {
          autoTags: [...entry.autoTags, PORTFOLIO_AUTO_TAG],
        });
      } else if (!hasPortfolio && hasTag) {
        await db.tickers.update(entry.ticker, {
          autoTags: entry.autoTags.filter((t) => t !== PORTFOLIO_AUTO_TAG),
        });
      }
    }
  });
  notifyDataChanged();
}
