import { useRef } from 'react';
import { useDataSync } from '../contexts/DataSyncContext';
import { exportAllData, importAllData } from '../services/dataSync';
import { downloadBackup, parseBackupFile, isTauri } from '../services/fileAdapter';
import { cn } from '../utils/format';

export function Settings() {
  const {
    syncFilePath,
    syncStatus,
    lastSyncAt,
    syncError,
    setSyncFile,
    clearSyncFile,
    requestSync,
    hasSyncFile,
  } = useDataSync();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    const data = await exportAllData();
    downloadBackup(data);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm('Import will replace all current data. Continue?')) return;
    try {
      const data = await parseBackupFile(file);
      await importAllData(data);
      if (hasSyncFile) await requestSync();
    } catch (err) {
      window.alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleChooseFile = async () => {
    await setSyncFile();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Settings
      </h1>

      <section className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6 max-w-2xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Data &amp; Sync
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
          Sync your data to a file (e.g. in a Google Drive folder) so you can use the same file across devices.
          {isTauri() && ' On desktop, choose a path; the file will auto-save after changes.'}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Sync file
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'flex-1 min-w-0 truncate text-sm py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400'
                )}
                title={syncFilePath ?? undefined}
              >
                {syncFilePath ?? 'Not configured'}
              </span>
              <button
                type="button"
                onClick={handleChooseFile}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {hasSyncFile ? 'Change file' : 'Choose file'}
              </button>
              {hasSyncFile && (
                <button
                  type="button"
                  onClick={clearSyncFile}
                  className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'text-xs font-medium px-2 py-1 rounded',
                syncStatus === 'syncing' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
                syncStatus === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
                syncStatus === 'idle' && 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
              )}
            >
              {syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Error' : 'Idle'}
            </span>
            {lastSyncAt != null && syncStatus === 'idle' && (
              <span className="text-xs text-gray-500 dark:text-slate-500">
                Last synced: {new Date(lastSyncAt).toLocaleString()}
              </span>
            )}
            {hasSyncFile && syncStatus === 'idle' && (
              <button
                type="button"
                onClick={requestSync}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Sync now
              </button>
            )}
          </div>
          {syncError && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {syncError}
            </p>
          )}

          <hr className="border-gray-200 dark:border-slate-700" />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              Manual backup
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Export backup
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Import backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
              Export downloads a JSON file. Import replaces all data with the selected file.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
