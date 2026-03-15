import { db } from '../db/database';
import { fetchDividendEvents, fetchPrice } from './yahooFinance';

const SYNC_COOLDOWN_KEY = 'lastDividendSync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function shouldSync(): boolean {
  const last = localStorage.getItem(SYNC_COOLDOWN_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > SYNC_INTERVAL_MS;
}

function markSynced() {
  localStorage.setItem(SYNC_COOLDOWN_KEY, Date.now().toString());
}

export async function processDividends(): Promise<number> {
  if (!shouldSync()) return 0;

  const holdings = await db.holdings.toArray();
  let processed = 0;

  for (const holding of holdings) {
    if (!holding.id) continue;
    try {
      processed += await processHoldingDividends(holding.id);
    } catch (err) {
      console.warn(`Dividend processing failed for ${holding.ticker}:`, err);
    }
  }

  markSynced();
  return processed;
}

async function processHoldingDividends(holdingId: number): Promise<number> {
  const holding = await db.holdings.get(holdingId);
  if (!holding) return 0;

  const sinceDate = new Date(holding.addedDate ?? holding.createdAt);
  const events = await fetchDividendEvents(holding.ticker, sinceDate);
  if (events.length === 0) return 0;

  const existing = await db.dividendRecords
    .where('[ticker+exDate]')
    .between(
      [holding.ticker.toUpperCase(), -Infinity],
      [holding.ticker.toUpperCase(), Infinity]
    )
    .toArray();

  const processedDates = new Set(existing.map((r) => r.exDate));
  let count = 0;

  for (const event of events) {
    if (processedDates.has(event.date)) continue;

    const sharesAtTime = holding.shares;
    const grossPayout = sharesAtTime * event.amount;
    const taxWithheld = grossPayout * (holding.dividendTaxRate ?? 0);
    const netPayout = grossPayout - taxWithheld;
    let reinvestedShares = 0;

    if (holding.drip && netPayout > 0) {
      const priceData = await fetchPrice(holding.ticker);
      const currentPrice = priceData?.price ?? holding.avgCost;
      if (currentPrice > 0) {
        reinvestedShares = netPayout / currentPrice;
        await db.holdings.update(holdingId, {
          shares: holding.shares + reinvestedShares,
          updatedAt: new Date(),
        });
      }
    } else if (netPayout > 0) {
      const accounts = await db.cashAccounts.toArray();
      if (accounts.length > 0 && accounts[0].id) {
        await db.cashAccounts.update(accounts[0].id, {
          balance: accounts[0].balance + netPayout,
        });
      }
    }

    await db.dividendRecords.add({
      holdingId,
      ticker: holding.ticker.toUpperCase(),
      exDate: event.date,
      amount: event.amount,
      totalAmount: grossPayout,
      taxWithheld,
      reinvestedShares,
      processedAt: new Date(),
    });

    const eventDate = new Date(event.date * 1000);
    await db.transactions.add({
      holdingId,
      ticker: holding.ticker.toUpperCase(),
      type: 'dividend',
      shares: reinvestedShares,
      price: event.amount,
      date: eventDate,
      notes: holding.drip
        ? `Auto-dividend: ${event.amount}/sh, reinvested ${reinvestedShares.toFixed(4)} shares (tax ${(holding.dividendTaxRate * 100).toFixed(0)}%)`
        : `Auto-dividend: ${event.amount}/sh, ${netPayout.toFixed(2)} deposited to cash`,
    });

    count++;
  }

  return count;
}

export async function accrueInterest(): Promise<number> {
  const accounts = await db.cashAccounts.toArray();
  const now = new Date();
  let totalAccrued = 0;

  for (const account of accounts) {
    if (
      !account.id ||
      account.compoundFrequency === 'none' ||
      account.interestRate <= 0 ||
      account.balance <= 0
    ) {
      continue;
    }

    const lastDate = new Date(account.lastInterestDate);
    const msElapsed = now.getTime() - lastDate.getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);

    if (daysElapsed < 1) continue;

    let shouldApply = false;
    let periodsToApply = 0;
    let ratePerPeriod = 0;

    if (account.compoundFrequency === 'daily') {
      const fullDays = Math.floor(daysElapsed);
      if (fullDays >= 1) {
        shouldApply = true;
        periodsToApply = fullDays;
        ratePerPeriod = account.interestRate / 365;
      }
    } else if (account.compoundFrequency === 'monthly') {
      const lastMonth =
        lastDate.getFullYear() * 12 + lastDate.getMonth();
      const currentMonth = now.getFullYear() * 12 + now.getMonth();
      const monthsElapsed = currentMonth - lastMonth;
      if (monthsElapsed >= 1) {
        shouldApply = true;
        periodsToApply = monthsElapsed;
        ratePerPeriod = account.interestRate / 12;
      }
    }

    if (!shouldApply || periodsToApply === 0) continue;

    const newBalance =
      account.balance * Math.pow(1 + ratePerPeriod, periodsToApply);
    const interest = newBalance - account.balance;
    totalAccrued += interest;

    await db.cashAccounts.update(account.id, {
      balance: newBalance,
      lastInterestDate: now,
    });

    if (interest > 0.001) {
      await db.transactions.add({
        ticker: account.name,
        type: 'interest',
        shares: 0,
        price: interest,
        date: now,
        notes: `Interest: ${(account.interestRate * 100).toFixed(2)}% APR, ${periodsToApply} ${account.compoundFrequency === 'daily' ? 'day(s)' : 'month(s)'}`,
      });
    }
  }

  return totalAccrued;
}
