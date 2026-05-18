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
  TickerEntry as DbTickerEntry,
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

function serializeTickerEntry(entry: DbTickerEntry): TickerEntry {
  const autoTagSet = new Set(entry.autoTags ?? []);
  if (entry.portfolio) autoTagSet.add(PORTFOLIO_AUTO_TAG);
  else autoTagSet.delete(PORTFOLIO_AUTO_TAG);

  return {
    ticker: entry.ticker.toUpperCase(),
    name: entry.name,
    userTags: entry.userTags ?? [],
    autoTags: Array.from(autoTagSet),
    addedAt: toIso(entry.addedAt),
    portfolio: entry.portfolio
      ? {
          ...entry.portfolio,
          currency: entry.portfolio.currency ?? DEFAULT_CURRENCY,
          country: entry.portfolio.country ?? '',
          addedDate: toIso(entry.portfolio.addedDate),
          createdAt: toIso(entry.portfolio.createdAt),
          updatedAt: toIso(entry.portfolio.updatedAt),
        }
      : undefined,
    intrinsicValues: (entry.intrinsicValues ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((iv) => ({
        value: iv.value,
        currency: iv.currency ?? DEFAULT_CURRENCY,
        date: toIso(iv.date),
      })),
  };
}

function deserializeTickerEntry(entry: TickerEntry): DbTickerEntry {
  const ticker = entry.ticker.toUpperCase();
  const autoTagSet = new Set(entry.autoTags ?? []);
  if (entry.portfolio) autoTagSet.add(PORTFOLIO_AUTO_TAG);
  else autoTagSet.delete(PORTFOLIO_AUTO_TAG);

  return {
    ticker,
    name: entry.name,
    userTags: readUserTags(entry).slice(),
    autoTags: Array.from(autoTagSet),
    addedAt: toDate(entry.addedAt),
    portfolio: entry.portfolio
      ? {
          ...entry.portfolio,
          currency: entry.portfolio.currency ?? DEFAULT_CURRENCY,
          country: entry.portfolio.country ?? '',
          drip: entry.portfolio.drip ?? false,
          dividendTaxRate: entry.portfolio.dividendTaxRate ?? 0,
          addedDate: toDate(entry.portfolio.addedDate),
          createdAt: toDate(entry.portfolio.createdAt),
          updatedAt: toDate(entry.portfolio.updatedAt),
        }
      : undefined,
    intrinsicValues: (entry.intrinsicValues ?? [])
      .map((iv) => ({
        value: iv.value,
        currency: iv.currency ?? DEFAULT_CURRENCY,
        date: toDate(iv.date),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  };
}

/** Build the flattened per-ticker list from legacy v1 separate tables. */
function buildTickerEntriesFromLegacy(
  holdings: Holding[],
  watchlist: WatchlistItem[],
  intrinsicValues: IntrinsicValue[]
): TickerEntry[] {
  const entries = new Map<string, DbTickerEntry>();
  const ensureEntry = (ticker: string): DbTickerEntry => {
    const key = ticker.toUpperCase();
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        ticker: key,
        name: key,
        userTags: [],
        autoTags: [],
        addedAt: new Date(),
        intrinsicValues: [],
      };
      entries.set(key, entry);
    }
    return entry;
  };

  for (const w of watchlist) {
    const entry = ensureEntry(w.ticker);
    entry.name = w.name ?? entry.name;
    entry.userTags = w.tags ?? [];
    entry.autoTags = w.autoTags ?? [];
    entry.addedAt = w.addedAt;
  }
  for (const h of holdings) {
    const entry = ensureEntry(h.ticker);
    entry.name = h.name ?? entry.name;
    entry.addedAt = entry.addedAt ?? h.addedDate ?? h.createdAt ?? new Date();
    entry.portfolio = {
      shares: h.shares,
      avgCost: h.avgCost,
      currency: h.currency ?? DEFAULT_CURRENCY,
      sector: h.sector,
      country: h.country ?? '',
      drip: h.drip ?? false,
      dividendTaxRate: h.dividendTaxRate ?? 0,
      addedDate: h.addedDate,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    };
  }
  for (const iv of intrinsicValues) {
    ensureEntry(iv.ticker).intrinsicValues.push({
      value: iv.value,
      currency: iv.currency ?? DEFAULT_CURRENCY,
      date: iv.date,
    });
  }

  return Array.from(entries.values())
    .map(serializeTickerEntry)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

export async function exportAllData(): Promise<BackupData> {
  const [tickers, transactions, notes, cashAccounts, dividendRecords] =
    await Promise.all([
      db.tickers.toArray(),
      db.transactions.toArray(),
      db.notes.toArray(),
      db.cashAccounts.toArray(),
      db.dividendRecords.toArray(),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tickers: tickers
      .map(serializeTickerEntry)
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
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
    tickers: buildTickerEntriesFromLegacy(holdings, watchlist, intrinsicValues),
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
      db.transactions,
      db.notes,
      db.cashAccounts,
      db.dividendRecords,
      db.tickers,
    ],
    async () => {
      await db.transactions.clear();
      await db.notes.clear();
      await db.cashAccounts.clear();
      await db.dividendRecords.clear();
      await db.tickers.clear();
      await db.tickers.bulkPut(normalized.tickers.map(deserializeTickerEntry));

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
