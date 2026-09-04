import { isTauri } from './fileAdapter';

/**
 * Returns the URL if it is an absolute http(s) URL, otherwise null. Links we
 * open come from third-party data (Yahoo news items, company profiles), so
 * anything else — `javascript:`, `file:`, custom schemes — is refused.
 */
export function toSafeHttpUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** Open a URL in the system default browser (Tauri) or a new tab (web). */
export async function openExternalUrl(url: string): Promise<void> {
  const safe = toSafeHttpUrl(url);
  if (!safe) return;

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(safe);
    return;
  }

  window.open(safe, '_blank', 'noopener,noreferrer');
}
