import { useState } from 'react';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { useTransactions, useAccounts } from '../db/hooks';
import { TransactionList } from '../components/transactions/TransactionList';
import { AddTransactionForm } from '../components/transactions/AddTransactionForm';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';
import { AccountSelect } from '../components/common/AccountSelect';

export function Transactions() {
  const accounts = useAccounts() ?? [];
  const [accountFilter, setAccountFilter] = useState<number | undefined>();
  const transactions = useTransactions(undefined, accountFilter);
  const allTransactions = useTransactions();
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState('all');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Transactions
        </h1>
        <div className="flex items-center gap-2">
          {accounts.length > 1 && (
            <AccountSelect
              accounts={accounts}
              value={accountFilter}
              isAll={accountFilter == null}
              allLabel="All accounts"
              onAllSelected={() => setAccountFilter(undefined)}
              onChange={setAccountFilter}
              className="px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            Add Transaction
          </button>
        </div>
      </div>

      {allTransactions.length === 0 ? (
        <EmptyState
          icon={<ArrowLeftRight size={48} />}
          title="No transactions yet"
          description="Record your buys, sells, and dividends to build a complete history."
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
              Log your first transaction
            </button>
          }
        />
      ) : (
        <TransactionList
          transactions={transactions}
          accounts={accounts}
          showAccount={accountFilter == null && accounts.length > 1}
          filterType={filterType}
          onFilterChange={setFilterType}
        />
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Transaction"
      >
        <AddTransactionForm
          defaultAccountId={accountFilter}
          onDone={() => setShowAdd(false)}
        />
      </Modal>
    </div>
  );
}
