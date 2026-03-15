import type { BackupData } from './dataSync';

const SYNC_FILE_NAME = 'portfolio-tracker-data.json';

export type SyncFileTarget = string | FileSystemFileHandle;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/** Result of picking a sync file: path for display, and either a path (Tauri) or handle (PWA). */
export interface PickedSyncFile {
  path: string;
  handle?: FileSystemFileHandle;
}

/**
 * Open a save dialog to choose where to store the sync file.
 * Tauri: returns filesystem path.
 * PWA: uses File System Access API, returns handle (stored by caller) and display name.
 */
export async function pickSyncFile(): Promise<PickedSyncFile | null> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({
        defaultPath: SYNC_FILE_NAME,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      return path ? { path } : null;
    } catch {
      return null;
    }
  }

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    const handle = await (window as Window & { showSaveFilePicker: (options?: { suggestedName?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
      suggestedName: SYNC_FILE_NAME,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    return { path: handle.name, handle };
  }

  return null;
}

/**
 * Open a file dialog to choose an existing file (e.g. for "Choose sync file" when file exists).
 * Tauri: returns path.
 * PWA: returns handle.
 */
export async function pickOpenSyncFile(): Promise<PickedSyncFile | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      return path && typeof path === 'string' ? { path } : null;
    } catch {
      return null;
    }
  }

  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
    const [handle] = await (window as Window & { showOpenFilePicker: (options?: { types?: Array<{ description?: string; accept: Record<string, string[]> }>; multiple?: boolean }) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
    return { path: handle.name, handle };
  }

  return null;
}

export async function readSyncFile(target: SyncFileTarget): Promise<BackupData | null> {
  let json: string;

  if (typeof target === 'string') {
    if (isTauri()) {
      try {
        const { readTextFile } = await import('@tauri-apps/plugin-fs');
        json = await readTextFile(target);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  } else {
    const file = await target.getFile();
    json = await file.text();
  }

  try {
    return JSON.parse(json) as BackupData;
  } catch {
    return null;
  }
}

export async function writeSyncFile(target: SyncFileTarget, data: BackupData): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  if (typeof target === 'string') {
    if (isTauri()) {
      try {
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(target, json);
      } catch (e) {
        throw new Error('Failed to write sync file: ' + (e instanceof Error ? e.message : String(e)));
      }
    } else {
      throw new Error('File path only supported in Tauri');
    }
  } else {
    const writable = await (target as FileSystemFileHandle).createWritable();
    await writable.write(json);
    await writable.close();
  }
}

/** Fallback for PWA when File System Access API is not available: trigger download of JSON. */
export function downloadBackup(data: BackupData, filename: string = SYNC_FILE_NAME): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse an uploaded File into BackupData. Used with <input type="file" /> for import. */
export async function parseBackupFile(file: File): Promise<BackupData> {
  const text = await file.text();
  const data = JSON.parse(text) as BackupData;
  if (typeof data.version !== 'number' || !data.exportedAt) {
    throw new Error('Invalid backup file format');
  }
  return data;
}
