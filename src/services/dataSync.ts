import {
  DEFAULT_CURRENCY,
  normalizeCurrencyWithDefault,
} from '../constants/currencies';
import { PORTFOLIO_AUTO_TAG } from '../constants/autoTags';
import { db } from '../db/database';
import { normalizeCashAccount } from '../utils/cashAccount';
import {
  holdingKey,
  newDefaultAccount,
  normalizeTickerEntry,
} from '../utils/positions';
import type {
  Account,
  Transaction,
  Note,
  CashAccount,
  DividendRecord,
  TickerEntry as DbTickerEntry,
} from '../types';

/**
 * v3: single `portfolio` per ticker, global cash accounts.
 * v4: `accounts` collection; `positions[]` per ticker with sector/country on
 *     the ticker; `accountId` on cash, transactions and dividend records.
 * Files at v3 are still accepted on import and upgraded in memory.
 */
const BACKUP_VERSION = 4;
const OLDEST_IMPORTABLE_BACKUP_VERSION = 3;

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

/** One account's position in a ticker (v4). */
export interface TickerPositionEntry {
  accountId: number;
  shares: number;
  avgCost: number;
  /** ISO 4217 currency for avgCost and cost basis. */
  currency: string;
  drip: boolean;
  dividendTaxRate: number;
  /** ISO date string. */
  addedDate: string;
  /** ISO date string. */
  createdAt: string;
  /** ISO date string. */
  updatedAt: string;
}

/** v3 per-ticker portfolio info (single position, sector/country inline). */
export interface LegacyTickerPortfolioInfo {
  shares: number;
  avgCost: number;
  currency: string;
  sector: string;
  country: string;
  drip: boolean;
  dividendTaxRate: number;
  addedDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupAccount {
  id: number;
  name: string;
  type: Account['type'];
  institution?: string;
  notes?: string;
  sortOrder: number;
  /** ISO date string. */
  createdAt: string;
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
  /** Security-level classification (v4). */
  sector?: string;
  country?: string;
  /** One per account holding the ticker (v4). Empty when watchlist-only. */
  positions: TickerPositionEntry[];
  /** v3 only. Upgraded into `positions` on import. */
  portfolio?: LegacyTickerPortfolioInfo;
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
  /** Absent in v3 files. */
  accounts: BackupAccount[];
  tickers: TickerEntry[];
  transactions: Array<Omit<Transaction, 'date'> & { date: string }>;
  notes: Array<Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
  cashAccounts: BackupCashAccount[];
  dividendRecords: Array<Omit<DividendRecord, 'processedAt'> & { processedAt: string }>;
}

/** Cash account as written to the sync file (dates as ISO strings). */
export type BackupCashAccount = Omit<
  CashAccount,
  'depositDate' | 'maturityDate' | 'createdAt'
> & {
  depositDate: string;
  maturityDate?: string;
  createdAt: string;
};

/**
 * Cash account as it may appear in a sync file written before the term-deposit
 * model (`balance` / `compoundFrequency` / `lastInterestDate`). Same backup
 * version; `normalizeCashAccount` upgrades it on import.
 */
type LegacyBackupCashAccount = {
  id?: number;
  name: string;
  balance: number;
  currency?: string;
  interestRate: number;
  compoundFrequency: 'daily' | 'monthly' | 'none';
  lastInterestDate: string;
  createdAt: string;
};

function toDate(val: string | Date): Date {
  return typeof val === 'string' ? new Date(val) : val;
}

function toIso(val: string | Date): string {
  return (val instanceof Date ? val : new Date(val)).toISOString();
}

function assertImportableBackupData(data: BackupData): void {
  if (
    typeof data.version !== 'number' ||
    data.version < OLDEST_IMPORTABLE_BACKUP_VERSION ||
    data.version > BACKUP_VERSION
  ) {
    throw new Error(
      `Unsupported backup version: ${data.version}. Expected ${OLDEST_IMPORTABLE_BACKUP_VERSION}–${BACKUP_VERSION}.`
    );
  }
  if (data.version >= 4 && !Array.isArray(data.accounts)) {
    throw new Error('Invalid backup file: expected an accounts array.');
  }
  if (
    !data.dataVersion ||
    typeof data.dataVersion.counter !== 'number' ||
    typeof data.dataVersion.updatedAt !== 'string'
  ) {
    throw new Error('Invalid backup file: missing or malformed dataVersion.');
  }
  // Every collection is iterated unconditionally during import, so a missing
  // key would throw a bare "cannot read properties of undefined" mid-restore,
  // after the database has already been cleared.
  for (const key of [
    'tickers',
    'transactions',
    'notes',
    'cashAccounts',
    'dividendRecords',
  ] as const) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Invalid backup file: expected a ${key} array.`);
    }
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
  const positions = entry.positions ?? [];
  const autoTagSet = new Set(entry.autoTags ?? []);
  if (positions.length > 0) autoTagSet.add(PORTFOLIO_AUTO_TAG);
  else autoTagSet.delete(PORTFOLIO_AUTO_TAG);

  const out: TickerEntry = {
    ticker: entry.ticker.toUpperCase(),
    name: entry.name,
    userTags: entry.userTags ?? [],
    autoTags: Array.from(autoTagSet),
    addedAt: toIso(entry.addedAt),
    positions: positions
      .slice()
      .sort((a, b) => a.accountId - b.accountId)
      .map((p) => ({
        accountId: p.accountId,
        shares: p.shares,
        avgCost: p.avgCost,
        currency: p.currency ?? DEFAULT_CURRENCY,
        drip: p.drip ?? false,
        dividendTaxRate: p.dividendTaxRate ?? 0,
        addedDate: toIso(p.addedDate),
        createdAt: toIso(p.createdAt),
        updatedAt: toIso(p.updatedAt),
      })),
    intrinsicValues: (entry.intrinsicValues ?? [])
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((iv) => ({
        value: iv.value,
        currency: iv.currency ?? DEFAULT_CURRENCY,
        date: toIso(iv.date),
      })),
  };
  if (entry.sector != null) out.sector = entry.sector;
  if (entry.country != null) out.country = entry.country;
  return out;
}

/** Accepts both v3 (`portfolio`) and v4 (`positions`) entries. */
function deserializeTickerEntry(
  entry: TickerEntry,
  defaultAccountId: number
): DbTickerEntry {
  const normalized = normalizeTickerEntry(entry, defaultAccountId);
  const autoTagSet = new Set(normalized.autoTags);
  if (normalized.positions.length > 0) autoTagSet.add(PORTFOLIO_AUTO_TAG);
  else autoTagSet.delete(PORTFOLIO_AUTO_TAG);
  return {
    ...normalized,
    autoTags: Array.from(autoTagSet),
    positions: normalized.positions.map((p) => ({
      ...p,
      currency: normalizeCurrencyWithDefault(p.currency),
    })),
    intrinsicValues: normalized.intrinsicValues
      .map((iv) => ({
        value: iv.value,
        currency: iv.currency ?? DEFAULT_CURRENCY,
        date: toDate(iv.date),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  };
}

function serializeAccount(a: Account): BackupAccount {
  const out: BackupAccount = {
    id: a.id as number,
    name: a.name,
    type: a.type,
    sortOrder: a.sortOrder,
    createdAt: toIso(a.createdAt),
  };
  if (a.institution) out.institution = a.institution;
  if (a.notes) out.notes = a.notes;
  return out;
}

function deserializeAccount(a: BackupAccount): Account {
  const out: Account = {
    id: a.id,
    name: a.name,
    type: a.type ?? 'other',
    sortOrder: typeof a.sortOrder === 'number' ? a.sortOrder : 0,
    createdAt: toDate(a.createdAt ?? new Date()),
  };
  if (a.institution) out.institution = a.institution;
  if (a.notes) out.notes = a.notes;
  return out;
}

function serializeCashAccount(c: CashAccount): BackupCashAccount {
  const out: BackupCashAccount = {
    accountId: c.accountId,
    name: c.name,
    principal: c.principal,
    depositDate: toIso(c.depositDate),
    currency: c.currency ?? DEFAULT_CURRENCY,
    interestRate: c.interestRate,
    payoutMode: c.payoutMode,
    createdAt: toIso(c.createdAt),
  };
  if (c.id != null) out.id = c.id;
  if (c.payoutMode === 'periodic' && c.payoutFrequencyMonths != null) {
    out.payoutFrequencyMonths = c.payoutFrequencyMonths;
  }
  if (c.payoutMode === 'maturity' && c.maturityDate != null) {
    out.maturityDate = toIso(c.maturityDate);
  }
  return out;
}

function deserializeCashAccount(
  c: BackupCashAccount | LegacyBackupCashAccount,
  defaultAccountId: number
): CashAccount {
  const account = normalizeCashAccount(c, defaultAccountId);
  account.currency = normalizeCurrencyWithDefault(account.currency);
  return account;
}

/**
 * Accounts to restore, plus the id legacy rows (no `accountId`) should be
 * attached to. A v3 file has no accounts: synthesize the default one. A v4
 * file whose rows reference an unknown account gets a default appended too,
 * so nothing is orphaned.
 */
function resolveAccounts(data: BackupData): {
  accounts: Account[];
  defaultAccountId: number;
} {
  const accounts = (data.accounts ?? []).map(deserializeAccount);
  const known = new Set(accounts.map((a) => a.id as number));
  const referenced = new Set<number>();
  for (const t of data.tickers) {
    for (const p of t.positions ?? []) referenced.add(p.accountId);
  }
  for (const c of data.cashAccounts as Array<{ accountId?: number }>) {
    if (c.accountId != null) referenced.add(c.accountId);
  }
  const hasUnknownRefs = [...referenced].some((id) => !known.has(id));

  let defaultAccountId: number;
  if (accounts.length === 0 || hasUnknownRefs) {
    // Mint a default with an id nothing else uses.
    const nextId = Math.max(0, ...known, ...referenced) + 1;
    accounts.push({ ...newDefaultAccount(), id: nextId });
    known.add(nextId);
    defaultAccountId = nextId;
  } else {
    // Legacy rows (no accountId) attach to the first account by display order.
    defaultAccountId = accounts
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)[0].id as number;
  }

  // Point unknown references at the default account.
  for (const t of data.tickers) {
    for (const p of t.positions ?? []) {
      if (!known.has(p.accountId)) p.accountId = defaultAccountId;
    }
  }
  for (const c of data.cashAccounts as Array<{ accountId?: number }>) {
    if (c.accountId != null && !known.has(c.accountId)) c.accountId = defaultAccountId;
  }

  return { accounts, defaultAccountId };
}

export async function exportAllData(): Promise<BackupData> {
  const [
    dataVersionRow,
    accounts,
    tickers,
    transactions,
    notes,
    cashAccounts,
    dividendRecords,
  ] = await Promise.all([
    db.meta.get('dataVersion'),
    db.accounts.toArray(),
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
    accounts: accounts
      .filter((a) => a.id != null)
      .map(serializeAccount)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    tickers: tickers
      .map(serializeTickerEntry)
      .sort((a, b) => a.ticker.localeCompare(b.ticker)),
    transactions: transactions.map((t) => ({ ...t, date: toIso(t.date) })),
    notes: notes.map((n) => ({
      ...n,
      createdAt: toIso(n.createdAt),
      updatedAt: toIso(n.updatedAt),
    })),
    cashAccounts: cashAccounts.map(serializeCashAccount),
    dividendRecords: dividendRecords.map((d) => ({
      ...d,
      processedAt: toIso(d.processedAt),
    })),
  };
}

export async function importAllData(data: BackupData): Promise<void> {
  assertImportableBackupData(data);
  const { accounts, defaultAccountId } = resolveAccounts(data);
  const accountIds = new Set(accounts.map((a) => a.id as number));

  await db.transaction(
    'rw',
    [
      db.accounts,
      db.transactions,
      db.notes,
      db.cashAccounts,
      db.dividendRecords,
      db.tickers,
      db.meta,
    ],
    async () => {
      await db.accounts.clear();
      await db.transactions.clear();
      await db.notes.clear();
      await db.cashAccounts.clear();
      await db.dividendRecords.clear();
      await db.tickers.clear();
      await db.accounts.bulkPut(accounts);
      await db.tickers.bulkPut(
        data.tickers.map((t) => deserializeTickerEntry(t, defaultAccountId))
      );

      await db.transactions.bulkAdd(
        data.transactions.map((t) => {
          const tx: Transaction = {
            ...t,
            currency: t.currency ?? DEFAULT_CURRENCY,
            date: toDate(t.date),
          };
          // v3 rows: holdingId was the bare ticker and there was no accountId.
          if (tx.holdingId) {
            if (tx.accountId == null || !accountIds.has(tx.accountId)) {
              tx.accountId = defaultAccountId;
            }
            if (!tx.holdingId.includes(':')) {
              tx.holdingId = holdingKey(tx.accountId, tx.ticker);
            }
          }
          return tx;
        })
      );
      await db.notes.bulkAdd(
        data.notes.map((n) => ({
          ...n,
          createdAt: toDate(n.createdAt),
          updatedAt: toDate(n.updatedAt),
        }))
      );
      await db.cashAccounts.bulkAdd(
        (data.cashAccounts as Array<BackupCashAccount | LegacyBackupCashAccount>).map(
          (c) => deserializeCashAccount(c, defaultAccountId)
        )
      );
      await db.dividendRecords.bulkAdd(
        data.dividendRecords.map((d) => {
          const accountId =
            d.accountId != null && accountIds.has(d.accountId)
              ? d.accountId
              : defaultAccountId;
          return {
            ...d,
            accountId,
            holdingId:
              d.holdingId && d.holdingId.includes(':')
                ? d.holdingId
                : holdingKey(accountId, d.ticker),
            processedAt: toDate(d.processedAt),
          };
        })
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
