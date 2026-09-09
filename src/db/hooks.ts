import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './database';
import { notifyDataChanged } from '../services/dataSyncRegistry';
import { DEFAULT_CURRENCY, normalizeCurrencyWithDefault } from '../constants/currencies';
import { PORTFOLIO_AUTO_TAG } from '../constants/autoTags';
import { fetchTickerCurrency } from '../services/tickerCurrency';
import {
  holdingKey,
  newDefaultAccount,
  parseHoldingKey,
  toHoldings,
} from '../utils/positions';
import type {
  Account,
  Holding,
  Transaction,
  Note,
  CashAccount,
  WatchlistItem,
  IntrinsicValue,
  TickerEntry,
  TickerPosition,
  DividendRecord,
  DataVersion,
} from '../types';

// ---- Data Version (singleton metadata) ----
//
// Every CRUD helper below calls `bumpDataVersion()` after its IndexedDB write
// succeeds. That is the one and only place the local data version is advanced;
// the resulting `{ counter, updatedAt }` is what gets written into the synced
// JSON file so it can later be compared to the local DB to tell which is newer.

const DATA_VERSION_KEY = 'dataVersion' as const;

/**
 * Atomically increments the data-version counter, stamps `updatedAt`, and kicks
 * the debounced file sync. Call this after every successful IndexedDB write.
 */
export async function bumpDataVersion(): Promise<DataVersion> {
  const next = await db.transaction('rw', db.meta, async () => {
    const current = await db.meta.get(DATA_VERSION_KEY);
    const updated: DataVersion = {
      key: DATA_VERSION_KEY,
      counter: (current?.counter ?? 0) + 1,
      updatedAt: new Date(),
    };
    await db.meta.put(updated);
    return updated;
  });
  notifyDataChanged();
  return next;
}

/** Returns the current local data version, or null if no edits have ever been recorded. */
export async function getDataVersion(): Promise<DataVersion | null> {
  return (await db.meta.get(DATA_VERSION_KEY)) ?? null;
}

/**
 * Overwrite the data version (used after import so the local version matches
 * whatever the file said). Does not trigger a sync.
 */
export async function setDataVersion(version: Omit<DataVersion, 'key'>): Promise<void> {
  await db.meta.put({ ...version, key: DATA_VERSION_KEY });
}

/** Live-updating view of the local data version. */
export function useDataVersion(): DataVersion | null {
  return useLiveQuery(async () => (await db.meta.get(DATA_VERSION_KEY)) ?? null) ?? null;
}

/**
 * Rows written by an older schema version, or restored from a hand-edited sync
 * file, can be missing these arrays. `useLiveQuery` rethrows during render, so
 * an unguarded iteration blanks the entire app — normalize on the way out of
 * the DB rather than at each call site.
 */
function normalizeEntry(entry: TickerEntry): TickerEntry {
  return {
    ...entry,
    userTags: entry.userTags ?? [],
    autoTags: entry.autoTags ?? [],
    positions: entry.positions ?? [],
    intrinsicValues: entry.intrinsicValues ?? [],
  };
}

async function readTickers(): Promise<TickerEntry[]> {
  return (await db.tickers.toArray()).map(normalizeEntry);
}

async function readTicker(ticker: string): Promise<TickerEntry | undefined> {
  const entry = await db.tickers.get(ticker);
  return entry ? normalizeEntry(entry) : undefined;
}

function sortHoldings(holdings: Holding[]): Holding[] {
  return holdings.sort(
    (a, b) => a.ticker.localeCompare(b.ticker) || a.accountId - b.accountId
  );
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

/**
 * All positions as flattened holdings, one per (account, ticker). Pass an
 * `accountId` to restrict to a single account.
 */
export function useHoldings(accountId?: number) {
  return useLiveQuery(async () => {
    const tickers = await readTickers();
    const all = tickers.flatMap(toHoldings);
    return sortHoldings(
      accountId == null ? all : all.filter((h) => h.accountId === accountId)
    );
  }, [accountId]) ?? [];
}

export function useTransactions(ticker?: string, accountId?: number) {
  return useLiveQuery(
    async () => {
      let txs = await db.transactions.toArray();
      if (ticker) txs = txs.filter((t) => t.ticker === ticker);
      if (accountId != null) txs = txs.filter((t) => t.accountId === accountId);
      return txs.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
    [ticker, accountId]
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

export function useCashAccounts(accountId?: number) {
  return useLiveQuery(async () => {
    const all = await db.cashAccounts.toArray();
    return accountId == null ? all : all.filter((c) => c.accountId === accountId);
  }, [accountId]) ?? [];
}

// ---- Accounts ----

function sortAccounts(accounts: Account[]): Account[] {
  return accounts.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

/**
 * Accounts in display order. `undefined` while the first read is in flight so
 * pickers can show a loading state instead of a spurious "no accounts" hint.
 */
export function useAccounts(): Account[] | undefined {
  return useLiveQuery(async () => sortAccounts(await db.accounts.toArray()));
}

/** Stable empty list for `useAccounts() ?? NO_ACCOUNTS` so memo deps don't churn. */
export const NO_ACCOUNTS: readonly Account[] = Object.freeze([]);

export async function addAccount(
  account: Omit<Account, 'id' | 'createdAt' | 'sortOrder'> & { sortOrder?: number }
) {
  const existing = await db.accounts.toArray();
  const sortOrder =
    account.sortOrder ??
    (existing.length ? Math.max(...existing.map((a) => a.sortOrder)) + 1 : 0);
  const id = await db.accounts.add({
    ...account,
    name: account.name.trim(),
    sortOrder,
    createdAt: new Date(),
  });
  await bumpDataVersion();
  return id;
}

export async function updateAccount(id: number, changes: Partial<Account>) {
  const rest: Partial<Account> = { ...changes };
  delete rest.id;
  delete rest.createdAt;
  if (rest.name != null) rest.name = rest.name.trim();
  await db.accounts.update(id, rest);
  await bumpDataVersion();
}

/** Persist a new display order; `orderedIds` lists every account id. */
export async function reorderAccounts(orderedIds: number[]) {
  await db.transaction('rw', db.accounts, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.accounts.update(orderedIds[i], { sortOrder: i });
    }
  });
  await bumpDataVersion();
}

/**
 * Ensure at least one account exists so holdings and cash always have an
 * owner. Returns the id of the first account (creating the default if needed).
 */
export async function ensureDefaultAccount(): Promise<number> {
  const accounts = sortAccounts(await db.accounts.toArray());
  if (accounts[0]?.id != null) return accounts[0].id;
  const id = await db.accounts.add(newDefaultAccount());
  await bumpDataVersion();
  return id;
}

export interface AccountContents {
  positions: number;
  cashAccounts: number;
  transactions: number;
}

/** How much data currently references an account. */
export async function getAccountContents(accountId: number): Promise<AccountContents> {
  const [tickers, cash, txs] = await Promise.all([
    readTickers(),
    db.cashAccounts.where('accountId').equals(accountId).count(),
    db.transactions.where('accountId').equals(accountId).count(),
  ]);
  const positions = tickers.reduce(
    (n, t) => n + t.positions.filter((p) => p.accountId === accountId).length,
    0
  );
  return { positions, cashAccounts: cash, transactions: txs };
}

/**
 * Delete an account. Refuses when it still owns positions or cash unless a
 * `moveToAccountId` is given, in which case positions, cash, transactions and
 * dividend records are reassigned first. Positions in a ticker the target
 * already holds are merged (shares summed, cost basis blended).
 */
export async function deleteAccount(id: number, moveToAccountId?: number) {
  if (moveToAccountId === id) {
    throw new Error('Cannot move an account into itself.');
  }
  const contents = await getAccountContents(id);
  const hasData = contents.positions > 0 || contents.cashAccounts > 0;
  if (hasData && moveToAccountId == null) {
    throw new Error(
      'This account still holds positions or cash. Move them to another account first.'
    );
  }
  if (moveToAccountId != null && !(await db.accounts.get(moveToAccountId))) {
    throw new Error('Target account not found.');
  }

  await db.transaction(
    'rw',
    [db.accounts, db.tickers, db.cashAccounts, db.transactions, db.dividendRecords],
    async () => {
      if (moveToAccountId != null) {
        const target = moveToAccountId;
        const now = new Date();
        const tickers = (await db.tickers.toArray()).map(normalizeEntry);
        for (const entry of tickers) {
          const moving = entry.positions.find((p) => p.accountId === id);
          if (!moving) continue;
          const rest = entry.positions.filter((p) => p.accountId !== id);
          const existing = rest.find((p) => p.accountId === target);
          if (existing) {
            const totalShares = existing.shares + moving.shares;
            existing.avgCost =
              totalShares > 0
                ? (existing.shares * existing.avgCost + moving.shares * moving.avgCost) /
                  totalShares
                : existing.avgCost;
            existing.shares = totalShares;
            existing.drip = existing.drip || moving.drip;
            existing.addedDate =
              moving.addedDate < existing.addedDate ? moving.addedDate : existing.addedDate;
            existing.updatedAt = now;
          } else {
            rest.push({ ...moving, accountId: target, updatedAt: now });
          }
          await db.tickers.update(entry.ticker, {
            positions: rest.sort((a, b) => a.accountId - b.accountId),
          });
        }
        await db.cashAccounts
          .where('accountId')
          .equals(id)
          .modify({ accountId: target });
        await db.transactions
          .where('accountId')
          .equals(id)
          .modify((t: Transaction) => {
            t.accountId = target;
            if (t.holdingId) t.holdingId = holdingKey(target, t.ticker);
          });
        await db.dividendRecords
          .where('accountId')
          .equals(id)
          .modify((d: DividendRecord) => {
            d.accountId = target;
            d.holdingId = holdingKey(target, d.ticker);
          });
      } else {
        // Nothing owned; detach any stray transaction references.
        await db.transactions
          .where('accountId')
          .equals(id)
          .modify((t: Transaction) => {
            delete t.accountId;
            delete t.holdingId;
          });
      }
      await db.accounts.delete(id);
    }
  );
  await bumpDataVersion();
}

// ---- Holding (position) CRUD ----

const POSITION_FIELDS = [
  'shares',
  'avgCost',
  'currency',
  'drip',
  'dividendTaxRate',
  'addedDate',
] as const satisfies readonly (keyof TickerPosition)[];

function pickPositionFields(changes: Partial<Holding>): Partial<TickerPosition> {
  const out: Partial<TickerPosition> = {};
  for (const key of POSITION_FIELDS) {
    const value = changes[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function withPortfolioTag(autoTags: string[], held: boolean): string[] {
  const has = autoTags.includes(PORTFOLIO_AUTO_TAG);
  if (held && !has) return [...autoTags, PORTFOLIO_AUTO_TAG];
  if (!held && has) return autoTags.filter((t) => t !== PORTFOLIO_AUTO_TAG);
  return autoTags;
}

/**
 * Add a position for `holding.accountId`. If that account already holds the
 * ticker, the position is replaced (same semantics as the old single-position
 * `addHolding`). Other accounts' positions in the ticker are untouched.
 */
export async function addHolding(
  holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>
) {
  const now = new Date();
  const ticker = holding.ticker.toUpperCase();
  const reported =
    (await fetchTickerCurrency(ticker)) ??
    normalizeCurrencyWithDefault(holding.currency);
  const existing = await readTicker(ticker);
  const previous = existing?.positions.find((p) => p.accountId === holding.accountId);
  const position: TickerPosition = {
    accountId: holding.accountId,
    shares: holding.shares,
    avgCost: holding.avgCost,
    currency: reported,
    drip: holding.drip ?? false,
    dividendTaxRate: holding.dividendTaxRate ?? 0,
    addedDate: holding.addedDate ?? previous?.addedDate ?? now,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  const positions = [
    ...(existing?.positions.filter((p) => p.accountId !== holding.accountId) ?? []),
    position,
  ].sort((a, b) => a.accountId - b.accountId);
  await db.tickers.put({
    ticker,
    name: holding.name,
    userTags: existing?.userTags ?? [],
    autoTags: withPortfolioTag(existing?.autoTags ?? [], true),
    addedAt: existing?.addedAt ?? position.addedDate,
    sector: holding.sector || existing?.sector || 'Other',
    country: holding.country || existing?.country || '',
    positions,
    intrinsicValues: existing?.intrinsicValues ?? [],
  });
  await bumpDataVersion();
  return holdingKey(holding.accountId, ticker);
}

export async function updateHolding(id: string, changes: Partial<Holding>) {
  const key = parseHoldingKey(id);
  if (!key) return;
  const existing = await readTicker(key.ticker);
  const position = existing?.positions.find((p) => p.accountId === key.accountId);
  if (!existing || !position) return;
  const nextTicker = (changes.ticker ?? key.ticker).toUpperCase();
  // `Holding` is a flattened view: position fields go into the position,
  // sector/country/name onto the ticker row, and id/ticker/accountId are keys.
  const updatedPosition: TickerPosition = {
    ...position,
    ...pickPositionFields(changes),
    updatedAt: new Date(),
  };
  const updated: TickerEntry = {
    ...existing,
    ticker: nextTicker,
    name: changes.name ?? existing.name,
    sector: changes.sector ?? existing.sector,
    country: changes.country ?? existing.country,
    positions: existing.positions.map((p) =>
      p.accountId === key.accountId ? updatedPosition : p
    ),
  };
  updated.autoTags = withPortfolioTag(updated.autoTags, true);
  if (nextTicker !== key.ticker) {
    await db.transaction('rw', db.tickers, async () => {
      await db.tickers.delete(key.ticker);
      await db.tickers.put(updated);
    });
  } else {
    await db.tickers.put(updated);
  }
  await bumpDataVersion();
}

/** Remove one account's position. The ticker stays on the watchlist. */
export async function deleteHolding(id: string) {
  const key = parseHoldingKey(id);
  if (!key) return;
  const existing = await readTicker(key.ticker);
  if (!existing) return;
  const positions = existing.positions.filter((p) => p.accountId !== key.accountId);
  await db.tickers.put({
    ...existing,
    autoTags: withPortfolioTag(existing.autoTags, positions.length > 0),
    positions,
  });
  await bumpDataVersion();
}

// ---- Transaction CRUD ----

export async function addTransaction(tx: Omit<Transaction, 'id'>) {
  const id = await db.transactions.add({
    ...tx,
    currency: tx.currency ?? DEFAULT_CURRENCY,
  });
  await bumpDataVersion();
  return id;
}

export async function deleteTransaction(id: number) {
  await db.transactions.delete(id);
  await bumpDataVersion();
}

// ---- Note CRUD ----

export async function addNote(
  note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>
) {
  const now = new Date();
  const id = await db.notes.add({ ...note, createdAt: now, updatedAt: now });
  await bumpDataVersion();
  return id;
}

export async function updateNote(id: number, changes: Partial<Note>) {
  await db.notes.update(id, { ...changes, updatedAt: new Date() });
  await bumpDataVersion();
}

export async function deleteNote(id: number) {
  await db.notes.delete(id);
  await bumpDataVersion();
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
  await bumpDataVersion();
  return id;
}

export async function updateCashAccount(
  id: number,
  changes: Partial<CashAccount>
) {
  await db.cashAccounts.update(id, changes);
  await bumpDataVersion();
}

export async function deleteCashAccount(id: number) {
  await db.cashAccounts.delete(id);
  await bumpDataVersion();
}

// ---- Dividend Record CRUD ----

export async function addDividendRecord(
  record: Omit<DividendRecord, 'id'>
) {
  const id = await db.dividendRecords.add(record);
  await bumpDataVersion();
  return id;
}

// ---- Watchlist CRUD ----

export function useWatchlist() {
  return useLiveQuery(async () => {
    const tickers = await readTickers();
    return tickers
      .map(toWatchlistItem)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }) ?? [];
}

export function useWatchlistTags() {
  return useLiveQuery(async () => {
    const items = await readTickers();
    const tags = new Set<string>();
    for (const w of items) {
      for (const t of w.userTags) tags.add(t);
      for (const t of w.autoTags) tags.add(t);
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
    positions: [],
    intrinsicValues: [],
    addedAt: new Date(),
  });
  await bumpDataVersion();
  return ticker;
}

export async function updateWatchlistItem(
  id: string,
  changes: Partial<WatchlistItem>
) {
  const ticker = id.toUpperCase();
  const existing = await readTicker(ticker);
  if (!existing) return;
  await db.tickers.put({
    ...existing,
    ticker: changes.ticker?.toUpperCase() ?? existing.ticker,
    name: changes.name ?? existing.name,
    userTags: changes.tags ?? existing.userTags,
    autoTags: changes.autoTags ?? existing.autoTags,
    addedAt: changes.addedAt ?? existing.addedAt,
  });
  await bumpDataVersion();
}

/**
 * Replace a ticker's auto-generated tags.
 *
 * Auto-tags are derived from Yahoo data and portfolio membership and are
 * recomputed on every refresh on every device. They are deliberately written
 * WITHOUT bumping the data version: bumping meant two devices refreshing at
 * different times produced different counters for identical user data and
 * the sync dialog reported a conflict on every launch.
 */
export async function setWatchlistAutoTags(id: string, autoTags: string[]) {
  const ticker = id.toUpperCase();
  const existing = await readTicker(ticker);
  if (!existing) return;
  if (sameStringSet(existing.autoTags, autoTags)) return;
  await db.tickers.update(ticker, { autoTags: [...new Set(autoTags)] });
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((t) => set.has(t));
}

export async function deleteWatchlistItem(id: string) {
  const ticker = id.toUpperCase();
  const existing = await readTicker(ticker);
  if (!existing) return;
  // Every held ticker is on the watchlist by construction; the row also
  // carries the positions. Removing it here would silently delete the holdings
  // — the UI hides the button for held tickers, but guard the data layer too.
  if (existing.positions.length > 0) {
    throw new Error(
      `${ticker} is in your portfolio. Remove the holding first.`
    );
  }
  await db.tickers.delete(ticker);
  await bumpDataVersion();
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
    const all = await readTickers();
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
  const entry = await readTicker(key);
  const intrinsicValues = [
    ...(entry?.intrinsicValues ?? []),
    { value, currency: reported, date: date ?? new Date() },
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  await db.tickers.put({
    ...entry,
    ticker: key,
    name: entry?.name ?? key,
    userTags: entry?.userTags ?? [],
    autoTags: entry?.autoTags ?? [],
    addedAt: entry?.addedAt ?? new Date(),
    positions: entry?.positions ?? [],
    intrinsicValues,
  });
  await bumpDataVersion();
  return intrinsicId(key, date ?? new Date());
}

export async function deleteIntrinsicValue(id: string) {
  const [ticker, isoDate] = id.split('|');
  const entry = await readTicker(ticker);
  if (!entry) return;
  await db.tickers.put({
    ...entry,
    intrinsicValues: entry.intrinsicValues.filter(
      (iv) => new Date(iv.date).toISOString() !== isoDate
    ),
  });
  await bumpDataVersion();
}

// ---- Portfolio-to-Watchlist Sync ----

/**
 * Repair pass: make the `portfolio` auto-tag match whether the ticker actually
 * has a position. `addHolding`/`deleteHolding` already maintain the tag (and
 * bump the version for the underlying edit); this only fixes drift, and like
 * all auto-tag writes it does not bump the data version.
 */
export async function syncPortfolioToWatchlist() {
  await db.transaction('rw', db.tickers, async () => {
    const entries = (await db.tickers.toArray()).map(normalizeEntry);
    for (const entry of entries) {
      const hasPortfolio = entry.positions.length > 0;
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
}
