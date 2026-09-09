import { Link } from 'react-router-dom';
import type { Account } from '../../types';
import { accountLabel } from '../../utils/accounts';

interface AccountSelectProps {
  /** `undefined` while accounts are still loading. */
  accounts: readonly Account[] | undefined;
  value: number | undefined;
  onChange: (accountId: number) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  /** Extra leading option, e.g. "All accounts". Selecting it calls `onAllSelected`. */
  allLabel?: string;
  onAllSelected?: () => void;
  isAll?: boolean;
}

/**
 * Dropdown of the user's accounts. Renders a hint linking to Settings when no
 * accounts exist so forms can't silently save into nothing.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  className,
  disabled,
  required,
  allLabel,
  onAllSelected,
  isAll,
}: AccountSelectProps) {
  if (accounts === undefined) {
    return (
      <select className={className} disabled>
        <option>Loading…</option>
      </select>
    );
  }
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        No accounts yet.{' '}
        <Link to="/settings" className="underline">
          Create one in Settings
        </Link>
        .
      </p>
    );
  }
  return (
    <select
      value={isAll ? '__all' : value ?? ''}
      onChange={(e) => {
        if (e.target.value === '__all') {
          onAllSelected?.();
          return;
        }
        onChange(Number(e.target.value));
      }}
      className={className}
      disabled={disabled}
      required={required}
    >
      {allLabel && <option value="__all">{allLabel}</option>}
      {!allLabel && value == null && <option value="">Select an account…</option>}
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {accountLabel(a)}
        </option>
      ))}
    </select>
  );
}
