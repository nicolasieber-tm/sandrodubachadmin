'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ---- Typen ---- */
interface ToastContextValue {
  toast: (message: string) => void;
}

/* ---- Context ---- */
const ToastContext = createContext<ToastContextValue | null>(null);

/* ---- Provider ---- */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast-Element */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '26px',
          left: '50%',
          transform: visible
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(20px)',
          background: 'var(--ink)',
          color: '#fff',
          padding: '11px 18px',
          borderRadius: '11px',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: 'var(--sh-lg)',
          zIndex: 120,
          opacity: visible ? 1 : 0,
          pointerEvents: 'none',
          transition: 'all 0.3s var(--ease-out)',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
        }}
      >
        {/* Häkchen-Icon */}
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="#7be0a4"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>{message}</span>
      </div>
    </ToastContext.Provider>
  );
}

/* ---- Hook ---- */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast muss innerhalb von <ToastProvider> verwendet werden.');
  }
  return ctx;
}
