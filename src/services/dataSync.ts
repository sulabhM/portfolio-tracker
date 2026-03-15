import { db } from '../db/database';
import type {
  Holding,
  Transaction,
  Note,
  CashAccount,
  DividendRecord,
  WatchlistItem,
  IntrinsicValue,
} from '../types';

const BACKUP_VERSION = 1;

/** Serialized shape for JSON (dates as ISO strings). */
export interface BackupData {
  version: number;
  exportedAt: string;
  holdings: Array<Omit<Holding, 'addedDate' | 'createdAt' | 'updatedAt'> & { addedDate: string; createdAt: string; updatedAt: string }>;
  transactions: Array<Omit<Transaction, 'date'> & { date: string }>;
  notes: Array<Omit<Note, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
  cashAccounts: Array<Omit<CashAccount, 'lastInterestDate' | 'createdAt'> & { lastInterestDate: string; createdAt: string }>;
  dividendRecords: Array<Omit<DividendRecord, 'processedAt'> & { processedAt: string }>;
  watchlist: Array<Omit<WatchlistItem, 'addedAt'> & { addedAt: string }>;
  intrinsicValues: Array<Omit<IntrinsicValue, 'date'> & { date: string }>;
}

function toDate(val: string | Date): Date {
  return typeof val === 'string' ? new Date(val) : val;
}

export async function exportAllData(): Promise<BackupData> {
  const [holdings, transactions, notes, cashAccounts, dividendRecords, watchlist, intrinsicValues] =
    await Promise.all([
      db.holdings.toArray(),
      db.transactions.toArray(),
      db.notes.toArray(),
      db.cashAccounts.toArray(),
      db.dividendRecords.toArray(),
      db.watchlist.toArray(),
      db.intrinsicValues.toArray(),
    ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    holdings: holdings.map((h) => ({
      ...h,
      addedDate: (h.addedDate instanceof Date ? h.addedDate : new Date(h.addedDate)).toISOString(),
      createdAt: (h.createdAt instanceof Date ? h.createdAt : new Date(h.createdAt)).toISOString(),
      updatedAt: (h.updatedAt instanceof Date ? h.updatedAt : new Date(h.updatedAt)).toISOString(),
    })),
    transactions: transactions.map((t) => ({
      ...t,
      date: (t.date instanceof Date ? t.date : new Date(t.date)).toISOString(),
    })),
    notes: notes.map((n) => ({
      ...n,
      createdAt: (n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt)).toISOString(),
      updatedAt: (n.updatedAt instanceof Date ? n.updatedAt : new Date(n.updatedAt)).toISOString(),
    })),
    cashAccounts: cashAccounts.map((c) => ({
      ...c,
      lastInterestDate: (c.lastInterestDate instanceof Date ? c.lastInterestDate : new Date(c.lastInterestDate)).toISOString(),
      createdAt: (c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)).toISOString(),
    })),
    dividendRecords: dividendRecords.map((d) => ({
      ...d,
      processedAt: (d.processedAt instanceof Date ? d.processedAt : new Date(d.processedAt)).toISOString(),
    })),
    watchlist: watchlist.map((w) => ({
      ...w,
      addedAt: (w.addedAt instanceof Date ? w.addedAt : new Date(w.addedAt)).toISOString(),
    })),
    intrinsicValues: intrinsicValues.map((iv) => ({
      ...iv,
      date: (iv.date instanceof Date ? iv.date : new Date(iv.date)).toISOString(),
    })),
  };
}

export async function importAllData(data: BackupData): Promise<void> {
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version: ${data.version}. Expected ${BACKUP_VERSION}.`);
  }

  await db.transaction('rw', [db.holdings, db.transactions, db.notes, db.cashAccounts, db.dividendRecords, db.watchlist, db.intrinsicValues], async () => {
    await db.holdings.clear();
    await db.transactions.clear();
    await db.notes.clear();
    await db.cashAccounts.clear();
    await db.dividendRecords.clear();
    await db.watchlist.clear();
    await db.intrinsicValues.clear();

    await db.holdings.bulkAdd(
      data.holdings.map((h) => ({
        ...h,
        addedDate: toDate(h.addedDate),
        createdAt: toDate(h.createdAt),
        updatedAt: toDate(h.updatedAt),
      }))
    );
    await db.transactions.bulkAdd(
      data.transactions.map((t) => ({ ...t, date: toDate(t.date) }))
    );
    await db.notes.bulkAdd(
      data.notes.map((n) => ({
        ...n,
        createdAt: toDate(n.createdAt),
        updatedAt: toDate(n.updatedAt),
      }))
    );
    await db.cashAccounts.bulkAdd(
      data.cashAccounts.map((c) => ({
        ...c,
        lastInterestDate: toDate(c.lastInterestDate),
        createdAt: toDate(c.createdAt),
      }))
    );
    await db.dividendRecords.bulkAdd(
      data.dividendRecords.map((d) => ({ ...d, processedAt: toDate(d.processedAt) }))
    );
    await db.watchlist.bulkAdd(
      data.watchlist.map((w) => ({ ...w, addedAt: toDate(w.addedAt) }))
    );
    await db.intrinsicValues.bulkAdd(
      data.intrinsicValues.map((iv) => ({ ...iv, date: toDate(iv.date) }))
    );
  });
}
