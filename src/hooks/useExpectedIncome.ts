import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchDividendRates } from '../services/yahooFinance';
import type { DividendRateData } from '../services/yahooFinance';
import type { Holding, CashAccount } from '../types';
import { toUsd } from '../utils/portfolioCurrency';
import { annualCashInterest } from '../utils/cashAccount';

export interface IncomeItem {
  ticker: string;
  name: string;
  type: 'dividend' | 'interest';
  annualAmount: number;
}

export function useExpectedIncome(
  holdings: Holding[],
  cashAccounts: CashAccount[],
  rates: Map<string, number>
) {
  const [divRates, setDivRates] = useState<Map<string, DividendRateData>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const tickerKey = holdings.map((h) => h.ticker).join(',');

  const refetch = useCallback(async () => {
    const tickers = tickerKey ? tickerKey.split(',') : [];
    if (tickers.length === 0) {
      setDivRates(new Map());
      return;
    }
    setLoading(true);
    try {
      setDivRates(await fetchDividendRates(tickers));
    } finally {
      setLoading(false);
    }
  }, [tickerKey]);

  useEffect(() => {
    void Promise.resolve().then(refetch);
  }, [refetch]);

  return useMemo(() => {
    let dividendIncome = 0;
    const breakdown: IncomeItem[] = [];

    // A ticker held in several accounts is one line in the breakdown.
    const byTicker = new Map<string, IncomeItem>();
    for (const h of holdings) {
      const rate = divRates.get(h.ticker.toUpperCase());
      if (rate && rate.annualRate > 0) {
        const gross = h.shares * rate.annualRate;
        const net = h.drip
          ? gross * (1 - (h.dividendTaxRate ?? 0))
          : gross;
        const netUsd = toUsd(net, h.currency, rates);
        dividendIncome += netUsd;
        const existing = byTicker.get(h.ticker);
        if (existing) {
          existing.annualAmount += netUsd;
        } else {
          byTicker.set(h.ticker, {
            ticker: h.ticker,
            name: h.name,
            type: 'dividend',
            annualAmount: netUsd,
          });
        }
      }
    }
    breakdown.push(...byTicker.values());

    let interestIncome = 0;
    for (const a of cashAccounts) {
      const income = annualCashInterest(a);
      if (income <= 0) continue;
      const incomeUsd = toUsd(income, a.currency, rates);
      interestIncome += incomeUsd;
      breakdown.push({
        ticker: a.name,
        name: a.name,
        type: 'interest',
        annualAmount: incomeUsd,
      });
    }

    breakdown.sort((a, b) => b.annualAmount - a.annualAmount);

    return {
      total: dividendIncome + interestIncome,
      dividendIncome,
      interestIncome,
      breakdown,
      loading,
    };
  }, [holdings, cashAccounts, divRates, loading, rates]);
}
