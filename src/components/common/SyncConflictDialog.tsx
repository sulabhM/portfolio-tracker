import { useDataSync } from '../../contexts/DataSyncContext';
import { Modal } from './Modal';

export function SyncConflictDialog() {
  const { conflictPending, resolveConflict, dismissConflict, syncFilePath } = useDataSync();

  if (!conflictPending) return null;

  return (
    <Modal
      open={conflictPending}
      onClose={dismissConflict}
      title="Data sync conflict"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-slate-400">
          Both your sync file and this app have data. Choose which to use:
        </p>
        {syncFilePath && (
          <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={syncFilePath}>
            Sync file: {syncFilePath}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            type="button"
            onClick={() => resolveConflict('file')}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Use data from file
          </button>
          <button
            type="button"
            onClick={() => resolveConflict('local')}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Use data from app
          </button>
          <button
            type="button"
            onClick={dismissConflict}
            className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-slate-500">
          &quot;Use data from file&quot; replaces this app&apos;s data with the file. &quot;Use data from app&quot; keeps
          the current app data and updates the file. Cancel closes without changing anything.
        </p>
      </div>
    </Modal>
  );
}
