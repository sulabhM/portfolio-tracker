import { DEFAULT_CURRENCY } from '../constants/currencies';
import {
  PORTFOLIO_AUTO_TAG,
  splitLegacyTags,
} from '../constants/autoTags';
import { db } from '../db/database';
import type {
  Holding,
  Transaction,
  Note,
  CashAccount,
  DividendRecord,
  WatchlistItem,
  IntrinsicValue,
} from '../types';

const BACKUP_VERSION = 2;

/** Per-ticker portfolio info. Present only when the ticker is in the portfolio. */
export interface TickerPortfolioInfo {
  shares: number;
  avgCost: number;
  /** ISO 4217 currency for avgCost and cost basis. */
  currency: string;
  sector: string;
  country: string;
  drip: boolean;
  dividendTaxRate: number;
  /** ISO date string. */
  addedDate: string;
  /** ISO date string. */
  createdAt: string;
  /** ISO date string. */
  updatedAt: string;
}

/** Single intrinsic-value entry attached to a ticker. */
export interface TickerIntrinsicValue {
  value: number;
  /** ISO 4217 currency. */
  currency: string;
  /** ISO date string. */
  date: string;
}

/** Flattened per-ticker entry: every ticker is on the watchlist; some are also in the portfolio. */
export interface TickerEntry {
  ticker: string;
  name: string;
  /** User-specified tags. */
  userTags: string[];
  /**
   * Auto-generated tags derived from data sources (Yahoo recommendation,
   * dividend status, portfolio membership). Refreshed on every data refresh
   * and on portfolio changes; never edited by the user directly.
   */
  autoTags: string[];
  /** ISO date string for when the ticker was first added to the watchlist. */
  addedAt: string;
  /** Present iff the ticker is in the portfolio. */
  portfolio?: TickerPortfolioInfo;
  /** Sorted ascending by date. */
  intrinsicValues: TickerIntrinsicValue[];
}

/** Serialized shape for JSON (dates as ISO strings). */
export interface BackupData {
  version: number;
  exportedAt: string;
  tickers: TickerEntry[];
  transactions: Array<Omit<Transaction, 'date'> & { date: string }>;
  notes: Array<Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
  cashAccounts: Array<Omit<CashAccount, 'lastInterestDate' | 'createdAt'> & { lastInterestDate: string; createdAt: string }>;
  dividendRecords: Array<Omit<DividendRecord, 'processedAt'> & { processedAt: string }>;
}

/** Legacy v1 backup shape, kept for backward-compatible imports. */
interface BackupDataV1 {
  version: 1;
  exportedAt: string;
  holdings: Array<Omit<Holding, 'addedDate' | 'createdAt' | 'updatedAt'> & { addedDate: string; createdAt: string; updatedAt: string }>;
  transactions: BackupData['transactions'];
  notes: BackupData['notes'];
  cashAccounts: BackupData['cashAccounts'];
  dividendRecords: BackupData['dividendRecords'];
  watchlist: Array<Omit<WatchlistItem, 'addedAt'> & { addedAt: string }>;
  intrinsicValues: Array<Omit<IntrinsicValue, 'date'> & { date: string }>;
}

function toDate(val: string | Date): Date {
  return typeof val === 'string' ? new Date(val) : val;
}

function toIso(val: string | Date): string {
  return (val instanceof Date ? val : new Date(val)).toISOString();
}

/** v2 tickers may use `userTags` or the earlier `tags` field name. */
function readUserTags(entry: {
  userTags?: string[];
  tags?: string[];
}): string[] {
  return entry.userTags ?? entry.tags ?? [];
}

/** Build the flattened per-ticker list from the separate IndexedDB tables. */
function buildTickerEntries(
  holdings: Holding[],
  watchlist: WatchlistItem[],
  intrinsicValues: IntrinsicValue[]
): TickerEntry[] {
  const holdingsByTicker = new Map<string, Holding>();
  for (const h of holdings) holdingsByTicker.set(h.ticker.toUpperCase(), h);

  const ivByTicker = new Map<string, IntrinsicValue[]>();
  for (const iv of intrinsicValues) {
    const key = iv.ticker.toUpperCase();
    const list = ivByTicker.get(key) ?? [];
    list.push(iv);
    ivByTicker.set(key, list);
  }

  const tickers = new Set<string>();
  for (const w of watchlist) tickers.add(w.ticker.toUpperCase());
  for (const h of holdings) tickers.add(h.ticker.toUpperCase());
  for (const iv of intrinsicValues) tickers.add(iv.ticker.toUpperCase());

  const watchByTicker = new Map<string, WatchlistItem>();
  for (const w of watchlist) watchByTicker.set(w.ticker.toUpperCase(), w);

  const entries: TickerEntry[] = [];
  for (const ticker of tickers) {
    const w = watchByTicker.get(ticker);
    const h = holdingsByTicker.get(ticker);
    const ivs = (ivByTicker.get(ticker) ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const name = w?.name ?? h?.name ?? ticker;
    const userTags = w?.tags ?? [];
    const autoTagsRaw = (w?.autoTags ?? []).slice();
    // Keep the portfolio auto-tag synchronized with actual portfolio membership
    // so the exported file is internally consistent regardless of any stale
    // IndexedDB state from before the last syncPortfolioToWatchlist.
    const autoTagSet = new Set(autoTagsRaw);
    if (h) autoTagSet.add(PORTFOLIO_AUTO_TAG);
    else autoTagSet.delete(PORTFOLIO_AUTO_TAG);
    const autoTags = Array.from(autoTagSet);
    const addedAt = toIso(
      w?.addedAt ?? h?.addedDate ?? h?.createdAt ?? new Date()
    );

    const entry: TickerEntry = {
      ticker,
      name,
      userTags,
      autoTags,
      addedAt,
      intrinsicValues: ivs.map((iv) => ({
        value: iv.value,
        currency: iv.currency ?? DEFAULT_CURRENCY,
        date: toIso(iv.date),
      })),
    };

    if (h) {
      entry.portfolio = {
        shares: h.shares,
        avgCost: h.avgCost,
        currency: h.currency ?? DEFAULT_CURRENCY,
        sector: h.sector,
        country: h.country ?? '',
        drip: h.drip,
        dividendTaxRate: h.dividendTaxRate,
        addedDate: toIso(h.addedDate),
        createdAt: toIso(h.createdAt),
        updatedAt: toIso(h.updatedAt),
      };
    }

    entries.push(entry);
  }

  entries.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return entries;
}

export async function exportAllData(): Promise<BackupData> {
  const [holdings, transactions, notes, cashAccounts, dividendRecords, watchlist, intrinsicValues] =
    await Promise.all([
      db.holdings.toArray(),
      db.transactions.toArray(),
      db.notes.toArray(),
      db.cashAccounts.toArray(),
      db.dividendRecords.toArray(),
      db.watchlist.toArray(),
      db.intrinsicValues.toArray(),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tickers: buildTickerEntries(holdings, watchlist, intrinsicValues),
    transactions: transactions.map((t) => ({ ...t, date: toIso(t.date) })),
    notes: notes.map((n) => ({
      ...n,
      createdAt: toIso(n.createdAt),
      updatedAt: toIso(n.updatedAt),
    })),
    cashAccounts: cashAccounts.map((c) => ({
      ...c,
      lastInterestDate: toIso(c.lastInterestDate),
      createdAt: toIso(c.createdAt),
    })),
    dividendRecords: dividendRecords.map((d) => ({
      ...d,
      processedAt: toIso(d.processedAt),
    })),
  };
}

/** Translate a legacy v1 backup into the current v2 shape. */
function migrateV1(data: BackupDataV1): BackupData {
  const holdings: Holding[] = data.holdings.map((h) => ({
    ...h,
    addedDate: toDate(h.addedDate),
    createdAt: toDate(h.createdAt),
    updatedAt: toDate(h.updatedAt),
  }));
  const watchlist: WatchlistItem[] = data.watchlist.map((w) => {
    const split = splitLegacyTags(w.tags ?? []);
    return {
      ...w,
      tags: split.tags,
      autoTags: split.autoTags,
      addedAt: toDate(w.addedAt),
    };
  });
  const intrinsicValues: IntrinsicValue[] = data.intrinsicValues.map((iv) => ({
    ...iv,
    date: toDate(iv.date),
  }));

  return {
    version: BACKUP_VERSION,
    exportedAt: data.exportedAt,
    tickers: buildTickerEntries(holdings, watchlist, intrinsicValues),
    transactions: data.transactions,
    notes: data.notes,
    cashAccounts: data.cashAccounts,
    dividendRecords: data.dividendRecords,
  };
}

export async function importAllData(data: BackupData | BackupDataV1): Promise<void> {
  const normalized: BackupData =
    data.version === 1
      ? migrateV1(data as BackupDataV1)
      : (data as BackupData);

  if (normalized.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${normalized.version}. Expected ${BACKUP_VERSION}.`
    );
  }

  await db.transaction(
    'rw',
    [
      db.holdings,
      db.transactions,
      db.notes,
      db.cashAccounts,
      db.dividendRecords,
      db.watchlist,
      db.intrinsicValues,
    ],
    async () => {
      await db.holdings.clear();
      await db.transactions.clear();
      await db.notes.clear();
      await db.cashAccounts.clear();
      await db.dividendRecords.clear();
      await db.watchlist.clear();
      await db.intrinsicValues.clear();

      const holdings: Omit<Holding, 'id'>[] = [];
      const watchlist: Omit<WatchlistItem, 'id'>[] = [];
      const intrinsicValues: Omit<IntrinsicValue, 'id'>[] = [];

      for (const entry of normalized.tickers) {
        const ticker = entry.ticker.toUpperCase();
        const addedAt = toDate(entry.addedAt);
        // The `portfolio` sub-object is the source of truth for portfolio
        // membership; keep the autoTags list consistent with it on import.
        const autoTagSet = new Set(entry.autoTags ?? []);
        if (entry.portfolio) autoTagSet.add(PORTFOLIO_AUTO_TAG);
        else autoTagSet.delete(PORTFOLIO_AUTO_TAG);

        watchlist.push({
          ticker,
          name: entry.name,
          tags: readUserTags(entry).slice(),
          autoTags: Array.from(autoTagSet),
          addedAt,
        });

        if (entry.portfolio) {
          const p = entry.portfolio;
          holdings.push({
            ticker,
            name: entry.name,
            shares: p.shares,
            avgCost: p.avgCost,
            currency: p.currency ?? DEFAULT_CURRENCY,
            sector: p.sector,
            country: p.country ?? '',
            drip: p.drip ?? false,
            dividendTaxRate: p.dividendTaxRate ?? 0,
            addedDate: toDate(p.addedDate),
            createdAt: toDate(p.createdAt),
            updatedAt: toDate(p.updatedAt),
          });
        }

        for (const iv of entry.intrinsicValues) {
          intrinsicValues.push({
            ticker,
            value: iv.value,
            currency: iv.currency ?? DEFAULT_CURRENCY,
            date: toDate(iv.date),
          });
        }
      }

      await db.holdings.bulkAdd(holdings);
      await db.watchlist.bulkAdd(watchlist);
      await db.intrinsicValues.bulkAdd(intrinsicValues);

      await db.transactions.bulkAdd(
        normalized.transactions.map((t) => ({
          ...t,
          currency: t.currency ?? DEFAULT_CURRENCY,
          date: toDate(t.date),
        }))
      );
      await db.notes.bulkAdd(
        normalized.notes.map((n) => ({
          ...n,
          createdAt: toDate(n.createdAt),
          updatedAt: toDate(n.updatedAt),
        }))
      );
      await db.cashAccounts.bulkAdd(
        normalized.cashAccounts.map((c) => ({
          ...c,
          currency: c.currency ?? DEFAULT_CURRENCY,
          lastInterestDate: toDate(c.lastInterestDate),
          createdAt: toDate(c.createdAt),
        }))
      );
      await db.dividendRecords.bulkAdd(
        normalized.dividendRecords.map((d) => ({
          ...d,
          processedAt: toDate(d.processedAt),
        }))
      );
    }
  );
}
