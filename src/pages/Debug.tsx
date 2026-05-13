export function Debug() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Debug
      </h1>
      <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
        Yahoo Finance and related fetch diagnostics are written to the browser
        developer console when the app runs in development mode (
        <code className="text-xs bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded">
          import.meta.env.DEV
        </code>
        ). Open DevTools → Console to inspect messages tagged{' '}
        <code className="text-xs bg-gray-100 dark:bg-slate-800 px-1 py-0.5 rounded">
          [Yahoo]
        </code>
        .
      </p>
    </div>
  );
}
