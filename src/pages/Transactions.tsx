import { useState } from 'react';
import { Plus, ArrowLeftRight } from 'lucide-react';
import { useTransactions } from '../db/hooks';
import { TransactionList } from '../components/transactions/TransactionList';
import { AddTransactionForm } from '../components/transactions/AddTransactionForm';
import { Modal } from '../components/common/Modal';
import { EmptyState } from '../components/common/EmptyState';

export function Transactions() {
  const transactions = useTransactions();
  const [showAdd, setShowAdd] = useState(false);
  const [filterType, setFilterType] = useState('all');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Transactions
        </h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          Add Transaction
        </button>
      </div>

      {transactions.length === 0 ? (
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
          filterType={filterType}
          onFilterChange={setFilterType}
        />
      )}

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Transaction"
      >
        <AddTransactionForm onDone={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}
