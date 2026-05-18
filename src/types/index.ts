export interface Holding {
  /** IndexedDB ticker key. */
  id?: string;
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
  holdingId?: string;
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

export interface CashAccount {
  id?: number;
  name: string;
  balance: number;
  /** ISO 4217 currency for balance. */
  currency: string;
  interestRate: number;
  compoundFrequency: 'daily' | 'monthly' | 'none';
  lastInterestDate: Date;
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
  holdingId: string;
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

export interface TickerPortfolioInfo {
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
  portfolio?: TickerPortfolioInfo;
  intrinsicValues: TickerIntrinsicValue[];
}
