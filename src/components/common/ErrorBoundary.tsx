import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { debugLog } from '../../services/debugLog';

interface Props {
  children: ReactNode;
  /** Changing this resets the boundary — pass the route so navigation clears a crash. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Without this, any throw during render unmounts the entire React tree and
 * leaves a blank window. Scoped around the routed page so the sidebar and
 * header survive and the user can navigate away.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
    debugLog.warn('UI', `Render error: ${error.message}`, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-amber-500 mb-4">
          <AlertTriangle size={48} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Something went wrong on this page
        </h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">
          Your data is safe. Try another tab, or reload the app.
        </p>
        <p className="text-xs font-mono text-gray-400 dark:text-slate-500 mb-6 max-w-xl break-words">
          {error.message}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
