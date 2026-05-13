/** Set by `ConfirmDialogProvider`; used by `confirmBeforeDelete` instead of `window.confirm` (broken in some WebViews). */
export type ConfirmDialogFn = (message: string) => Promise<boolean>;

let confirmImpl: ConfirmDialogFn | null = null;

export function setConfirmDialogImpl(fn: ConfirmDialogFn | null) {
  confirmImpl = fn;
}

export async function requestConfirm(message: string): Promise<boolean> {
  if (confirmImpl) {
    return confirmImpl(message);
  }
  return window.confirm(message);
}
