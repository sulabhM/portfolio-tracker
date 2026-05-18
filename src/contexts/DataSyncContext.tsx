import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { db } from '../db/database';
import { exportAllData, importAllData } from '../services/dataSync';
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
import {
  DataSyncContext,
  type ConflictChoice,
  type SyncStatus,
} from './dataSyncContextValue';

const SYNC_DEBOUNCE_MS = 800;

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

  const performSync = useCallback(async () => {
    const target = targetRef.current;
    if (!target) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const data = await exportAllData();
      await writeSyncFile(target, data);
      setLastSyncAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSyncError(msg);
      setSyncStatus('error');
      return;
    }
    setSyncStatus('idle');
  }, []);

  const requestSync = useCallback(async () => {
    await performSync();
  }, [performSync]);

  useEffect(() => {
    setDataSyncCallback(() => {
      clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        performSync();
      }, SYNC_DEBOUNCE_MS);
    });
    return () => {
      setDataSyncCallback(null);
      clearTimeout(debounceRef.current);
    };
  }, [performSync]);

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
        const [fileData, tickersCount] = await Promise.all([
          readSyncFile(target),
          db.tickers.count(),
        ]);
        const fileHasData =
          fileData &&
          ((fileData.tickers?.length ?? 0) > 0 ||
            (fileData.notes?.length ?? 0) > 0);
        const localHasData = tickersCount > 0;
        if (fileHasData && localHasData) setConflictPending(true);
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
