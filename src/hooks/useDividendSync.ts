import { useEffect } from 'react';
import { processDividends } from '../services/dividendProcessor';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Module-level so it survives React StrictMode's mount/unmount/mount cycle and
 * multiple `App` renders. Dividend processing reads a holding's share count
 * and then writes the DRIP-adjusted count; two overlapping runs would both
 * see the old value and apply the payout twice, so runs must be strictly
 * serialized rather than merely deduplicated.
 *
 * Cash interest is no longer accrued here: cash accounts are valued on read
 * from principal, deposit date and rate (see `utils/cashAccount.ts`).
 */
let inFlight: Promise<void> | null = null;

function runSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await processDividends();
    } catch (err) {
      console.warn('Dividend sync error:', err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function useDividendSync() {
  useEffect(() => {
    // The previous implementation used a `ran` ref to skip the second
    // StrictMode invocation — but the first invocation's cleanup had already
    // cleared the interval, so in development the daily re-run never fired.
    void runSync();
    const interval = setInterval(() => void runSync(), DAY_MS);
    return () => clearInterval(interval);
  }, []);
}
