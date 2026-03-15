import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { Portfolio } from './pages/Portfolio';
import { Transactions } from './pages/Transactions';
import { Research } from './pages/Research';
import { Watchlist } from './pages/Watchlist';
import { Settings } from './pages/Settings';
import { useDividendSync } from './hooks/useDividendSync';
import { useBackfillHoldingCountries } from './hooks/useBackfillHoldingCountries';
import { ExtendedHoursProvider } from './contexts/ExtendedHoursContext';
import { RefreshTimerProvider } from './contexts/RefreshTimerContext';
import { DataSyncProvider } from './contexts/DataSyncContext';
import { SyncConflictDialog } from './components/common/SyncConflictDialog';

export default function App() {
  useDividendSync();
  useBackfillHoldingCountries();

  return (
    <DataSyncProvider>
    <SyncConflictDialog />
    <RefreshTimerProvider>
    <ExtendedHoursProvider>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/research" element={<Research />} />
          <Route path="/research/:noteId" element={<Research />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </ExtendedHoursProvider>
    </RefreshTimerProvider>
    </DataSyncProvider>
  );
}
