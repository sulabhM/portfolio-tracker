import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  Eye,
  BookOpen,
  Settings,
} from 'lucide-react';
import { cn } from '../../utils/format';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Briefcase, label: 'Portfolio' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/watchlist', icon: Eye, label: 'Watchlist' },
  { to: '/research', icon: BookOpen, label: 'Research' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 h-full">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="w-7 h-7" />
            Portfolio
          </h1>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800/60'
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 z-50">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-500 dark:text-slate-500'
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
