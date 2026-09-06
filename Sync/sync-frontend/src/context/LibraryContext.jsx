import { createContext, useCallback, useContext, useState } from 'react';

const LibraryContext = createContext(null);

export function LibraryProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <LibraryContext.Provider value={{ version, bump }}>
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary는 LibraryProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
