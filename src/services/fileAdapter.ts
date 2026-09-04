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
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { join } = await import('@tauri-apps/api/path');
      // Pick a folder (not a single file) so Tauri grants recursive fs scope for
      // the directory. Writes use a sibling `.tmp` + rename; a save-dialog path
      // only scopes the one file, which breaks sync on paths like Google Drive.
      const dir = await open({
        directory: true,
        recursive: true,
        multiple: false,
        title: 'Choose folder for sync file',
      });
      if (!dir || typeof dir !== 'string') return null;
      const path = await join(dir, SYNC_FILE_NAME);
      return { path };
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

/**
 * Read the sync file. Resolves `null` only when the file does not exist yet
 * (or cannot be parsed); any other failure — most importantly a scope /
 * permission error — is thrown. Callers treat `null` as "nothing to lose" and
 * proceed to overwrite, so an unreadable file must never be reported as absent.
 */
export async function readSyncFile(target: SyncFileTarget): Promise<BackupData | null> {
  let json: string;

  if (typeof target === 'string') {
    if (isTauri()) {
      const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
      if (!(await exists(target))) return null;
      try {
        json = await readTextFile(target);
      } catch (e) {
        throw new Error(
          `Could not read the sync file. If it lives outside your home folder, ` +
            `re-select the folder in Settings to grant access. (${e instanceof Error ? e.message : String(e)})`
        );
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
        // Tauri's writeTextFile is truncate-then-write under the hood — if the
        // process is killed mid-write the file is left truncated/corrupt. To
        // keep the previous good content on a hard kill, write to a sibling
        // `.tmp` file and then atomically rename it over the target. Same
        // filesystem guarantees rename is atomic on POSIX and on NTFS.
        const { writeTextFile, rename } = await import('@tauri-apps/plugin-fs');
        const tmpPath = `${target}.tmp`;
        await writeTextFile(tmpPath, json);
        await rename(tmpPath, target);
      } catch (e) {
        throw new Error('Failed to write sync file: ' + (e instanceof Error ? e.message : String(e)));
      }
    } else {
      throw new Error('File path only supported in Tauri');
    }
  } else {
    // The File System Access API buffers writes and only commits them when
    // close() resolves, so an interrupted PWA write is naturally atomic — the
    // file either reflects the new content or the previous content, never a
    // half-written mix.
    const writable = await (target as FileSystemFileHandle).createWritable();
    await writable.write(json);
    await writable.close();
  }
}

/**
 * Save a manual backup.
 *
 * Tauri: the webview has no download handler, so an `<a download>` click is a
 * silent no-op there. Use the native save dialog and write the file directly.
 * Web/PWA: trigger a browser download.
 *
 * Resolves to `true` if a file was written/downloaded, `false` if the user
 * cancelled the dialog.
 */
export async function exportBackup(
  data: BackupData,
  filename: string = SYNC_FILE_NAME
): Promise<boolean> {
  const json = JSON.stringify(data, null, 2);

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }],
      title: 'Export backup',
    });
    if (!path) return false;
    await writeTextFile(path, json);
    return true;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoke after the click has been dispatched; revoking synchronously can
  // cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
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
