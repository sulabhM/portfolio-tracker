/**
 * Ambient declaration for @tauri-apps/plugin-http (used only in Tauri builds).
 * Ensures TypeScript can resolve the module when building; the real package is in dependencies.
 */
declare module '@tauri-apps/plugin-http' {
  export const fetch: typeof globalThis.fetch;
}
