import { useState, useMemo, useCallback, useEffect } from 'react';
import { Plus, Briefcase } from 'lucide-react';
import { useHoldings, useCashAccounts } from '../db/hooks';
import { usePrices } from '../hooks/usePrices';
import { useRegisterRefresh } from '../contexts/RefreshTimerContext';
import { fetchDividendRates } from '../services/yahooFinance';
import type { DividendRateData } from '../services/yahooFinance';
import { HoldingsTable } from '../components/portfolio/HoldingsTable';
import { AddHoldingForm } from '../components/portfolio/AddHoldingForm';
import { CashAccountsCard } from '../components/portfolio/CashAccountCard';
import { useMarketState } from '../hooks/useMarketState';
import { RefreshButton } from '../components/common/RefreshButton';
import { MarketBadge } from '../components/common/MarketBadge';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import type { Holding } from '../types';

export function Portfolio() {
  const holdings = useHoldings();
  const cashAccounts = useCashAccounts();
  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const { prices, forceRefresh } = usePrices(tickers);
  const [dividendRates, setDividendRates] = useState<Map<string, DividendRateData>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | undefined>();

  useEffect(() => {
    if (tickers.length === 0) {
      setDividendRates(new Map());
      return;
    }
    fetchDividendRates(tickers).then(setDividendRates);
  }, [tickers.join(',')]);

  const stableRefresh = useCallback(() => forceRefresh(), [forceRefresh]);
  useRegisterRefresh('portfolio-prices', stableRefresh);
  const marketState = useMarketState();

  function handleEdit(holding: Holding) {
    setEditingHolding(holding);
    setShowAdd(true);
  }

  function handleDone() {
    setShowAdd(false);
    setEditingHolding(undefined);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Portfolio
          </h1>
          <MarketBadge state={marketState} />
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Add Holding
          </button>
        </div>
      </div>

      <CashAccountsCard accounts={cashAccounts} />

      {holdings.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={48} />}
          title="No holdings yet"
          description="Add your first stock or ETF to start tracking your portfolio."
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
              Add your first holding
            </button>
          }
        />
      ) : (
        <HoldingsTable
          holdings={holdings}
          prices={prices}
          dividendRates={dividendRates}
          onEdit={handleEdit}
        />
      )}

      <Modal
        open={showAdd}
        onClose={handleDone}
        title={editingHolding ? 'Edit Holding' : 'Add Holding'}
      >
        <AddHoldingForm holding={editingHolding} onDone={handleDone} />
      </Modal>
    </div>
  );
}
