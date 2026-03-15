const STORAGE_KEY_PATH = 'portfolio-tracker-sync-path';
const IDB_NAME = 'PortfolioTrackerSync';
const IDB_STORE = 'handle';

export function getStoredSyncPath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_PATH);
}

export function setStoredSyncPath(path: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (path == null) localStorage.removeItem(STORAGE_KEY_PATH);
  else localStorage.setItem(STORAGE_KEY_PATH, path);
}

function openSyncDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') reject(new Error('IndexedDB not available'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
  });
}

/** Get stored PWA FileSystemFileHandle (Chrome). Returns null if not supported or not set. */
export function getStoredSyncHandle(): Promise<FileSystemFileHandle | null> {
  return openSyncDB()
    .then((db) => {
      return new Promise<FileSystemFileHandle | null>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const getReq = tx.objectStore(IDB_STORE).get('file');
        getReq.onsuccess = () => resolve(getReq.result ?? null);
        tx.oncomplete = () => db.close();
      });
    })
    .catch(() => null);
}

/** Store PWA FileSystemFileHandle. */
export function setStoredSyncHandle(handle: FileSystemFileHandle | null): Promise<void> {
  return openSyncDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (handle == null) store.delete('file');
      else store.put(handle, 'file');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
}
