import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bug } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '../../utils/format';

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isDebug = location.pathname === '/debug';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-end gap-1 px-6 py-3 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <Link
            to="/debug"
            className={cn(
              'p-2 rounded-lg transition-colors',
              isDebug
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30'
                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800'
            )}
            aria-label="Debug log"
          >
            <Bug size={20} />
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>
    </div>
  );
}
