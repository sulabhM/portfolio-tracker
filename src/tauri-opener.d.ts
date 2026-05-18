/**
 * Ambient declaration for @tauri-apps/plugin-opener (used only in Tauri builds).
 * Ensures TypeScript can resolve the module when building; the real package is in dependencies.
 */
declare module '@tauri-apps/plugin-opener' {
  export function openUrl(
    url: string | URL,
    openWith?: 'inAppBrowser' | string,
  ): Promise<void>;
}
