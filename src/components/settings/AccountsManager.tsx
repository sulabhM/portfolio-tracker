import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Wallet } from 'lucide-react';
import type { Account, AccountType } from '../../types';
import {
  useAccounts,
  addAccount,
  updateAccount,
  deleteAccount,
  reorderAccounts,
  getAccountContents,
  type AccountContents,
} from '../../db/hooks';
import { Modal } from '../common/Modal';
import { ACCOUNT_TYPE_LABELS } from '../../utils/accounts';
import { requestConfirm } from '../../utils/confirmBridge';
import { cn } from '../../utils/format';

const inputClass =
  'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1';

export function AccountsManager() {
  const accountsQuery = useAccounts();
  const accounts = accountsQuery ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();
  const [deleting, setDeleting] = useState<Account | undefined>();
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setEditing(undefined);
    setShowForm(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(undefined);
  }

  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= accounts.length) return;
    const ids = accounts.map((a) => a.id as number);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderAccounts(ids);
  }

  return (
    <section
      id="accounts"
      className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6 max-w-2xl mb-6"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Wallet size={18} className="text-indigo-500" />
          Accounts
        </h2>
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} />
          Add Account
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
        Accounts group your holdings and cash by where they live: a brokerage, a
        bank, a pension. The watchlist is shared across all of them.
      </p>

      {accountsQuery === undefined ? null : accounts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400 py-3">
          No accounts yet. Add one to start recording holdings.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-800 rounded-lg border border-gray-200 dark:border-slate-800">
          {accounts.map((a, i) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 disabled:opacity-30"
                  title="Move up"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === accounts.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 disabled:opacity-30"
                  title="Move down"
                >
                  <ArrowDown size={12} />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                  {a.name}
                  <span className="ml-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400">
                    {ACCOUNT_TYPE_LABELS[a.type]}
                  </span>
                </p>
                {(a.institution || a.notes) && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                    {[a.institution, a.notes].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                  title="Edit account"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setDeleting(a);
                  }}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"
                  title="Delete account"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-3" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editing ? 'Edit Account' : 'Add Account'}
      >
        <AccountForm account={editing} onDone={closeForm} />
      </Modal>

      {deleting && (
        <DeleteAccountDialog
          account={deleting}
          others={accounts.filter((a) => a.id !== deleting.id)}
          onClose={() => setDeleting(undefined)}
          onError={setError}
        />
      )}
    </section>
  );
}

function AccountForm({ account, onDone }: { account?: Account; onDone: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'brokerage');
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [notes, setNotes] = useState(account?.notes ?? '');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const data = {
      name: trimmed,
      type,
      institution: institution.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (account?.id != null) {
      await updateAccount(account.id, data);
    } else {
      await addAccount(data);
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelClass}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Interactive Brokers, Main bank…"
          required
          autoFocus
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className={inputClass}
          >
            {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Institution (optional)</label>
          <input
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Bank / broker name"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Account number hint, purpose…"
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
          {account ? 'Update' : 'Add Account'}
        </button>
      </div>
    </form>
  );
}

function DeleteAccountDialog({
  account,
  others,
  onClose,
  onError,
}: {
  account: Account;
  others: Account[];
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const [contents, setContents] = useState<AccountContents | null>(null);
  const [moveTo, setMoveTo] = useState<number | undefined>(others[0]?.id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (account.id != null) {
      getAccountContents(account.id).then((c) => {
        if (!cancelled) setContents(c);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  // Empty account: a plain confirm is enough.
  useEffect(() => {
    if (!contents || account.id == null) return;
    if (contents.positions > 0 || contents.cashAccounts > 0) return;
    let cancelled = false;
    (async () => {
      const ok = await requestConfirm(`Delete account "${account.name}"?`);
      if (cancelled) return;
      if (ok) {
        try {
          await deleteAccount(account.id!);
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        }
      }
      onClose();
    })();
    return () => {
      cancelled = true;
    };
  }, [contents, account.id, account.name, onClose, onError]);

  if (!contents || (contents.positions === 0 && contents.cashAccounts === 0)) {
    return null;
  }

  async function handleMoveAndDelete() {
    if (account.id == null || moveTo == null) return;
    setBusy(true);
    try {
      await deleteAccount(account.id, moveTo);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const summary = [
    contents.positions > 0 &&
      `${contents.positions} position${contents.positions === 1 ? '' : 's'}`,
    contents.cashAccounts > 0 &&
      `${contents.cashAccounts} cash / deposit entr${contents.cashAccounts === 1 ? 'y' : 'ies'}`,
  ]
    .filter(Boolean)
    .join(' and ');

  return (
    <Modal open onClose={onClose} title={`Delete "${account.name}"`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700 dark:text-slate-300">
          This account still holds {summary}. Move everything to another
          account before deleting it, or cancel and remove the contents first.
        </p>
        {others.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            There is no other account to move them into. Create one first, or
            remove the holdings and cash from this account.
          </p>
        ) : (
          <div>
            <label className={labelClass}>Move contents to</label>
            <select
              value={moveTo ?? ''}
              onChange={(e) => setMoveTo(Number(e.target.value))}
              className={inputClass}
            >
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Positions in a ticker the target already holds are merged
              (shares added, average cost blended).
            </p>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={others.length === 0 || moveTo == null || busy}
            onClick={handleMoveAndDelete}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Move &amp; delete
          </button>
        </div>
      </div>
    </Modal>
  );
}
