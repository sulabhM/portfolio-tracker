export type AccountType = 'brokerage' | 'bank' | 'retirement' | 'other';

/**
 * A container for positions and cash: a brokerage, a bank, a pension wrapper.
 * Every position and every cash/deposit entry belongs to exactly one account.
 */
export interface Account {
  id?: number;
  name: string;
  type: AccountType;
  institution?: string;
  notes?: string;
  /** Display order in dropdowns and the grouped portfolio view. */
  sortOrder: number;
  createdAt: Date;
}

/**
 * Flattened view of one position in one account. Derived from
 * `TickerEntry.positions[]` plus the ticker-level fields; not stored as such.
 */
export interface Holding {
  /** `${accountId}:${TICKER}` — see `holdingKey` in utils/positions. */
  id?: string;
  accountId: number;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  /** ISO 4217 currency for avgCost and cost basis. */
  currency: string;
  sector: string;
  country: string;
  drip: boolean;
  dividendTaxRate: number;
  addedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Transaction {
  id?: number;
  /** `${accountId}:${TICKER}` of the position this relates to, when known. */
  holdingId?: string;
  accountId?: number;
  ticker: string;
  type: 'buy' | 'sell' | 'dividend' | 'interest';
  shares: number;
  price: number;
  /** ISO 4217 currency for price (and dividend amounts). */
  currency: string;
  date: Date;
  notes: string;
}

export interface Note {
  id?: number;
  title: string;
  content: string;
  tickerLinks: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PriceData {
  ticker: string;
  /** Quote currency from the exchange (ISO 4217). */
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  extPrice?: number;
  extChange?: number;
  extChangePercent?: number;
  lastUpdated: Date;
}

/**
 * How interest on a cash deposit is paid.
 * - `periodic`: simple interest paid out every `payoutFrequencyMonths` months;
 *   the account is worth principal + interest accrued since the last payout.
 * - `maturity`: interest compounds yearly and is paid together with the
 *   principal on `maturityDate`; the account is worth principal × (1+r)^years.
 */
export type CashPayoutMode = 'periodic' | 'maturity';

export interface CashAccount {
  id?: number;
  /** Owning `Account`. */
  accountId: number;
  name: string;
  /** Amount originally deposited, in `currency`. */
  principal: number;
  /** Date the principal was deposited; interest accrues from here. */
  depositDate: Date;
  /** ISO 4217 currency for principal. */
  currency: string;
  /** Yearly interest rate as a decimal (0.045 = 4.5% p.a.). */
  interestRate: number;
  payoutMode: CashPayoutMode;
  /** Months between interest payouts. Used when `payoutMode` is `periodic`. */
  payoutFrequencyMonths?: number;
  /**
   * Date principal and compounded interest are paid out. Used when
   * `payoutMode` is `maturity`; absent on legacy rows that predate the field.
   */
  maturityDate?: Date;
  createdAt: Date;
}

export interface WatchlistItem {
  /** IndexedDB ticker key. */
  id?: string;
  ticker: string;
  name: string;
  /** User-specified tags. */
  tags: string[];
  /**
   * Auto-generated tags derived from Yahoo Finance data (recommendation,
   * dividend) and portfolio membership. Refreshed on every data refresh
   * and on portfolio changes. Never edited directly by the user.
   */
  autoTags: string[];
  addedAt: Date;
}

export interface IntrinsicValue {
  /** Synthetic key used by the UI; persisted by ticker/date in TickerEntry. */
  id?: string;
  ticker: string;
  value: number;
  /** ISO 4217 currency for value. */
  currency: string;
  date: Date;
}

export interface DividendRecord {
  id?: number;
  /** `${accountId}:${TICKER}` of the position that was paid. */
  holdingId: string;
  accountId: number;
  ticker: string;
  exDate: number;
  amount: number;
  totalAmount: number;
  taxWithheld: number;
  reinvestedShares: number;
  processedAt: Date;
}

/**
 * Singleton-row metadata used to version the dataset.
 * `counter` is bumped on every successful CRUD mutation, and `updatedAt`
 * records the wall-clock time of that bump. Both the local IndexedDB and
 * the synced JSON file carry this value so we can tell which side is newer.
 */
export interface DataVersion {
  /** Always the literal string 'dataVersion'; primary key for the meta store. */
  key: 'dataVersion';
  counter: number;
  updatedAt: Date;
}

/**
 * One account's position in a ticker. Sector/country live on the ticker row
 * since they describe the security, not the position.
 */
export interface TickerPosition {
  accountId: number;
  shares: number;
  avgCost: number;
  /** ISO 4217 currency for avgCost and cost basis. */
  currency: string;
  drip: boolean;
  dividendTaxRate: number;
  addedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pre-v12 single-position blob (`TickerEntry.portfolio`). Kept only so
 * migrations and legacy sync-file imports can be typed.
 */
export interface LegacyTickerPortfolioInfo {
  shares: number;
  avgCost: number;
  currency: string;
  sector: string;
  country: string;
  drip: boolean;
  dividendTaxRate: number;
  addedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TickerIntrinsicValue {
  value: number;
  /** ISO 4217 currency. */
  currency: string;
  date: Date;
}

/**
 * Source-of-truth IndexedDB row. This mirrors the backing JSON ticker entry,
 * except date fields are hydrated as Date instances while stored locally.
 */
export interface TickerEntry {
  ticker: string;
  name: string;
  userTags: string[];
  autoTags: string[];
  addedAt: Date;
  /** Security-level classification; populated once the ticker is held. */
  sector?: string;
  country?: string;
  /** One entry per account holding this ticker. Empty when watchlist-only. */
  positions: TickerPosition[];
  intrinsicValues: TickerIntrinsicValue[];
}
