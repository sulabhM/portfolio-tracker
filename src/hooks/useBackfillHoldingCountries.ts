import { useEffect, useRef } from 'react';
import { useHoldings, updateHolding } from '../db/hooks';
import {
  DEFAULT_CURRENCY,
  normalizeCurrencyWithDefault,
} from '../constants/currencies';
import { lookupTicker } from '../services/yahooFinance';

const DELAY_MS = 800;

/**
 * Backfill country and trading currency for holdings from Yahoo quote data.
 */
export function useBackfillHoldingCountries() {
  const holdings = useHoldings();
  const backfillingRef = useRef(false);

  useEffect(() => {
    const needBackfill = holdings.filter((h) => {
      if (h.id == null) return false;
      const needsCountry = !(h.country ?? '').trim();
      const needsCurrency =
        !(h.currency ?? '').trim() ||
        normalizeCurrencyWithDefault(h.currency) === DEFAULT_CURRENCY;
      return needsCountry || needsCurrency;
    });
    if (needBackfill.length === 0 || backfillingRef.current) return;

    backfillingRef.current = true;

    (async () => {
      for (const h of needBackfill) {
        try {
          const info = await lookupTicker(h.ticker);
          const updates: { country?: string; currency?: string } = {};
          if (!(h.country ?? '').trim() && info?.country?.trim()) {
            updates.country = info.country.trim();
          }
          if (info?.currency) {
            const reported = normalizeCurrencyWithDefault(info.currency);
            const stored = normalizeCurrencyWithDefault(h.currency);
            if (!(h.currency ?? '').trim() || stored === DEFAULT_CURRENCY) {
              if (reported !== stored) {
                updates.currency = reported;
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            await updateHolding(h.id!, updates);
          }
        } catch (err) {
          console.warn(`Holding metadata backfill failed for ${h.ticker}:`, err);
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      backfillingRef.current = false;
    })();
  }, [holdings]);
}
