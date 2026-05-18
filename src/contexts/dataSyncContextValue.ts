import { createContext, useContext } from 'react';

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type ConflictChoice = 'file' | 'local';

export interface DataSyncContextValue {
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

export const DataSyncContext = createContext<DataSyncContextValue>({
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

export function useDataSync() {
  return useContext(DataSyncContext);
}
