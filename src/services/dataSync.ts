import { DEFAULT_CURRENCY } from '../constants/currencies';
import { PORTFOLIO_AUTO_TAG } from '../constants/autoTags';
import { db } from '../db/database';
import type {
  Transaction,
  Note,
  CashAccount,
  DividendRecord,
  TickerEntry as DbTickerEntry,
} from '../types';

const BACKUP_VERSION = 3;

/**
 * Monotonic versioning metadata carried by both IndexedDB and the synced
 * JSON file. `counter` is bumped on every CRUD write; `updatedAt` is the
 * wall-clock time of that bump.
 */
export interface BackupDataVersion {
  counter: number;
  /** ISO date string. */
  updatedAt: string;
}

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
  /**
   * Mirrors the IndexedDB `meta.dataVersion` row. Compare with the local
   * version to decide whether the file or the DB is newer.
   */
  dataVersion: BackupDataVersion;
  tickers: TickerEntry[];
  transactions: Array<Omit<Transaction, 'date'> & { date: string }>;
  notes: Array<Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
  cashAccounts: Array<Omit<CashAccount, 'lastInterestDate' | 'createdAt'> & { lastInterestDate: string; createdAt: string }>;
  dividendRecords: Array<Omit<DividendRecord, 'processedAt'> & { processedAt: string }>;
}

function toDate(val: string | Date): Date {
  return typeof val === 'string' ? new Date(val) : val;
}

function toIso(val: string | Date): string {
  return (val instanceof Date ? val : new Date(val)).toISOString();
}

function assertCurrentBackupData(data: BackupData): void {
  if (data.version !== BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${data.version}. Expected ${BACKUP_VERSION}.`
    );
  }
  if (
    !data.dataVersion ||
    typeof data.dataVersion.counter !== 'number' ||
    typeof data.dataVersion.updatedAt !== 'string'
  ) {
    throw new Error('Invalid backup file: missing or malformed dataVersion.');
  }
  if (!Array.isArray(data.tickers)) {
    throw new Error('Invalid backup file: expected a tickers array.');
  }
  for (const entry of data.tickers) {
    if (!entry || typeof entry.ticker !== 'string') {
      throw new Error('Invalid backup file: every ticker entry needs a ticker.');
    }
    if (!Array.isArray(entry.userTags)) {
      throw new Error(
        `Invalid backup file: ${entry.ticker} is missing userTags.`
      );
    }
    if (!Array.isArray(entry.autoTags)) {
      throw new Error(`Invalid backup file: ${entry.ticker} is missing autoTags.`);
    }
    if (!Array.isArray(entry.intrinsicValues)) {
      throw new Error(
        `Invalid backup file: ${entry.ticker} is missing intrinsicValues.`
      );
    }
  }
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
    userTags: entry.userTags.slice(),
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

export async function exportAllData(): Promise<BackupData> {
  const [
    dataVersionRow,
    tickers,
    transactions,
    notes,
    cashAccounts,
    dividendRecords,
  ] = await Promise.all([
    db.meta.get('dataVersion'),
    db.tickers.toArray(),
    db.transactions.toArray(),
    db.notes.toArray(),
    db.cashAccounts.toArray(),
    db.dividendRecords.toArray(),
  ]);

  const dataVersion: BackupDataVersion = {
    counter: dataVersionRow?.counter ?? 0,
    updatedAt: toIso(dataVersionRow?.updatedAt ?? new Date(0)),
  };

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    dataVersion,
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

export async function importAllData(data: BackupData): Promise<void> {
  assertCurrentBackupData(data);

  await db.transaction(
    'rw',
    [
      db.transactions,
      db.notes,
      db.cashAccounts,
      db.dividendRecords,
      db.tickers,
      db.meta,
    ],
    async () => {
      await db.transactions.clear();
      await db.notes.clear();
      await db.cashAccounts.clear();
      await db.dividendRecords.clear();
      await db.tickers.clear();
      await db.tickers.bulkPut(data.tickers.map(deserializeTickerEntry));

      await db.transactions.bulkAdd(
        data.transactions.map((t) => ({
          ...t,
          currency: t.currency ?? DEFAULT_CURRENCY,
          date: toDate(t.date),
        }))
      );
      await db.notes.bulkAdd(
        data.notes.map((n) => ({
          ...n,
          createdAt: toDate(n.createdAt),
          updatedAt: toDate(n.updatedAt),
        }))
      );
      await db.cashAccounts.bulkAdd(
        data.cashAccounts.map((c) => ({
          ...c,
          currency: c.currency ?? DEFAULT_CURRENCY,
          lastInterestDate: toDate(c.lastInterestDate),
          createdAt: toDate(c.createdAt),
        }))
      );
      await db.dividendRecords.bulkAdd(
        data.dividendRecords.map((d) => ({
          ...d,
          processedAt: toDate(d.processedAt),
        }))
      );

      await db.meta.put({
        key: 'dataVersion',
        counter: data.dataVersion.counter,
        updatedAt: toDate(data.dataVersion.updatedAt),
      });
    }
  );
}

/** Result of comparing the local data version with the file's data version. */
export type DataVersionRelation = 'same' | 'local-newer' | 'file-newer' | 'diverged';

/**
 * Compare a backup file's `dataVersion` against the local IndexedDB version.
 *
 * - 'same'         — both counter and updatedAt match.
 * - 'local-newer'  — local counter > file counter.
 * - 'file-newer'   — file counter > local counter.
 * - 'diverged'     — counters are equal but timestamps differ (e.g. two
 *   independent edits produced the same counter on different machines).
 */
export function compareDataVersions(
  local: { counter: number; updatedAt: Date } | null,
  file: BackupDataVersion
): DataVersionRelation {
  const localCounter = local?.counter ?? 0;
  if (localCounter > file.counter) return 'local-newer';
  if (localCounter < file.counter) return 'file-newer';
  const localIso = local ? toIso(local.updatedAt) : new Date(0).toISOString();
  return localIso === file.updatedAt ? 'same' : 'diverged';
}
