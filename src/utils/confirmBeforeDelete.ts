/**
 * Single-step delete: one click opens a confirmation dialog; the callback runs only if the user accepts.
 */
export async function confirmBeforeDelete(
  message: string,
  performDelete: () => void | Promise<void>
): Promise<void> {
  if (!window.confirm(message)) return;
  await performDelete();
}
