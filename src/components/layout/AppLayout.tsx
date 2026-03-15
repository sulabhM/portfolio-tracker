import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-end px-6 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
