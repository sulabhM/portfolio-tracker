import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import {
  exportAllData,
  importAllData,
  compareDataVersions,
  type BackupDataVersion,
} from '../services/dataSync';
import {
  isTauri,
  readSyncFile,
  writeSyncFile,
  pickSyncFile,
  type SyncFileTarget,
} from '../services/fileAdapter';
import {
  getStoredSyncPath,
  setStoredSyncPath,
  getStoredSyncHandle,
  setStoredSyncHandle,
} from '../services/syncFileStore';
import { setDataSyncCallback } from '../services/dataSyncRegistry';
import { getDataVersion } from '../db/hooks';
import {
  DataSyncContext,
  type ConflictChoice,
  type SyncStatus,
} from './dataSyncContextValue';

const SYNC_DEBOUNCE_MS = 200;

export function DataSyncProvider({ children }: { children: ReactNode }) {
  const [syncFilePath, setSyncFilePathState] = useState<string | null>(
    () => getStoredSyncPath()
  );
  const [, setSyncHandleState] = useState<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const debounceRef = useRef<number>(0);
  const targetRef = useRef<SyncFileTarget | null>(
    isTauri() ? getStoredSyncPath() : null
  );
  const conflictCheckedRef = useRef(false);
  /**
   * `pendingSyncRef` is true between the moment a CRUD helper calls
   * `notifyDataChanged()` and the moment the resulting sync writes the file
   * successfully. The close-time flushers (Tauri `onCloseRequested`, browser
   * `visibilitychange`/`pagehide`) use it to decide whether anything is owed
   * to the file before the app goes away.
   */
  const pendingSyncRef = useRef(false);
  /**
   * Holds the currently-running `performSync` promise so concurrent callers
   * (debounce-triggered, manual, or close-time) coalesce onto the same write
   * instead of racing — important because both Tauri's `writeTextFile`+rename
   * and the PWA `FileSystemFileHandle` writable serialize at the OS level and
   * would otherwise produce undefined results when overlapped.
   */
  const inFlightSyncRef = useRef<Promise<void> | null>(null);

  const performSync = useCallback(async (): Promise<void> => {
    if (inFlightSyncRef.current) return inFlightSyncRef.current;
    const target = targetRef.current;
    if (!target) return;

    // Whatever was pending is being captured by this run. If a new mutation
    // arrives during the export/write, `notifyDataChanged` re-sets the flag
    // and re-arms the debounce, so the next sync will pick that up.
    pendingSyncRef.current = false;
    setSyncStatus('syncing');
    setSyncError(null);

    const run = (async () => {
      try {
        const data = await exportAllData();
        await writeSyncFile(target, data);
        setLastSyncAt(Date.now());
        setSyncStatus('idle');
      } catch (e) {
        // The write didn't land — keep the pending flag so the next flush
        // (debounce tick or close-time hook) tries again.
        pendingSyncRef.current = true;
        const msg = e instanceof Error ? e.message : String(e);
        setSyncError(msg);
        setSyncStatus('error');
      }
    })();
    inFlightSyncRef.current = run;
    try {
      await run;
    } finally {
      inFlightSyncRef.current = null;
    }
  }, []);

  const requestSync = useCallback(async () => {
    await performSync();
  }, [performSync]);

  /**
   * Wait for any in-flight sync to finish and, if anything is still pending
   * after that (e.g. an edit arrived while the in-flight sync was running),
   * run one more sync. Used by the close-time hooks to guarantee the file is
   * caught up before the window goes away.
   */
  const ensureFlushed = useCallback(async (): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = 0;
    }
    const inFlight = inFlightSyncRef.current;
    if (inFlight) {
      try { await inFlight; } catch { /* surfaced via syncError already */ }
    }
    if (pendingSyncRef.current) {
      try { await performSync(); } catch { /* surfaced via syncError already */ }
    }
  }, [performSync]);

  useEffect(() => {
    setDataSyncCallback(() => {
      pendingSyncRef.current = true;
      clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = 0;
        performSync();
      }, SYNC_DEBOUNCE_MS);
    });
    return () => {
      setDataSyncCallback(null);
      clearTimeout(debounceRef.current);
    };
  }, [performSync]);

  /**
   * Browser-side best-effort flush. `visibilitychange` to 'hidden' fires
   * reliably on tab close, OS-level backgrounding, and (on mobile) when the
   * app is swiped away; `pagehide` is the modern replacement for `unload`.
   * We cannot truly await async work inside these handlers, but for the PWA
   * path `FileSystemFileHandle.createWritable()` is journalled and atomic, so
   * a write started here is either committed in full or not at all — never a
   * half-written file. Tauri builds skip this and rely on the close-requested
   * handler below, which can prevent the close until the write resolves.
   */
  useEffect(() => {
    if (isTauri()) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const flush = () => {
      if (!pendingSyncRef.current && !inFlightSyncRef.current) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = 0;
      }
      void performSync();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [performSync]);

  /**
   * Tauri close-requested handler. Unlike the browser unload events we can
   * actually block the close until the file write completes.
   *
   * When nothing is owed to the file, we return without calling
   * `preventDefault()` and the `@tauri-apps/api/window` wrapper itself calls
   * `this.destroy()` to close the window (requires `core:window:allow-destroy`
   * in the capabilities config — without it, the close button silently does
   * nothing because the wrapper's destroy fails on missing permission).
   *
   * When something is pending or in flight, we prevent the default, await
   * `ensureFlushed`, then call `w.destroy()` ourselves to actually close.
   */
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const w = getCurrentWindow();
        const dispose = await w.onCloseRequested(async (event) => {
          if (!pendingSyncRef.current && !inFlightSyncRef.current) return;
          event.preventDefault();
          try {
            await ensureFlushed();
          } catch {
            // surfaced via syncError already; do not trap the user
          }
          try {
            await w.destroy();
          } catch {
            // last resort — if destroy fails the user can hit X again
          }
        });
        if (cancelled) dispose();
        else unlisten = dispose;
      } catch {
        // Best effort: if the window API isn't available the user just loses
        // the close-time guarantee, but the app still functions.
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [ensureFlushed]);

  useEffect(() => {
    if (isTauri()) return;
    let cancelled = false;
    getStoredSyncHandle().then((handle) => {
      if (!handle || cancelled) return;
      setSyncHandleState(handle);
      setSyncFilePathState(handle.name);
      targetRef.current = handle;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismissConflict = useCallback(() => setConflictPending(false), []);

  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      const target = targetRef.current;
      if (!target) {
        setConflictPending(false);
        return;
      }
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        if (choice === 'file') {
          const data = await readSyncFile(target);
          if (data) await importAllData(data);
        } else {
          const data = await exportAllData();
          await writeSyncFile(target, data);
        }
        setLastSyncAt(Date.now());
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : String(e));
        setSyncStatus('error');
        return;
      }
      setConflictPending(false);
      setSyncStatus('idle');
    },
    []
  );

  useEffect(() => {
    if (!syncFilePath || conflictCheckedRef.current) return;
    const target = targetRef.current;
    if (!target) return;
    conflictCheckedRef.current = true;
    const check = async () => {
      try {
        const [fileData, localVersion] = await Promise.all([
          readSyncFile(target),
          getDataVersion(),
        ]);
        if (!fileData) return;

        // If the file is empty there is nothing to lose — the next debounced
        // sync will overwrite it with the local DB, so we don't prompt.
        const fileHasContent =
          (fileData.tickers?.length ?? 0) > 0 ||
          (fileData.notes?.length ?? 0) > 0 ||
          (fileData.transactions?.length ?? 0) > 0 ||
          (fileData.cashAccounts?.length ?? 0) > 0 ||
          (fileData.dividendRecords?.length ?? 0) > 0;
        if (!fileHasContent) return;

        // Files written before the versioning system are treated as
        // counter 0 so any locally-edited DB is unambiguously newer.
        const fileVersion: BackupDataVersion = fileData.dataVersion ?? {
          counter: 0,
          updatedAt: new Date(0).toISOString(),
        };

        // Only prompt when the file may contain data we'd lose by syncing
        // the local DB out. If the local DB is at the same version, or
        // strictly newer, we silently keep the IndexedDB state and let the
        // next debounced sync flush it to the file.
        const relation = compareDataVersions(localVersion, fileVersion);
        if (relation === 'file-newer' || relation === 'diverged') {
          setConflictPending(true);
        }
      } catch {
        // ignore
      }
    };
    check();
  }, [syncFilePath]);

  const setSyncFile = useCallback(async () => {
    const picked = await pickSyncFile();
    if (!picked) return;
    if (picked.handle) {
      await setStoredSyncHandle(picked.handle);
      setSyncHandleState(picked.handle);
      targetRef.current = picked.handle;
      setStoredSyncPath(picked.path);
      setSyncFilePathState(picked.path);
    } else {
      setStoredSyncPath(picked.path);
      setSyncFilePathState(picked.path);
      targetRef.current = picked.path;
      setStoredSyncHandle(null);
      setSyncHandleState(null);
    }
    await performSync();
  }, [performSync]);

  const clearSyncFile = useCallback(async () => {
    setStoredSyncPath(null);
    await setStoredSyncHandle(null);
    setSyncFilePathState(null);
    setSyncHandleState(null);
    targetRef.current = null;
    setSyncError(null);
    setSyncStatus('idle');
  }, []);

  const hasSyncFile = !!syncFilePath;

  return (
    <DataSyncContext.Provider
      value={{
        syncFilePath,
        syncStatus,
        lastSyncAt,
        syncError,
        conflictPending,
        resolveConflict,
        dismissConflict,
        setSyncFile,
        clearSyncFile,
        requestSync,
        hasSyncFile,
      }}
    >
      {children}
    </DataSyncContext.Provider>
  );
}
