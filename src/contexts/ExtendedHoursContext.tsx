import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ExtendedHoursContextValue {
  extendedHours: boolean;
  toggleExtendedHours: () => void;
}

const ExtendedHoursContext = createContext<ExtendedHoursContextValue>({
  extendedHours: false,
  toggleExtendedHours: () => {},
});

export function ExtendedHoursProvider({ children }: { children: ReactNode }) {
  const [extendedHours, setExtendedHours] = useState(() => {
    try {
      return localStorage.getItem('extendedHours') === 'true';
    } catch {
      return false;
    }
  });

  const toggleExtendedHours = useCallback(() => {
    setExtendedHours((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('extendedHours', String(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <ExtendedHoursContext.Provider value={{ extendedHours, toggleExtendedHours }}>
      {children}
    </ExtendedHoursContext.Provider>
  );
}

export function useExtendedHours() {
  return useContext(ExtendedHoursContext);
}
