/** Set by `ConfirmDialogProvider`; used instead of `window.confirm` (broken in some WebViews). */
export interface ConfirmOptions {
  /** Label for the affirmative button. Defaults to "Delete". */
  confirmLabel?: string;
}

export type ConfirmDialogFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

let confirmImpl: ConfirmDialogFn | null = null;

export function setConfirmDialogImpl(fn: ConfirmDialogFn | null) {
  confirmImpl = fn;
}

export async function requestConfirm(
  message: string,
  options?: ConfirmOptions
): Promise<boolean> {
  if (confirmImpl) {
    return confirmImpl(message, options);
  }
  return window.confirm(message);
}
