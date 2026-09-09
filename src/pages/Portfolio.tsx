import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Briefcase, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { useHoldings, useCashAccounts, useAccounts, NO_ACCOUNTS } from '../db/hooks';
import { usePrices } from '../hooks/usePrices';
import { useExchangeRates } from '../hooks/useExchangeRates';
import { useEffectivePrice } from '../hooks/useEffectivePrice';
import { collectPortfolioCurrencies } from '../utils/portfolioCurrency';
import { computePortfolioTotals, type PortfolioTotals } from '../utils/portfolioValuation';
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
import { AccountSelect } from '../components/common/AccountSelect';
import { ACCOUNT_TYPE_LABELS } from '../utils/accounts';
import { formatCurrency, formatPercent, cn } from '../utils/format';
import type { Account, CashAccount, Holding, PriceData } from '../types';

const SELECTED_ACCOUNT_KEY = 'portfolio.selectedAccount';
const COLLAPSED_KEY = 'portfolio.collapsedAccounts';

type Selection = 'all' | number;

function readSelection(): Selection {
  const raw = localStorage.getItem(SELECTED_ACCOUNT_KEY);
  if (raw == null || raw === 'all') return 'all';
  const n = Number(raw);
  return Number.isInteger(n) ? n : 'all';
}

function readCollapsed(): Set<number> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

export function Portfolio() {
  const accountsQuery = useAccounts();
  const accounts = accountsQuery ?? NO_ACCOUNTS;
  const accountsLoading = accountsQuery === undefined;
  const holdings = useHoldings();
  const cashAccounts = useCashAccounts();
  const [storedSelection, setSelection] = useState<Selection>(readSelection);
  const [collapsed, setCollapsed] = useState<Set<number>>(readCollapsed);

  // If the remembered account no longer exists, behave as "all".
  const selection: Selection =
    storedSelection !== 'all' &&
    accounts.length > 0 &&
    !accounts.some((a) => a.id === storedSelection)
      ? 'all'
      : storedSelection;
  useEffect(() => {
    localStorage.setItem(SELECTED_ACCOUNT_KEY, String(selection));
  }, [selection]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);

  // Prices/rates are fetched for everything so switching accounts is instant.
  const tickers = useMemo(
    () => [...new Set(holdings.map((h) => h.ticker))],
    [holdings]
  );
  const tickerKey = tickers.join(',');
  const { prices, forceRefresh } = usePrices(tickers);
  const currencies = useMemo(
    () => collectPortfolioCurrencies(holdings, cashAccounts, prices),
    [holdings, cashAccounts, prices]
  );
  const { rates } = useExchangeRates(currencies);
  const resolve = useEffectivePrice();
  const [dividendRates, setDividendRates] = useState<Map<string, DividendRateData>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | undefined>();
  // Account preselected in the add form: the group the user clicked in, else
  // the filtered account, else the first one.
  const [addAccountId, setAddAccountId] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (tickers.length === 0) return new Map<string, DividendRateData>();
        return fetchDividendRates(tickers);
      })
      .then((rates) => {
        if (!cancelled) setDividendRates(rates);
      });
    return () => {
      cancelled = true;
    };
  }, [tickerKey, tickers]);

  const stableRefresh = useCallback(() => forceRefresh(), [forceRefresh]);
  useRegisterRefresh('portfolio-prices', stableRefresh);
  const marketState = useMarketState();

  const visibleHoldings = useMemo(
    () => (selection === 'all' ? holdings : holdings.filter((h) => h.accountId === selection)),
    [holdings, selection]
  );
  const visibleCash = useMemo(
    () => (selection === 'all' ? cashAccounts : cashAccounts.filter((c) => c.accountId === selection)),
    [cashAccounts, selection]
  );
  const totals = useMemo(
    () => computePortfolioTotals(visibleHoldings, visibleCash, prices, rates, resolve),
    [visibleHoldings, visibleCash, prices, rates, resolve]
  );

  // Accounts to render as groups in "all" view: every account, plus a
  // synthetic bucket for anything pointing at an account that no longer exists.
  const groups = useMemo(() => {
    const known = new Set(accounts.map((a) => a.id));
    const orphanHoldings = holdings.filter((h) => !known.has(h.accountId));
    const orphanCash = cashAccounts.filter((c) => !known.has(c.accountId));
    const list: Array<{ account: Account | null; holdings: Holding[]; cash: CashAccount[] }> =
      accounts.map((a) => ({
        account: a,
        holdings: holdings.filter((h) => h.accountId === a.id),
        cash: cashAccounts.filter((c) => c.accountId === a.id),
      }));
    if (orphanHoldings.length || orphanCash.length) {
      list.push({ account: null, holdings: orphanHoldings, cash: orphanCash });
    }
    return list;
  }, [accounts, holdings, cashAccounts]);

  function handleEdit(holding: Holding) {
    setEditingHolding(holding);
    setShowAdd(true);
  }

  function handleDone() {
    setShowAdd(false);
    setEditingHolding(undefined);
    setAddAccountId(undefined);
  }

  function openAdd(accountId?: number) {
    setAddAccountId(accountId);
    setShowAdd(true);
  }

  function toggleCollapsed(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedAccount =
    selection === 'all' ? undefined : accounts.find((a) => a.id === selection);
  const defaultAccountId = addAccountId ?? selectedAccount?.id ?? accounts[0]?.id;
  const nothingAnywhere = holdings.length === 0 && cashAccounts.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Portfolio
          </h1>
          <MarketBadge state={marketState} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {accounts.length > 0 && (
            <AccountSelect
              accounts={accounts}
              value={selection === 'all' ? undefined : selection}
              isAll={selection === 'all'}
              allLabel="All accounts"
              onAllSelected={() => setSelection('all')}
              onChange={(id) => setSelection(id)}
              className="px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          <Link
            to="/settings#accounts"
            className="p-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            title="Manage accounts"
          >
            <Settings2 size={16} />
          </Link>
          <RefreshButton />
          <button
            onClick={() => openAdd()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Add Holding
          </button>
        </div>
      </div>

      {!nothingAnywhere && (
        <SummaryStrip
          totals={totals}
          label={selectedAccount ? selectedAccount.name : 'All accounts'}
        />
      )}

      {accountsLoading ? null : accounts.length === 0 && nothingAnywhere ? (
        <EmptyState
          icon={<Briefcase size={48} />}
          title="No accounts yet"
          description="Create an account (a brokerage, a bank, a pension wrapper) to hold your securities and cash."
          action={
            <Link
              to="/settings#accounts"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
              Create an account
            </Link>
          }
        />
      ) : nothingAnywhere ? (
        <EmptyState
          icon={<Briefcase size={48} />}
          title="No holdings yet"
          description="Add your first stock, ETF or deposit to start tracking your portfolio."
          action={
            <button
              onClick={() => openAdd()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
              Add your first holding
            </button>
          }
        />
      ) : selection === 'all' ? (
        <div className="space-y-4">
          {groups.map(({ account, holdings: gh, cash: gc }) => {
            const id = account?.id ?? -1;
            const isCollapsed = collapsed.has(id);
            const groupTotals = computePortfolioTotals(gh, gc, prices, rates, resolve);
            return (
              <AccountGroup
                key={id}
                account={account}
                totals={groupTotals}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapsed(id)}
              >
                <AccountContents
                  holdings={gh}
                  cash={gc}
                  accountId={account?.id}
                  prices={prices}
                  rates={rates}
                  dividendRates={dividendRates}
                  onEdit={handleEdit}
                  onAddHolding={() => openAdd(account?.id)}
                />
              </AccountGroup>
            );
          })}
        </div>
      ) : (
        <AccountContents
          holdings={visibleHoldings}
          cash={visibleCash}
          accountId={selectedAccount?.id}
          prices={prices}
          rates={rates}
          dividendRates={dividendRates}
          onEdit={handleEdit}
          onAddHolding={() => openAdd(selectedAccount?.id)}
        />
      )}

      <Modal
        open={showAdd}
        onClose={handleDone}
        title={editingHolding ? 'Edit Holding' : 'Add Holding'}
      >
        <AddHoldingForm
          holding={editingHolding}
          defaultAccountId={defaultAccountId}
          onDone={handleDone}
        />
      </Modal>
    </div>
  );
}

function SummaryStrip({ totals, label }: { totals: PortfolioTotals; label: string }) {
  const cells: Array<{ label: string; value: string; tone?: 'gain' | 'loss' }> = [
    { label: 'Total value', value: formatCurrency(totals.total) },
    { label: 'Securities', value: formatCurrency(totals.securities) },
    { label: 'Cash & deposits', value: formatCurrency(totals.cash) },
    {
      label: 'Unrealized P&L',
      value: `${formatCurrency(totals.pnl)} (${formatPercent(totals.pnlPct)})`,
      tone: totals.pnl >= 0 ? 'gain' : 'loss',
    },
    {
      label: 'Day change',
      value:
        totals.pricedCount > 0
          ? `${formatCurrency(totals.dayChange)} (${formatPercent(totals.dayChangePct)})`
          : '—',
      tone: totals.pricedCount > 0 ? (totals.dayChange >= 0 ? 'gain' : 'loss') : undefined,
    },
  ];
  return (
    <div className="mb-6 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-2">
        {label}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-xs text-gray-500 dark:text-slate-400">{c.label}</p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums',
                c.tone === 'gain' && 'text-gain',
                c.tone === 'loss' && 'text-loss',
                !c.tone && 'text-gray-900 dark:text-white'
              )}
            >
              {c.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountGroup({
  account,
  totals,
  collapsed,
  onToggle,
  children,
}: {
  account: Account | null;
  totals: PortfolioTotals;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          {collapsed ? (
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          )}
          <h2 className="font-semibold text-gray-900 dark:text-white truncate">
            {account ? account.name : 'Unassigned'}
          </h2>
          {account && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </span>
          )}
          {account?.institution && (
            <span className="text-xs text-gray-500 dark:text-slate-400 truncate">
              {account.institution}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm tabular-nums shrink-0">
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatCurrency(totals.total)}
          </span>
          {totals.cost > 0 && (
            <span className={cn('hidden sm:inline', totals.pnl >= 0 ? 'text-gain' : 'text-loss')}>
              {formatCurrency(totals.pnl)} ({formatPercent(totals.pnlPct)})
            </span>
          )}
        </div>
      </button>
      {!collapsed && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

function AccountContents({
  holdings,
  cash,
  accountId,
  prices,
  rates,
  dividendRates,
  onEdit,
  onAddHolding,
}: {
  holdings: Holding[];
  cash: CashAccount[];
  accountId: number | undefined;
  prices: Map<string, PriceData>;
  rates: Map<string, number>;
  dividendRates: Map<string, DividendRateData>;
  onEdit: (h: Holding) => void;
  onAddHolding: () => void;
}) {
  return (
    <div>
      {holdings.length === 0 ? (
        <div className="py-4 text-sm text-gray-500 dark:text-slate-400 flex items-center gap-3">
          No securities in this account.
          <button
            type="button"
            onClick={onAddHolding}
            className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <Plus size={14} /> Add holding
          </button>
        </div>
      ) : (
        <HoldingsTable
          holdings={holdings}
          prices={prices}
          rates={rates}
          dividendRates={dividendRates}
          onEdit={onEdit}
        />
      )}
      <CashAccountsCard
        accounts={cash}
        rates={rates}
        defaultAccountId={accountId}
        embedded
      />
    </div>
  );
}
