import { createContext, useContext, useState } from 'react';

const GalaxyViewContext = createContext(null);

/** 홈 화면 "그리드 뷰 / 갤럭시 뷰" 전환 상태 — Topbar(토글 버튼)와 Home(실제 뷰 전환)이 공유 */
export function GalaxyViewProvider({ children }) {
  const [galaxyOpen, setGalaxyOpen] = useState(false);
  return (
    <GalaxyViewContext.Provider value={{ galaxyOpen, setGalaxyOpen }}>
      {children}
    </GalaxyViewContext.Provider>
  );
}

export function useGalaxyView() {
  return useContext(GalaxyViewContext);
}
