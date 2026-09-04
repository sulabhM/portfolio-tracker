import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

const AUTO_INTERVAL = 5 * 60 * 1000;
const COOLDOWN = 30 * 1000;

interface RefreshTimerContextValue {
  loading: boolean;
  onCooldown: boolean;
  cooldownRemaining: number;
  autoRemaining: number;
  manualRefresh: () => void;
  registerRefresh: (id: string, fn: () => Promise<void>) => void;
  unregisterRefresh: (id: string) => void;
}

const RefreshTimerContext = createContext<RefreshTimerContextValue>({
  loading: false,
  onCooldown: false,
  cooldownRemaining: 0,
  autoRemaining: 0,
  manualRefresh: () => {},
  registerRefresh: () => {},
  unregisterRefresh: () => {},
});

export function RefreshTimerProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState(0);
  const [nextAutoAt, setNextAutoAt] = useState(Date.now() + AUTO_INTERVAL);
  const [now, setNow] = useState(Date.now());

  const autoRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const callbacksRef = useRef(new Map<string, () => Promise<void>>());
  const loadingRef = useRef(false);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const doRefresh = useCallback(async () => {
    const fns = [...callbacksRef.current.values()];
    if (fns.length === 0) return;
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    try {
      // One page's refresh failing (e.g. Yahoo 429) must not abort the others
      // or bubble out of the timer callback.
      const results = await Promise.allSettled(fns.map((fn) => fn()));
      for (const r of results) {
        if (r.status === 'rejected') console.warn('Refresh callback failed:', r.reason);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      const t = Date.now();
      lastRefreshRef.current = t;
      setLastRefreshAt(t);
      setNextAutoAt(t + AUTO_INTERVAL);
    }
  }, []);

  useEffect(() => {
    autoRef.current = setInterval(doRefresh, AUTO_INTERVAL);
    return () => clearInterval(autoRef.current);
  }, [doRefresh]);

  const manualRefresh = useCallback(async () => {
    if (loadingRef.current) return;
    if (Date.now() - lastRefreshRef.current < COOLDOWN) return;
    clearInterval(autoRef.current);
    try {
      await doRefresh();
    } finally {
      // Always re-arm: an exception here used to leave auto-refresh disabled
      // for the rest of the session.
      autoRef.current = setInterval(doRefresh, AUTO_INTERVAL);
    }
  }, [doRefresh]);

  const registerRefresh = useCallback(
    (id: string, fn: () => Promise<void>) => {
      callbacksRef.current.set(id, fn);
    },
    []
  );

  const unregisterRefresh = useCallback((id: string) => {
    callbacksRef.current.delete(id);
  }, []);

  const cooldownRemaining = Math.max(
    0,
    Math.ceil((COOLDOWN - (now - lastRefreshAt)) / 1000)
  );
  const autoRemaining = Math.max(
    0,
    Math.ceil((nextAutoAt - now) / 1000)
  );
  const onCooldown = cooldownRemaining > 0 && !loading;

  return (
    <RefreshTimerContext.Provider
      value={{
        loading,
        onCooldown,
        cooldownRemaining,
        autoRemaining,
        manualRefresh,
        registerRefresh,
        unregisterRefresh,
      }}
    >
      {children}
    </RefreshTimerContext.Provider>
  );
}

// This module intentionally colocates the provider and hooks for the refresh context.
// eslint-disable-next-line react-refresh/only-export-components
export function useRefreshTimer() {
  return useContext(RefreshTimerContext);
}

/**
 * Register a refresh callback that fires on every manual/auto refresh.
 * Callbacks are keyed by `id` so each page/component gets one slot.
 * The latest `fn` is always used (via ref) so deps don't matter.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useRegisterRefresh(id: string, fn: () => Promise<void>) {
  const { registerRefresh, unregisterRefresh } = useRefreshTimer();
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    registerRefresh(id, () => fnRef.current());
    return () => unregisterRefresh(id);
  }, [id, registerRefresh, unregisterRefresh]);
}
