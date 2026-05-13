/**
 * Lightweight logger for Yahoo/fetch diagnostics. No-op in production builds
 * unless you change the guards below.
 */
function log(
  level: 'info' | 'warn',
  scope: string,
  message: string,
  ...rest: unknown[]
): void {
  if (!import.meta.env.DEV) return;
  const prefix = `[${scope}]`;
  if (level === 'info') console.info(prefix, message, ...rest);
  else console.warn(prefix, message, ...rest);
}

export const debugLog = {
  info(scope: string, message: string, ...rest: unknown[]) {
    log('info', scope, message, ...rest);
  },
  warn(scope: string, message: string, ...rest: unknown[]) {
    log('warn', scope, message, ...rest);
  },
};
