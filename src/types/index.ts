export interface Holding {
  id?: number;
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
  holdingId?: number;
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
  id?: number;
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
  id?: number;
  ticker: string;
  value: number;
  /** ISO 4217 currency for value. */
  currency: string;
  date: Date;
}

export interface DividendRecord {
  id?: number;
  holdingId: number;
  ticker: string;
  exDate: number;
  amount: number;
  totalAmount: number;
  taxWithheld: number;
  reinvestedShares: number;
  processedAt: Date;
}
