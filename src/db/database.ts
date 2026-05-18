import Dexie, { type Table } from 'dexie';
import { splitLegacyTags } from '../constants/autoTags';
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

    this.version(6)
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
      .upgrade(async (tx) => {
        await tx
          .table('holdings')
          .toCollection()
          .modify((h: { currency?: string }) => {
            if (h.currency === undefined) h.currency = 'USD';
          });
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: { currency?: string }) => {
            if (t.currency === undefined) t.currency = 'USD';
          });
        await tx
          .table('cashAccounts')
          .toCollection()
          .modify((c: { currency?: string }) => {
            if (c.currency === undefined) c.currency = 'USD';
          });
        await tx
          .table('intrinsicValues')
          .toCollection()
          .modify((iv: { currency?: string }) => {
            if (iv.currency === undefined) iv.currency = 'USD';
          });
        await tx
          .table('priceCache')
          .toCollection()
          .modify((p: { currency?: string }) => {
            if (p.currency === undefined) p.currency = 'USD';
          });
      });

    // v7: split watchlist `tags` into user `tags` + auto-generated `autoTags`.
    this.version(7)
      .stores({
        holdings: '++id, ticker, sector',
        transactions: '++id, holdingId, ticker, type, date',
        notes: '++id, *tags, *tickerLinks',
        priceCache: 'ticker',
        cashAccounts: '++id, name',
        dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
        watchlist: '++id, ticker, *tags, *autoTags',
        intrinsicValues: '++id, ticker, date',
      })
      .upgrade(async (tx) => {
        await tx
          .table('watchlist')
          .toCollection()
          .modify((w: { tags?: string[]; autoTags?: string[] }) => {
            if (Array.isArray(w.autoTags)) return;
            const { tags, autoTags } = splitLegacyTags(w.tags ?? []);
            w.tags = tags;
            w.autoTags = autoTags;
          });
      });
  }
}

export const db = new PortfolioDatabase();
