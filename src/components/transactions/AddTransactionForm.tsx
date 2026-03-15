import { useState, type FormEvent } from 'react';
import { addTransaction, useHoldings } from '../../db/hooks';
import { cn } from '../../utils/format';

interface AddTransactionFormProps {
  onDone: () => void;
  defaultTicker?: string;
}

export function AddTransactionForm({
  onDone,
  defaultTicker,
}: AddTransactionFormProps) {
  const holdings = useHoldings();
  const [type, setType] = useState<'buy' | 'sell' | 'dividend'>('buy');
  const [ticker, setTicker] = useState(defaultTicker ?? '');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const holding = holdings.find(
      (h) => h.ticker.toUpperCase() === ticker.toUpperCase()
    );
    await addTransaction({
      holdingId: holding?.id,
      ticker: ticker.toUpperCase().trim(),
      type,
      shares: parseFloat(shares) || 0,
      price: parseFloat(price) || 0,
      date: new Date(date),
      notes: notes.trim(),
    });
    onDone();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Type
        </label>
        <div className="flex gap-2">
          {(['buy', 'sell', 'dividend'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                type === t
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Ticker
          </label>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="AAPL"
            required
            list="ticker-suggestions"
            className={inputClass}
          />
          <datalist id="ticker-suggestions">
            {holdings.map((h) => (
              <option key={h.id} value={h.ticker} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            {type === 'dividend' ? 'Amount' : 'Shares'}
          </label>
          <input
            type="number"
            step="any"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder={type === 'dividend' ? '50.00' : '100'}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            {type === 'dividend' ? 'Per Share' : 'Price'}
          </label>
          <input
            type="number"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="150.00"
            required
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
          className={inputClass}
        />
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
          Add Transaction
        </button>
      </div>
    </form>
  );
}
