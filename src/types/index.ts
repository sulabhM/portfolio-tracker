export interface Holding {
  id?: number;
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
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
  interestRate: number;
  compoundFrequency: 'daily' | 'monthly' | 'none';
  lastInterestDate: Date;
  createdAt: Date;
}

export interface WatchlistItem {
  id?: number;
  ticker: string;
  name: string;
  tags: string[];
  addedAt: Date;
}

export interface IntrinsicValue {
  id?: number;
  ticker: string;
  value: number;
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
