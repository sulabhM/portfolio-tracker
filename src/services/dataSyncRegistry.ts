/** Called by DB hooks after any mutation so DataSyncContext can auto-sync to file. */
let onDataChanged: (() => void) | null = null;

export function setDataSyncCallback(fn: (() => void) | null): void {
  onDataChanged = fn;
}

export function notifyDataChanged(): void {
  onDataChanged?.();
}
