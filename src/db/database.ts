import Dexie, { type Table } from 'dexie';
import { splitLegacyTags } from '../constants/autoTags';
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

    // v8: add the flattened ticker table and migrate holdings/watchlist/
    // intrinsicValues into one row per ticker.
    this.version(8)
      .stores({
        holdings: '++id, ticker, sector',
        transactions: '++id, holdingId, ticker, type, date',
        notes: '++id, *tags, *tickerLinks',
        priceCache: 'ticker',
        cashAccounts: '++id, name',
        dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
        watchlist: '++id, ticker, *tags, *autoTags',
        intrinsicValues: '++id, ticker, date',
        tickers: 'ticker, *userTags, *autoTags',
      })
      .upgrade(async (tx) => {
        const [holdings, watchlist, intrinsicValues] = await Promise.all([
          tx.table('holdings').toArray(),
          tx.table('watchlist').toArray(),
          tx.table('intrinsicValues').toArray(),
        ]);

        const entries = new Map<string, TickerEntry>();
        const ensureEntry = (ticker: string): TickerEntry => {
          const key = ticker.toUpperCase();
          let entry = entries.get(key);
          if (!entry) {
            entry = {
              ticker: key,
              name: key,
              userTags: [],
              autoTags: [],
              addedAt: new Date(),
              intrinsicValues: [],
            };
            entries.set(key, entry);
          }
          return entry;
        };

        for (const w of watchlist) {
          const entry = ensureEntry(w.ticker);
          entry.name = w.name ?? entry.name;
          const split = Array.isArray(w.autoTags)
            ? { tags: w.tags ?? [], autoTags: w.autoTags ?? [] }
            : splitLegacyTags(w.tags ?? []);
          entry.userTags = split.tags;
          entry.autoTags = split.autoTags;
          entry.addedAt = w.addedAt ?? entry.addedAt;
        }

        for (const h of holdings) {
          const entry = ensureEntry(h.ticker);
          entry.name = h.name ?? entry.name;
          entry.addedAt = entry.addedAt ?? h.addedDate ?? h.createdAt ?? new Date();
          if (!entry.autoTags.includes('portfolio')) {
            entry.autoTags.push('portfolio');
          }
          entry.portfolio = {
            shares: h.shares,
            avgCost: h.avgCost,
            currency: h.currency ?? 'USD',
            sector: h.sector,
            country: h.country ?? '',
            drip: h.drip ?? false,
            dividendTaxRate: h.dividendTaxRate ?? 0,
            addedDate: h.addedDate ?? h.createdAt ?? new Date(),
            createdAt: h.createdAt ?? new Date(),
            updatedAt: h.updatedAt ?? new Date(),
          };
        }

        for (const iv of intrinsicValues) {
          const entry = ensureEntry(iv.ticker);
          entry.intrinsicValues.push({
            value: iv.value,
            currency: iv.currency ?? 'USD',
            date: iv.date ?? new Date(),
          });
        }

        for (const entry of entries.values()) {
          entry.intrinsicValues.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
        }

        await tx.table('tickers').bulkPut(Array.from(entries.values()));
      });

    // v9: the flattened ticker table is the source of truth. Remove the old
    // holdings/watchlist/intrinsicValues tables so IndexedDB matches the backup
    // ticker-entry shape.
    this.version(9).stores({
      holdings: null,
      transactions: '++id, holdingId, ticker, type, date',
      notes: '++id, *tags, *tickerLinks',
      priceCache: 'ticker',
      cashAccounts: '++id, name',
      dividendRecords: '++id, holdingId, ticker, [ticker+exDate]',
      watchlist: null,
      intrinsicValues: null,
      tickers: 'ticker, *userTags, *autoTags',
    });
  }
}

export const db = new PortfolioDatabase();
