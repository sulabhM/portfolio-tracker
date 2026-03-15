import Dexie, { type Table } from 'dexie';
import type {
  Holding,
  Transaction,
  Note,
  PriceData,
  CashAccount,
  DividendRecord,
  WatchlistItem,
  IntrinsicValue,
} from '../types';

export class PortfolioDatabase extends Dexie {
  holdings!: Table<Holding, number>;
  transactions!: Table<Transaction, number>;
  notes!: Table<Note, number>;
  priceCache!: Table<PriceData, string>;
  cashAccounts!: Table<CashAccount, number>;
  dividendRecords!: Table<DividendRecord, number>;
  watchlist!: Table<WatchlistItem, number>;
  intrinsicValues!: Table<IntrinsicValue, number>;

  constructor() {
    super('PortfolioTracker');

    this.version(1).stores({
      holdings: '++id, ticker, sector',
      transactions: '++id, holdingId, ticker, type, date',
      notes: '++id, *tags, *tickerLinks',
      priceCache: 'ticker',
    });

    this.version(2)
      .stores({
        holdings: '++id, ticker, sector',
        transactions: '++id, holdingId, ticker, type, date',
        notes: '++id, *tags, *tickerLinks',
        priceCache: 'ticker',
        cashAccounts: '++id, name',
        dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
      })
      .upgrade((tx) => {
        return tx
          .table('holdings')
          .toCollection()
          .modify((holding) => {
            if (holding.drip === undefined) holding.drip = false;
            if (holding.dividendTaxRate === undefined)
              holding.dividendTaxRate = 0;
            if (holding.addedDate === undefined)
              holding.addedDate = holding.createdAt ?? new Date();
          });
      });

    this.version(3).stores({
      holdings: '++id, ticker, sector',
      transactions: '++id, holdingId, ticker, type, date',
      notes: '++id, *tags, *tickerLinks',
      priceCache: 'ticker',
      cashAccounts: '++id, name',
      dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
      watchlist: '++id, ticker, *tags',
    });

    this.version(4).stores({
      holdings: '++id, ticker, sector',
      transactions: '++id, holdingId, ticker, type, date',
      notes: '++id, *tags, *tickerLinks',
      priceCache: 'ticker',
      cashAccounts: '++id, name',
      dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
      watchlist: '++id, ticker, *tags',
      intrinsicValues: '++id, ticker, date',
    });

    this.version(5)
      .stores({
        holdings: '++id, ticker, sector',
        transactions: '++id, holdingId, ticker, type, date',
        notes: '++id, *tags, *tickerLinks',
        priceCache: 'ticker',
        cashAccounts: '++id, name',
        dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
        watchlist: '++id, ticker, *tags',
        intrinsicValues: '++id, ticker, date',
      })
      .upgrade((tx) => {
        return tx
          .table('holdings')
          .toCollection()
          .modify((holding: { country?: string }) => {
            if (holding.country === undefined) holding.country = '';
          });
      });
  }
}

export const db = new PortfolioDatabase();
