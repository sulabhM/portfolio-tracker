import { useState } from 'react';
import {
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
} from 'lucide-react';
import type { Transaction } from '../../types';
import { deleteTransaction } from '../../db/hooks';
import { formatCurrency, formatDate, cn } from '../../utils/format';

interface TransactionListProps {
  transactions: Transaction[];
  filterType: string;
  onFilterChange: (type: string) => void;
}

export function TransactionList({
  transactions,
  filterType,
  onFilterChange,
}: TransactionListProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    if (deletingId === id) {
      await deleteTransaction(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  }

  function typeIcon(type: string) {
    switch (type) {
      case 'buy':
        return <ArrowDownRight size={16} className="text-gain" />;
      case 'sell':
        return <ArrowUpRight size={16} className="text-loss" />;
      case 'dividend':
        return <DollarSign size={16} className="text-amber-500" />;
      default:
        return null;
    }
  }

  const filtered =
    filterType === 'all'
      ? transactions
      : transactions.filter((t) => t.type === filterType);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {['all', 'buy', 'sell', 'dividend'].map((t) => (
          <button
            key={t}
            onClick={() => onFilterChange(t)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full transition-colors',
              filterType === t
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            )}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800">
              {typeIcon(tx.type)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {tx.ticker}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded',
                    tx.type === 'buy'
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : tx.type === 'sell'
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  )}
                >
                  {tx.type}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {tx.shares} shares @ {formatCurrency(tx.price)} &middot;{' '}
                {formatDate(tx.date)}
              </p>
              {tx.notes && (
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">
                  {tx.notes}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-medium tabular-nums text-gray-900 dark:text-white">
                {formatCurrency(tx.shares * tx.price)}
              </p>
            </div>
            <button
              onClick={() => tx.id && handleDelete(tx.id)}
              className={cn(
                'p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20',
                deletingId === tx.id
                  ? 'text-red-500'
                  : 'text-gray-400 hover:text-red-500'
              )}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
