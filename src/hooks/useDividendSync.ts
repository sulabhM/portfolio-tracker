import { useEffect, useRef } from 'react';
import { processDividends, accrueInterest } from '../services/dividendProcessor';

const DAY_MS = 24 * 60 * 60 * 1000;

export function useDividendSync() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function run() {
      try {
        await accrueInterest();
        await processDividends();
      } catch (err) {
        console.warn('Dividend sync error:', err);
      }
    }

    run();
    const interval = setInterval(run, DAY_MS);
    return () => clearInterval(interval);
  }, []);
}
