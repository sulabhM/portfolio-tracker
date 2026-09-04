import { useEffect } from 'react';
import { processDividends, accrueInterest } from '../services/dividendProcessor';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Module-level so it survives React StrictMode's mount/unmount/mount cycle and
 * multiple `App` renders. `accrueInterest` reads each account's
 * `lastInterestDate` and then writes the new balance; two overlapping runs
 * would both see the old date and apply the interest twice, so runs must be
 * strictly serialized rather than merely deduplicated.
 */
let inFlight: Promise<void> | null = null;

function runSync(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await accrueInterest();
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
