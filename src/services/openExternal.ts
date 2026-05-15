import { isTauri } from './fileAdapter';

/** Open a URL in the system default browser (Tauri) or a new tab (web). */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(trimmed);
    return;
  }

  window.open(trimmed, '_blank', 'noopener,noreferrer');
}
