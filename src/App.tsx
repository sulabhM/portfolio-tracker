import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { Portfolio } from './pages/Portfolio';
import { Transactions } from './pages/Transactions';
import { Research } from './pages/Research';
import { Watchlist } from './pages/Watchlist';
import { Settings } from './pages/Settings';
import { Debug } from './pages/Debug';
import { useDividendSync } from './hooks/useDividendSync';
import { useBackfillHoldingCountries } from './hooks/useBackfillHoldingCountries';
import { ExtendedHoursProvider } from './contexts/ExtendedHoursContext';
import { RefreshTimerProvider } from './contexts/RefreshTimerContext';
import { DataSyncProvider } from './contexts/DataSyncContext';
import { ConfirmDialogProvider } from './contexts/ConfirmDialogProvider';
import { SyncConflictDialog } from './components/common/SyncConflictDialog';

export default function App() {
  useDividendSync();
  useBackfillHoldingCountries();
  const location = useLocation();

  return (
    <DataSyncProvider>
    <ConfirmDialogProvider>
    <SyncConflictDialog />
    <RefreshTimerProvider>
    <ExtendedHoursProvider>
      <AppLayout>
        <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/research" element={<Research />} />
            <Route path="/research/:noteId" element={<Research />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/debug" element={<Debug />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </AppLayout>
    </ExtendedHoursProvider>
    </RefreshTimerProvider>
    </ConfirmDialogProvider>
    </DataSyncProvider>
  );
}
