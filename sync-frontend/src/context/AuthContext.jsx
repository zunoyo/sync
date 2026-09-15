import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/api/users/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 앱 최초 로드 시 세션 동기화 (Google/Naver OAuth는 서버 리다이렉트로 완료되므로
  // 클라이언트가 새로 로드될 때 세션 상태를 반드시 다시 확인해야 함)
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const loggedIn = await api.post('/api/users/login', { email, password });
    setUser(loggedIn);
    // 로그인 직후 전체 페이지를 한 번 새로고침 — 로그인 전에 실패로 끝난 요청이나
    // 캐시된 빈 상태가 남아 있다가 로그인 후에도 안 갱신되는 문제를 원천 차단.
    // (이미 위에서 로그인 요청을 끝까지 기다린 뒤라 세션 쿠키는 확실히 저장된 상태)
    window.location.href = '/';
    return loggedIn;
  }, []);

  const signup = useCallback(async ({ username, email, password, displayName }) => {
    return api.post('/api/users/signup', { username, email, password, displayName });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/users/logout');
    } finally {
      setUser(null);
      window.location.href = '/';
    }
  }, []);

  const value = {
    user,
    loading,
    isLoggedIn: !!user,
    login,
    signup,
    logout,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
