import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Landing from './Landing';
import Splash from './Splash';

/**
 * 앱 진입 시퀀스:
 * - 비로그인 → (방문 기록과 상관없이 항상) 랜딩 화면 → (클릭 시) 기존 스플래시 애니메이션
 * - 로그인 상태 → 기존 스플래시 애니메이션만
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
    // 로그인 전에는 방문 기록과 상관없이 항상 랜딩을 보여준다.
    setShowLanding(!isLoggedIn);
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
