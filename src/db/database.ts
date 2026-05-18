import Dexie, { type Table } from 'dexie';
import type {
  Transaction,
  Note,
  PriceData,
  CashAccount,
  DividendRecord,
  TickerEntry,
} from '../types';

export class PortfolioDatabase extends Dexie {
  tickers!: Table<TickerEntry, string>;
  transactions!: Table<Transaction, number>;
  notes!: Table<Note, number>;
  priceCache!: Table<PriceData, string>;
  cashAccounts!: Table<CashAccount, number>;
  dividendRecords!: Table<DividendRecord, number>;

  constructor() {
    super('PortfolioTracker');

    this.version(9).stores({
      transactions: '++id, holdingId, ticker, type, date',
      notes: '++id, *tags, *tickerLinks',
      priceCache: 'ticker',
      cashAccounts: '++id, name',
      dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
      tickers: 'ticker, *userTags, *autoTags',
    });
  }
}

export const db = new PortfolioDatabase();
