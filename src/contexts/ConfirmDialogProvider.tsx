import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/common/Modal';
import { setConfirmDialogImpl, type ConfirmOptions } from '../utils/confirmBridge';

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmLabel, setConfirmLabel] = useState('Delete');
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    setConfirmDialogImpl(
      (msg: string, options?: ConfirmOptions) =>
        new Promise<boolean>((resolve) => {
          // A second request while one is open would orphan the first
          // promise; settle it as "cancelled" instead of leaving it hanging.
          resolverRef.current?.(false);
          resolverRef.current = resolve;
          setMessage(msg);
          setConfirmLabel(options?.confirmLabel ?? 'Delete');
          setOpen(true);
        })
    );
    return () => {
      const pending = resolverRef.current;
      resolverRef.current = null;
      pending?.(false);
      setConfirmDialogImpl(null);
    };
  }, []);

  function finish(ok: boolean) {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    resolve?.(ok);
  }

  return (
    <>
      {children}
      <Modal open={open} onClose={() => finish(false)} title="Confirm">
        <p className="text-sm text-gray-600 dark:text-slate-400 whitespace-pre-wrap">
          {message}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => finish(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => finish(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </Modal>
    </>
  );
}
