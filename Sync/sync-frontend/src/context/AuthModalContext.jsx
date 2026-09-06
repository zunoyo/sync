import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const AuthModalContext = createContext(null);

export function AuthModalProvider({ children }) {
  const { isLoggedIn, loading } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('login');
  const autoShownRef = useRef(false);

  const openAuthModal = useCallback((initialMode = 'login') => {
    setMode(initialMode);
    setOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => setOpen(false), []);

  // 원본처럼 첫 진입 시 로그인 상태가 아니면 로그인 모달을 자동으로 띄움
  // (스플래시가 화면을 덮고 있는 동안 열려도 스플래시가 사라지는 순간 자연스럽게 드러남)
  // /login, /signup 페이지로 직접 들어온 경우는 이미 같은 역할의 화면이라 자동 팝업을 건너뜀
  useEffect(() => {
    if (loading || autoShownRef.current) return;
    autoShownRef.current = true;
    const onAuthPage = location.pathname === '/login' || location.pathname === '/signup';
    if (!isLoggedIn && !onAuthPage) openAuthModal('login');
  }, [loading, isLoggedIn, location.pathname, openAuthModal]);

  return (
    <AuthModalContext.Provider value={{ open, mode, setMode, openAuthModal, closeAuthModal }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal은 AuthModalProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
