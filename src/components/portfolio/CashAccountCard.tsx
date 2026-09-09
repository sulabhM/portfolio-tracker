import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Trash2, Plus, Landmark } from 'lucide-react';
import type { CashAccount, CashPayoutMode } from '../../types';
import {
  addCashAccount,
  updateCashAccount,
  deleteCashAccount,
} from '../../db/hooks';
import {
  normalizeCurrencyWithDefault,
  type CurrencyCode,
} from '../../constants/currencies';
import { formatCurrency, formatDate, formatMoney } from '../../utils/format';
import { toUsd } from '../../services/exchangeRates';
import {
  DEFAULT_PAYOUT_FREQUENCY_MONTHS,
  valueCashAccount,
} from '../../utils/cashAccount';
import { CurrencySelect } from '../common/CurrencySelect';
import { confirmBeforeDelete } from '../../utils/confirmBeforeDelete';
import { Modal } from '../common/Modal';

interface CashAccountsCardProps {
  accounts: CashAccount[];
  rates?: Map<string, number>;
}

export function CashAccountsCard({ accounts, rates }: CashAccountsCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CashAccount | undefined>();
  const totalCash = accounts.reduce(
    (sum, a) =>
      sum + toUsd(valueCashAccount(a).value, a.currency, rates ?? new Map()),
    0
  );

  function handleEdit(account: CashAccount) {
    setEditing(account);
    setShowForm(true);
  }

  function handleDone() {
    setShowForm(false);
    setEditing(undefined);
  }

  async function handleDelete(account: CashAccount) {
    if (account.id == null) return;
    const { value } = valueCashAccount(account);
    await confirmBeforeDelete(
      `Delete cash account "${account.name}" (${formatMoney(value, account.currency)})? This cannot be undone.`,
      () => deleteCashAccount(account.id!)
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Landmark size={18} className="text-indigo-500" />
          Cash Accounts
          {totalCash > 0 && (
            <span className="text-sm font-normal text-gray-500 dark:text-slate-400">
              &middot; {formatCurrency(totalCash)} today
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
          No cash accounts yet. Add a deposit to track its value as interest
          accrues.
        </p>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <CashAccountRow
              key={account.id}
              account={account}
              onEdit={() => handleEdit(account)}
              onDelete={() => handleDelete(account)}
            />
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

function describeTerms(account: CashAccount): string {
  if (account.interestRate <= 0) return 'No interest';
  const rate = `${(account.interestRate * 100).toFixed(2)}% p.a.`;
  if (account.payoutMode === 'maturity') {
    if (!account.maturityDate) return `${rate} · compounded, no maturity date set`;
    const { matured } = valueCashAccount(account);
    return matured
      ? `${rate} · compounded, matured ${formatDate(account.maturityDate)}`
      : `${rate} · compounded, matures ${formatDate(account.maturityDate)}`;
  }
  const months = account.payoutFrequencyMonths ?? DEFAULT_PAYOUT_FREQUENCY_MONTHS;
  const every = months === 1 ? 'every month' : `every ${months} months`;
  const { nextPayout } = valueCashAccount(account);
  return nextPayout
    ? `${rate} · paid ${every}, next ${formatDate(nextPayout)}`
    : `${rate} · paid ${every}`;
}

function CashAccountRow({
  account,
  onEdit,
  onDelete,
}: {
  account: CashAccount;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const valuation = valueCashAccount(account);
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {account.name}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {describeTerms(account)}
        </p>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {formatMoney(account.principal, account.currency)} deposited{' '}
          {formatDate(account.depositDate)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="font-semibold tabular-nums text-gray-900 dark:text-white">
            {formatMoney(valuation.value, account.currency)}
          </p>
          {valuation.accruedInterest > 0 && (
            <p className="text-xs tabular-nums text-gain">
              +{formatMoney(valuation.accruedInterest, account.currency)} interest
            </p>
          )}
        </div>
        <div className="flex gap-0.5">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
            title="Edit account"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
            title="Delete account"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Local-date `YYYY-MM-DD` for `<input type="date">`. */
function toInputDate(date: Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` as local midnight (avoids the UTC shift of `new Date(str)`). */
function fromInputDate(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function CashAccountForm({
  account,
  onDone,
}: {
  account?: CashAccount;
  onDone: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [principal, setPrincipal] = useState(
    account?.principal != null ? account.principal.toString() : ''
  );
  const [depositDate, setDepositDate] = useState(
    toInputDate(account?.depositDate ?? new Date())
  );
  const [interestRate, setInterestRate] = useState(
    account?.interestRate != null
      ? (account.interestRate * 100).toString()
      : ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    normalizeCurrencyWithDefault(account?.currency)
  );
  const [payoutMode, setPayoutMode] = useState<CashPayoutMode>(
    account?.payoutMode ?? 'periodic'
  );
  const [payoutFrequencyMonths, setPayoutFrequencyMonths] = useState(
    (account?.payoutFrequencyMonths ?? DEFAULT_PAYOUT_FREQUENCY_MONTHS).toString()
  );
  const [maturityDate, setMaturityDate] = useState(
    toInputDate(account?.maturityDate)
  );

  const draft = useMemo<CashAccount | undefined>(() => {
    const deposit = fromInputDate(depositDate);
    if (!deposit) return undefined;
    const base = {
      name: name.trim(),
      principal: Math.max(0, parseFloat(principal) || 0),
      depositDate: deposit,
      currency,
      interestRate: Math.max(0, parseFloat(interestRate) / 100 || 0),
      createdAt: account?.createdAt ?? new Date(),
    };
    if (payoutMode === 'maturity') {
      const maturity = fromInputDate(maturityDate);
      return { ...base, payoutMode, maturityDate: maturity };
    }
    return {
      ...base,
      payoutMode,
      payoutFrequencyMonths: Math.max(
        1,
        Math.round(parseFloat(payoutFrequencyMonths) || DEFAULT_PAYOUT_FREQUENCY_MONTHS)
      ),
    };
  }, [
    account?.createdAt,
    currency,
    depositDate,
    interestRate,
    maturityDate,
    name,
    payoutFrequencyMonths,
    payoutMode,
    principal,
  ]);

  const preview = draft ? valueCashAccount(draft) : undefined;
  const maturityBeforeDeposit =
    payoutMode === 'maturity' &&
    draft?.maturityDate != null &&
    draft.maturityDate <= draft.depositDate;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || maturityBeforeDeposit) return;
    if (draft.payoutMode === 'maturity' && !draft.maturityDate) return;

    // Spell out both mode-specific fields so switching modes on edit clears
    // the one that no longer applies (Dexie drops `undefined` on update).
    const data: Omit<CashAccount, 'id' | 'createdAt'> = {
      name: draft.name,
      principal: draft.principal,
      depositDate: draft.depositDate,
      currency: draft.currency,
      interestRate: draft.interestRate,
      payoutMode: draft.payoutMode,
      payoutFrequencyMonths:
        draft.payoutMode === 'periodic' ? draft.payoutFrequencyMonths : undefined,
      maturityDate:
        draft.payoutMode === 'maturity' ? draft.maturityDate : undefined,
    };
    if (account?.id) {
      await updateCashAccount(account.id, data);
    } else {
      if (data.payoutFrequencyMonths === undefined) delete data.payoutFrequencyMonths;
      if (data.maturityDate === undefined) delete data.maturityDate;
      await addCashAccount(data);
    }
    onDone();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const labelClass =
    'block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Account Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Fixed Deposit"
          required
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Principal Deposited</label>
          <input
            type="number"
            step="any"
            min="0"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
            placeholder="10000"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Currency</label>
          <CurrencySelect
            value={currency}
            onChange={setCurrency}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Deposit Date</label>
          <input
            type="date"
            value={depositDate}
            onChange={(e) => setDepositDate(e.target.value)}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Yearly Interest Rate (%)</label>
          <input
            type="number"
            step="any"
            min="0"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            placeholder="4.5"
            required
            className={inputClass}
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>Interest Payout</legend>
        <div className="grid grid-cols-2 gap-2">
          <PayoutModeOption
            selected={payoutMode === 'periodic'}
            onSelect={() => setPayoutMode('periodic')}
            title="Paid out periodically"
            description="Simple interest paid to you every few months"
          />
          <PayoutModeOption
            selected={payoutMode === 'maturity'}
            onSelect={() => setPayoutMode('maturity')}
            title="Compounded to maturity"
            description="Interest compounds yearly and is paid out at the end"
          />
        </div>
      </fieldset>

      {payoutMode === 'periodic' ? (
        <div>
          <label className={labelClass}>Payout Frequency (months)</label>
          <input
            type="number"
            step="1"
            min="1"
            value={payoutFrequencyMonths}
            onChange={(e) => setPayoutFrequencyMonths(e.target.value)}
            placeholder="3"
            required
            className={inputClass}
          />
        </div>
      ) : (
        <div>
          <label className={labelClass}>Maturity Date</label>
          <input
            type="date"
            value={maturityDate}
            min={depositDate || undefined}
            onChange={(e) => setMaturityDate(e.target.value)}
            required
            className={inputClass}
          />
          {maturityBeforeDeposit && (
            <p className="mt-1 text-xs text-loss">
              Maturity date must be after the deposit date.
            </p>
          )}
        </div>
      )}

      {preview && draft && draft.principal > 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-slate-400">
              Value today
            </span>
            <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
              {formatMoney(preview.value, currency)}
            </span>
          </div>
          {preview.accruedInterest > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500 dark:text-slate-400">
                {draft.payoutMode === 'maturity'
                  ? 'Compounded interest to date'
                  : 'Accrued since last payout'}
              </span>
              <span className="tabular-nums text-gain">
                +{formatMoney(preview.accruedInterest, currency)}
              </span>
            </div>
          )}
          {draft.payoutMode === 'periodic' && preview.payoutAmount != null && preview.payoutAmount > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500 dark:text-slate-400">
                Each payout
                {preview.nextPayout ? ` · next ${formatDate(preview.nextPayout)}` : ''}
              </span>
              <span className="tabular-nums text-gray-900 dark:text-white">
                {formatMoney(preview.payoutAmount, currency)}
              </span>
            </div>
          )}
          {draft.payoutMode === 'maturity' && draft.maturityDate && !maturityBeforeDeposit && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-gray-500 dark:text-slate-400">
                {preview.matured ? 'Matured' : 'At maturity'} · {formatDate(draft.maturityDate)}
              </span>
              <span className="tabular-nums text-gray-900 dark:text-white">
                {formatMoney(
                  valueCashAccount(draft, draft.maturityDate).value,
                  currency
                )}
              </span>
            </div>
          )}
        </div>
      )}

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
          disabled={maturityBeforeDeposit}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {account ? 'Update' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}

function PayoutModeOption({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={
        selected
          ? 'text-left p-3 rounded-lg border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 transition-colors'
          : 'text-left p-3 rounded-lg border border-gray-300 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors'
      }
    >
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </p>
      <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
        {description}
      </p>
    </button>
  );
}
