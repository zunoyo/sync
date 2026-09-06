import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchFriendRequests } from '../api/friends';

const FriendsContext = createContext(null);

export function FriendsProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const [requestCount, setRequestCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!isLoggedIn) { setRequestCount(0); return; }
    try {
      const list = await fetchFriendRequests();
      setRequestCount(Array.isArray(list) ? list.length : 0);
    } catch {
      setRequestCount(0);
    }
  }, [isLoggedIn]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  return (
    <FriendsContext.Provider value={{ requestCount, refreshCount }}>
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error('useFriends는 FriendsProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
