import { requestConfirm } from './confirmBridge';

/**
 * Single-step delete: asks for confirmation (in-app modal when available), then runs the callback only if accepted.
 */
export async function confirmBeforeDelete(
  message: string,
  performDelete: () => void | Promise<void>
): Promise<void> {
  if (!(await requestConfirm(message))) return;
  await performDelete();
}
