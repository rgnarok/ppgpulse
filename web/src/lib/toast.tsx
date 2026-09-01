import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface ToastItem {
  id: number;
  message: string;
  kind: 'ok' | 'err';
}

interface ToastContextValue {
  /** Show a transient toast confirming an action succeeded or failed.
   *  Auto-dismisses after ~3.2s. */
  showToast: (message: string, kind?: 'ok' | 'err') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const showToast = useCallback((message: string, kind: 'ok' | 'err' = 'ok') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`} role="status">
            <span className="tk">{t.kind === 'err' ? '!' : '✓'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Returns `showToast(message, kind?)` for confirming a save/action from a
 *  mutation's onSuccess/onError callback. Falls back to a no-op with a console
 *  warning if called outside <ToastProvider>, so a missing provider fails
 *  loudly in dev rather than crashing the page. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    console.warn('useToast() called outside <ToastProvider>');
    return { showToast: () => {} };
  }
  return ctx;
}
