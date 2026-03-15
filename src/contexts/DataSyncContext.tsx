import {
  createContext,
  useContext,
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
  pickOpenSyncFile,
  type SyncFileTarget,
  type PickedSyncFile,
} from '../services/fileAdapter';
import {
  getStoredSyncPath,
  setStoredSyncPath,
  getStoredSyncHandle,
  setStoredSyncHandle,
} from '../services/syncFileStore';
import { setDataSyncCallback } from '../services/dataSyncRegistry';

const SYNC_DEBOUNCE_MS = 800;

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type ConflictChoice = 'file' | 'local';

interface DataSyncContextValue {
  syncFilePath: string | null;
  syncStatus: SyncStatus;
  lastSyncAt: number | null;
  syncError: string | null;
  conflictPending: boolean;
  resolveConflict: (choice: ConflictChoice) => Promise<void>;
  dismissConflict: () => void;
  setSyncFile: () => Promise<void>;
  clearSyncFile: () => Promise<void>;
  requestSync: () => Promise<void>;
  hasSyncFile: boolean;
}

const DataSyncContext = createContext<DataSyncContextValue>({
  syncFilePath: null,
  syncStatus: 'idle',
  lastSyncAt: null,
  syncError: null,
  conflictPending: false,
  resolveConflict: async () => {},
  dismissConflict: () => {},
  setSyncFile: async () => {},
  clearSyncFile: async () => {},
  requestSync: async () => {},
  hasSyncFile: false,
});

export function DataSyncProvider({ children }: { children: ReactNode }) {
  const [syncFilePath, setSyncFilePathState] = useState<string | null>(null);
  const [, setSyncHandleState] = useState<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictPending, setConflictPending] = useState(false);
  const debounceRef = useRef<number>(0);
  const targetRef = useRef<SyncFileTarget | null>(null);
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

  const loadStored = useCallback(async () => {
    const path = getStoredSyncPath();
    if (path) setSyncFilePathState(path);
    if (isTauri()) {
      targetRef.current = path;
    } else {
      const handle = await getStoredSyncHandle();
      if (handle) {
        setSyncHandleState(handle);
        setSyncFilePathState(handle.name);
        targetRef.current = handle;
      }
    }
  }, []);

  useEffect(() => {
    loadStored();
  }, [loadStored]);

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
        const [fileData, holdingsCount] = await Promise.all([
          readSyncFile(target),
          db.holdings.count(),
        ]);
        const fileHasData =
          fileData &&
          (fileData.holdings?.length > 0 ||
            fileData.watchlist?.length > 0 ||
            fileData.notes?.length > 0);
        const localHasData = holdingsCount > 0 || (await db.watchlist.count()) > 0;
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

export function useDataSync() {
  return useContext(DataSyncContext);
}

export { readSyncFile, pickOpenSyncFile, type PickedSyncFile, type SyncFileTarget };
