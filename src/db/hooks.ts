import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database';
import { notifyDataChanged } from '../services/dataSyncRegistry';
import type { Holding, Transaction, Note, CashAccount, WatchlistItem, IntrinsicValue } from '../types';

export function useHoldings() {
  return useLiveQuery(() => db.holdings.toArray()) ?? [];
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
  const id = await db.holdings.add({
    ...holding,
    country: holding.country ?? '',
    drip: holding.drip ?? false,
    dividendTaxRate: holding.dividendTaxRate ?? 0,
    addedDate: holding.addedDate ?? now,
    createdAt: now,
    updatedAt: now,
  });
  notifyDataChanged();
  return id;
}

export async function updateHolding(id: number, changes: Partial<Holding>) {
  await db.holdings.update(id, { ...changes, updatedAt: new Date() });
  notifyDataChanged();
}

export async function deleteHolding(id: number) {
  await db.holdings.delete(id);
  notifyDataChanged();
}

// ---- Transaction CRUD ----

export async function addTransaction(tx: Omit<Transaction, 'id'>) {
  const id = await db.transactions.add({ ...tx });
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
  const id = await db.cashAccounts.add({ ...account, createdAt: new Date() });
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
  return useLiveQuery(() => db.watchlist.toArray()) ?? [];
}

export function useWatchlistTags() {
  return useLiveQuery(async () => {
    const items = await db.watchlist.toArray();
    const tags = new Set<string>();
    for (const w of items) {
      for (const t of w.tags) tags.add(t);
    }
    return Array.from(tags).sort();
  }) ?? [];
}

export async function addWatchlistItem(
  item: Omit<WatchlistItem, 'id' | 'addedAt'>
) {
  const existing = await db.watchlist
    .where('ticker')
    .equals(item.ticker.toUpperCase())
    .first();
  if (existing) return existing.id!;
  const id = await db.watchlist.add({
    ...item,
    ticker: item.ticker.toUpperCase(),
    addedAt: new Date(),
  });
  notifyDataChanged();
  return id;
}

export async function updateWatchlistItem(
  id: number,
  changes: Partial<WatchlistItem>
) {
  await db.watchlist.update(id, changes);
  notifyDataChanged();
}

export async function deleteWatchlistItem(id: number) {
  await db.watchlist.delete(id);
  notifyDataChanged();
}

// ---- Intrinsic Value CRUD ----

export function useIntrinsicValues(ticker?: string) {
  return useLiveQuery(
    async () => {
      if (!ticker) return [];
      return db.intrinsicValues
        .where('ticker')
        .equals(ticker.toUpperCase())
        .sortBy('date');
    },
    [ticker]
  ) ?? [];
}

export function useLatestIntrinsicValues() {
  return useLiveQuery(async () => {
    const all = await db.intrinsicValues.toArray();
    const latest = new Map<string, IntrinsicValue>();
    for (const iv of all) {
      const existing = latest.get(iv.ticker);
      if (
        !existing ||
        new Date(iv.date).getTime() > new Date(existing.date).getTime()
      ) {
        latest.set(iv.ticker, iv);
      }
    }
    return latest;
  }) ?? new Map<string, IntrinsicValue>();
}

export async function addIntrinsicValue(ticker: string, value: number, date?: Date) {
  const id = await db.intrinsicValues.add({
    ticker: ticker.toUpperCase(),
    value,
    date: date ?? new Date(),
  });
  notifyDataChanged();
  return id;
}

export async function deleteIntrinsicValue(id: number) {
  await db.intrinsicValues.delete(id);
  notifyDataChanged();
}

// ---- Portfolio-to-Watchlist Sync ----

export async function syncPortfolioToWatchlist() {
  // Deduplicate any existing duplicate tickers
  await db.transaction('rw', db.watchlist, async () => {
    const all = await db.watchlist.toArray();
    const seen = new Map<string, number>();
    for (const w of all) {
      if (seen.has(w.ticker)) {
        await db.watchlist.delete(w.id!);
      } else {
        seen.set(w.ticker, w.id!);
      }
    }
  });

  await db.transaction('rw', db.watchlist, db.holdings, async () => {
    const holdings = await db.holdings.toArray();
    const existing = await db.watchlist.toArray();
    const existingByTicker = new Map(existing.map((w) => [w.ticker, w]));
    const portfolioTag = 'portfolio';

    for (const h of holdings) {
      const key = h.ticker.toUpperCase();
      const item = existingByTicker.get(key);
      if (item) {
        if (!item.tags.includes(portfolioTag)) {
          await db.watchlist.update(item.id!, {
            tags: [...item.tags, portfolioTag],
          });
        }
      } else {
        await db.watchlist.add({
          ticker: key,
          name: h.name,
          tags: [portfolioTag],
          addedAt: new Date(),
        });
      }
    }

    const holdingTickers = new Set(
      holdings.map((h) => h.ticker.toUpperCase())
    );
    for (const w of existing) {
      if (w.tags.includes(portfolioTag) && !holdingTickers.has(w.ticker)) {
        const newTags = w.tags.filter((t) => t !== portfolioTag);
        if (newTags.length === 0) {
          await db.watchlist.delete(w.id!);
        } else {
          await db.watchlist.update(w.id!, { tags: newTags });
        }
      }
    }
  });
  notifyDataChanged();
}
