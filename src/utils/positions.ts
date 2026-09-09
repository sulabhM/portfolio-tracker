import type {
  Account,
  Holding,
  LegacyTickerPortfolioInfo,
  TickerEntry,
  TickerPosition,
} from '../types';

export const DEFAULT_ACCOUNT_NAME = 'Main';

/** Composite id for a position: one account's holding of one ticker. */
export function holdingKey(accountId: number, ticker: string): string {
  return `${accountId}:${ticker.toUpperCase()}`;
}

export function parseHoldingKey(
  id: string
): { accountId: number; ticker: string } | null {
  const idx = id.indexOf(':');
  if (idx <= 0) return null;
  const accountId = Number(id.slice(0, idx));
  const ticker = id.slice(idx + 1).toUpperCase();
  if (!Number.isInteger(accountId) || !ticker) return null;
  return { accountId, ticker };
}

/** Flatten a ticker row into one `Holding` per position. */
export function toHoldings(entry: TickerEntry): Holding[] {
  return (entry.positions ?? []).map((p) => ({
    id: holdingKey(p.accountId, entry.ticker),
    accountId: p.accountId,
    ticker: entry.ticker,
    name: entry.name,
    shares: p.shares,
    avgCost: p.avgCost,
    currency: p.currency,
    sector: entry.sector ?? '',
    country: entry.country ?? '',
    drip: p.drip,
    dividendTaxRate: p.dividendTaxRate,
    addedDate: p.addedDate,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

export function newDefaultAccount(): Omit<Account, 'id'> {
  return {
    name: DEFAULT_ACCOUNT_NAME,
    type: 'brokerage',
    sortOrder: 0,
    createdAt: new Date(),
  };
}

function toValidDate(value: unknown, fallback: Date): Date {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  return fallback;
}

type RawPosition = Partial<
  Omit<TickerPosition, 'addedDate' | 'createdAt' | 'updatedAt'>
> & {
  addedDate?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type RawLegacyPortfolio = Partial<
  Omit<LegacyTickerPortfolioInfo, 'addedDate' | 'createdAt' | 'updatedAt'>
> & {
  addedDate?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

/** Ticker row as it may exist on disk: current shape, or pre-v12 with `portfolio`. */
export type RawTickerEntry = Partial<
  Omit<TickerEntry, 'positions' | 'addedAt' | 'intrinsicValues'>
> & {
  ticker: string;
  addedAt?: Date | string;
  positions?: RawPosition[];
  portfolio?: RawLegacyPortfolio | null;
  /** Dates may still be ISO strings; callers convert. */
  intrinsicValues?: Array<{ value: number; currency: string; date: Date | string }>;
};

function normalizePosition(
  raw: RawPosition,
  fallbackAccountId: number,
  now: Date
): TickerPosition {
  const createdAt = toValidDate(raw.createdAt, now);
  return {
    accountId:
      typeof raw.accountId === 'number' && Number.isInteger(raw.accountId)
        ? raw.accountId
        : fallbackAccountId,
    shares: Number.isFinite(raw.shares) ? (raw.shares as number) : 0,
    avgCost: Number.isFinite(raw.avgCost) ? (raw.avgCost as number) : 0,
    currency: raw.currency ?? 'USD',
    drip: raw.drip ?? false,
    dividendTaxRate: Number.isFinite(raw.dividendTaxRate)
      ? (raw.dividendTaxRate as number)
      : 0,
    addedDate: toValidDate(raw.addedDate, createdAt),
    createdAt,
    updatedAt: toValidDate(raw.updatedAt, createdAt),
  };
}

/**
 * Coerce a stored ticker row (current or legacy, dates as Date or ISO string)
 * into the current `TickerEntry` shape. A legacy single `portfolio` blob
 * becomes one position under `defaultAccountId`, and its sector/country are
 * hoisted to the ticker row.
 */
export function normalizeTickerEntry(
  raw: RawTickerEntry,
  defaultAccountId: number
): TickerEntry {
  const now = new Date();
  const ticker = raw.ticker.toUpperCase();
  let positions: TickerPosition[];
  let sector = raw.sector;
  let country = raw.country;

  if (Array.isArray(raw.positions)) {
    positions = raw.positions.map((p) => normalizePosition(p, defaultAccountId, now));
  } else if (raw.portfolio) {
    positions = [normalizePosition(raw.portfolio, defaultAccountId, now)];
    sector ??= raw.portfolio.sector;
    country ??= raw.portfolio.country;
  } else {
    positions = [];
  }

  // One position per account: if a corrupt row carries duplicates, keep the
  // most recently updated.
  const byAccount = new Map<number, TickerPosition>();
  for (const p of positions) {
    const existing = byAccount.get(p.accountId);
    if (!existing || p.updatedAt > existing.updatedAt) byAccount.set(p.accountId, p);
  }

  const entry: TickerEntry = {
    ticker,
    name: raw.name ?? ticker,
    userTags: Array.isArray(raw.userTags) ? raw.userTags : [],
    autoTags: Array.isArray(raw.autoTags) ? raw.autoTags : [],
    addedAt: toValidDate(raw.addedAt, now),
    positions: [...byAccount.values()].sort((a, b) => a.accountId - b.accountId),
    intrinsicValues: Array.isArray(raw.intrinsicValues)
      ? raw.intrinsicValues.map((iv) => ({
          value: iv.value,
          currency: iv.currency,
          date: toValidDate(iv.date, now),
        }))
      : [],
  };
  if (sector != null) entry.sector = sector;
  if (country != null) entry.country = country;
  return entry;
}
