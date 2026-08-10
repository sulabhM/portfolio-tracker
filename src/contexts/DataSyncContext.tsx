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
  /** Bumped when `targetRef` gains a value asynchronously, to re-run effects. */
  const [targetVersion, setTargetVersion] = useState(0);
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
  /**
   * Outbound writes are gated until we know the file isn't holding data we'd
   * destroy. `checking` covers the window between startup and the conflict
   * check resolving; `blocked` means a conflict exists and the user hasn't
   * chosen a side yet. Without this, a debounced sync triggered by an early
   * edit could overwrite a newer file before the dialog even appears.
   */
  const syncGateRef = useRef<'checking' | 'blocked' | 'open'>(
    getStoredSyncPath() ? 'checking' : 'open'
  );

  const performSync = useCallback(async (): Promise<void> => {
    if (inFlightSyncRef.current) return inFlightSyncRef.current;
    const target = targetRef.current;
    if (!target) return;
    if (syncGateRef.current !== 'open') return;

    // Whatever was pending is being captured by this run. If a new mutation
    // arrives during the export/write, `notifyDataChanged` re-sets the flag
    // and re-arms the debounce, so the next sync will pick that up.
    pendingSyncRef.current = false;
    setSyncStatus('syncing');
    setSyncError(null);

    let succeeded = false;
    const run = (async () => {
      try {
        const data = await exportAllData();
        await writeSyncFile(target, data);
        setLastSyncAt(Date.now());
        setSyncStatus('idle');
        succeeded = true;
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

    // An edit that landed while this run was writing set the flag again, but
    // its debounce had already fired and coalesced into this run — so nothing
    // would ever pick it up. Re-arm here. Only after a successful write, or a
    // failing write would retry in a tight loop.
    if (succeeded && pendingSyncRef.current && !debounceRef.current) {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = 0;
        void performSync();
      }, SYNC_DEBOUNCE_MS);
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
      // The handle arrives after first render, so the conflict-check effect
      // has already bailed on a null target. Bump this to re-run it — without
      // it the PWA never runs a conflict check at all.
      setTargetVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Allow outbound writes again, flushing anything that queued while gated. */
  const openSyncGate = useCallback(() => {
    syncGateRef.current = 'open';
    if (pendingSyncRef.current) void performSync();
  }, [performSync]);

  /**
   * Dismissing does NOT resume syncing. The conflict is still unresolved, so
   * the next edit would otherwise overwrite a file we already know may be
   * newer. The gate stays closed until the user picks a side.
   */
  const dismissConflict = useCallback(() => {
    setConflictPending(false);
    setSyncError('Sync paused: the sync file has changes you have not resolved.');
    setSyncStatus('error');
  }, []);

  const resolveConflict = useCallback(
    async (choice: ConflictChoice) => {
      const target = targetRef.current;
      if (!target) {
        setConflictPending(false);
        openSyncGate();
        return;
      }
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        if (choice === 'file') {
          const data = await readSyncFile(target);
          // A null read means we could not load the file at all. Reporting
          // success here would leave the user believing their file data was
          // restored while the stale local DB silently stayed in place.
          if (!data) {
            throw new Error('Could not read the sync file.');
          }
          await importAllData(data);
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
      openSyncGate();
    },
    [openSyncGate]
  );

  const runConflictCheck = useCallback(async () => {
    const target = targetRef.current;
    if (!target) return;
    syncGateRef.current = 'checking';
    try {
      const [fileData, localVersion] = await Promise.all([
        readSyncFile(target),
        getDataVersion(),
      ]);
      if (!fileData) {
        openSyncGate();
        return;
      }

      // If the file is empty there is nothing to lose — the next debounced
      // sync will overwrite it with the local DB, so we don't prompt.
      const fileHasContent =
        (fileData.tickers?.length ?? 0) > 0 ||
        (fileData.notes?.length ?? 0) > 0 ||
        (fileData.transactions?.length ?? 0) > 0 ||
        (fileData.cashAccounts?.length ?? 0) > 0 ||
        (fileData.dividendRecords?.length ?? 0) > 0;
      if (!fileHasContent) {
        openSyncGate();
        return;
      }

      // Files written before the versioning system are treated as
      // counter 0 so any locally-edited DB is unambiguously newer.
      const fileVersion: BackupDataVersion = fileData.dataVersion ?? {
        counter: 0,
        updatedAt: new Date(0).toISOString(),
      };

      // `localVersion === null` means this DB has never recorded an edit — a
      // fresh install or cleared IndexedDB. Its counter of 0 would compare
      // "same" against a legacy file that has no version either, and we would
      // then overwrite real data with an empty database. Always ask.
      const relation = compareDataVersions(localVersion, fileVersion);
      if (
        localVersion === null ||
        relation === 'file-newer' ||
        relation === 'diverged'
      ) {
        syncGateRef.current = 'blocked';
        setConflictPending(true);
        return;
      }
      openSyncGate();
    } catch (e) {
      // We could not inspect the file, so we must not overwrite it.
      syncGateRef.current = 'blocked';
      setSyncError(
        `Sync paused: could not read the sync file (${
          e instanceof Error ? e.message : String(e)
        }).`
      );
      setSyncStatus('error');
    }
  }, [openSyncGate]);

  useEffect(() => {
    if (!syncFilePath || conflictCheckedRef.current) return;
    if (!targetRef.current) return;
    conflictCheckedRef.current = true;
    void runConflictCheck();
  }, [syncFilePath, targetVersion, runConflictCheck]);

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
    // The chosen file may already hold another device's data, so inspect it
    // before writing rather than overwriting on selection.
    conflictCheckedRef.current = true;
    await runConflictCheck();
    if (syncGateRef.current === 'open') await performSync();
  }, [performSync, runConflictCheck]);

  const clearSyncFile = useCallback(async () => {
    setStoredSyncPath(null);
    await setStoredSyncHandle(null);
    setSyncFilePathState(null);
    setSyncHandleState(null);
    targetRef.current = null;
    setSyncError(null);
    setSyncStatus('idle');
    setConflictPending(false);
    // A different file must be checked afresh.
    conflictCheckedRef.current = false;
    syncGateRef.current = 'open';
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
