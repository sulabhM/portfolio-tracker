import { useEffect, useRef } from 'react';
import { useHoldings, updateHolding } from '../db/hooks';
import { lookupTicker } from '../services/yahooFinance';

const DELAY_MS = 800;

/**
 * Backfill country for existing holdings that have no country set.
 * Queries Yahoo Finance (lookupTicker) and updates each holding.
 * Runs once when the app loads and there are holdings with empty country.
 */
export function useBackfillHoldingCountries() {
  const holdings = useHoldings();
  const backfillingRef = useRef(false);

  useEffect(() => {
    const needBackfill = holdings.filter(
      (h) => !(h.country ?? '').trim() && h.id != null
    );
    if (needBackfill.length === 0 || backfillingRef.current) return;

    backfillingRef.current = true;

    (async () => {
      for (const h of needBackfill) {
        try {
          const info = await lookupTicker(h.ticker);
          if (info?.country?.trim()) {
            await updateHolding(h.id!, { country: info.country.trim() });
          }
        } catch (err) {
          console.warn(`Country backfill failed for ${h.ticker}:`, err);
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      backfillingRef.current = false;
    })();
  }, [holdings]);
}
