import { useState, useEffect, useRef } from 'react';
import { fetchMarketState } from '../services/yahooFinance';
import type { MarketState } from '../services/yahooFinance';

export function useMarketState() {
  const [state, setState] = useState<MarketState>('CLOSED');
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    fetchMarketState().then(setState);
    intervalRef.current = setInterval(() => {
      fetchMarketState().then(setState);
    }, 60_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  return state;
}
