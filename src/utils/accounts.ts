import type { Account, AccountType } from '../types';

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  brokerage: 'Brokerage',
  bank: 'Bank',
  retirement: 'Retirement',
  other: 'Other',
};

export function accountLabel(account: Account): string {
  return account.institution
    ? `${account.name} · ${account.institution}`
    : account.name;
}
