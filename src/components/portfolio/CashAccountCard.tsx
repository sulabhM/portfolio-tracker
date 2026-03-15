import { useState, type FormEvent } from 'react';
import { Pencil, Trash2, Plus, Landmark } from 'lucide-react';
import type { CashAccount } from '../../types';
import {
  addCashAccount,
  updateCashAccount,
  deleteCashAccount,
} from '../../db/hooks';
import { formatCurrency, cn } from '../../utils/format';
import { Modal } from '../common/Modal';

interface CashAccountsCardProps {
  accounts: CashAccount[];
}

export function CashAccountsCard({ accounts }: CashAccountsCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CashAccount | undefined>();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const totalCash = accounts.reduce((sum, a) => sum + a.balance, 0);

  function handleEdit(account: CashAccount) {
    setEditing(account);
    setShowForm(true);
  }

  function handleDone() {
    setShowForm(false);
    setEditing(undefined);
  }

  async function handleDelete(id: number) {
    if (deletingId === id) {
      await deleteCashAccount(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Landmark size={18} className="text-indigo-500" />
          Cash Accounts
          {totalCash > 0 && (
            <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
              &middot; {formatCurrency(totalCash)} total
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} />
          Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-3">
          No cash accounts yet. Add one to track your cash and earn interest.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                  {account.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {account.interestRate > 0
                    ? `${(account.interestRate * 100).toFixed(2)}% APR · ${account.compoundFrequency} compounding`
                    : 'No interest'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                  {formatCurrency(account.balance)}
                </span>
                <div className="flex gap-0.5">
                  <button
                    onClick={() => handleEdit(account)}
                    className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => account.id && handleDelete(account.id)}
                    className={cn(
                      'p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20',
                      deletingId === account.id
                        ? 'text-red-500'
                        : 'text-gray-400 hover:text-red-500'
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={handleDone}
        title={editing ? 'Edit Cash Account' : 'Add Cash Account'}
      >
        <CashAccountForm account={editing} onDone={handleDone} />
      </Modal>
    </div>
  );
}

function CashAccountForm({
  account,
  onDone,
}: {
  account?: CashAccount;
  onDone: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [balance, setBalance] = useState(account?.balance?.toString() ?? '');
  const [interestRate, setInterestRate] = useState(
    account?.interestRate != null
      ? (account.interestRate * 100).toString()
      : '0'
  );
  const [compoundFrequency, setCompoundFrequency] = useState(
    account?.compoundFrequency ?? 'none'
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      balance: parseFloat(balance) || 0,
      interestRate: Math.max(0, parseFloat(interestRate) / 100 || 0),
      compoundFrequency: compoundFrequency as 'daily' | 'monthly' | 'none',
      lastInterestDate: account?.lastInterestDate ?? new Date(),
    };

    if (account?.id) {
      await updateCashAccount(account.id, data);
    } else {
      await addCashAccount(data);
    }
    onDone();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Account Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Brokerage Cash"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Balance
        </label>
        <input
          type="number"
          step="any"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="10000"
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Interest Rate (% APR)
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            placeholder="4.5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Compounding
          </label>
          <select
            value={compoundFrequency}
            onChange={(e) => setCompoundFrequency(e.target.value as 'daily' | 'monthly' | 'none')}
            className={inputClass}
          >
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          {account ? 'Update' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}
