import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Landing from './Landing';
import Splash from './Splash';

const LANDING_SEEN_KEY = 'sync_landing_seen';

/**
 * 앱 진입 시퀀스:
 * - 비로그인 + 처음 접속(이 브라우저에서 랜딩을 본 적 없음) → 랜딩 화면 → (클릭 시) 기존 스플래시 애니메이션
 * - 그 외(로그인 상태이거나, 이미 랜딩을 본 적 있음) → 기존 스플래시 애니메이션만
 *
 * 로그인 여부 확인이 끝나기 전(loading)에는 랜딩을 잘못 보여줬다 지우는 깜빡임을 막기 위해
 * 아무것도 렌더링하지 않는다 — 로그인 확인은 보통 API 호출 한 번으로 매우 빠르게 끝난다.
 */
export default function IntroGate() {
  const { isLoggedIn, loading } = useAuth();
  const [decided, setDecided] = useState(false);
  const [showLanding, setShowLanding] = useState(false);
  const [landingFading, setLandingFading] = useState(false);
  const [landingDone, setLandingDone] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (isLoggedIn) {
      setShowLanding(false);
    } else {
      let seen = false;
      try { seen = localStorage.getItem(LANDING_SEEN_KEY) === '1'; } catch { /* 시크릿 모드 등 */ }
      setShowLanding(!seen);
    }
    setDecided(true);
  }, [loading, isLoggedIn]);

  if (!decided) return null;

  // 랜딩이 막 페이드를 "시작"하는 순간 — 이 시점부터 Splash를 뒤에 마운트해둔다.
  // 랜딩의 650ms 페이드가 끝나갈 때 뒤에 아무것도 없어 실제 웹사이트가 비치는 대신,
  // 이미 자리 잡고 있는 Splash가 비치도록.
  function handleLandingFadeStart() {
    setLandingFading(true);
  }

  function handleLandingDone() {
    try { localStorage.setItem(LANDING_SEEN_KEY, '1'); } catch { /* no-op */ }
    setLandingDone(true);
  }

  const showSplash = !showLanding || landingFading;

  return (
    <>
      {showLanding && !landingDone && <Landing onFadeStart={handleLandingFadeStart} onDone={handleLandingDone} />}
      {showSplash && <Splash />}
    </>
  );
}
