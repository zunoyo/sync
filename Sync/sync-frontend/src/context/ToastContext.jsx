import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef(null);

  const showToast = useCallback((msg, duration = 2000) => {
    setMessage(msg);
    setVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setVisible(false), duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={`sw-toast ${visible ? 'show' : ''}`}>{message}</div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast는 ToastProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
