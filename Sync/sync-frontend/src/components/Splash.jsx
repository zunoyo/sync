import { useEffect, useState } from 'react';

export default function Splash() {
  const [phase, setPhase] = useState('showing'); // showing -> fading -> hidden

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fading'), 2300);
    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== 'fading') return;
    // transitionend 폴백 — 0.75s 트랜지션이 실행되지 않는 환경 대비
    const t2 = setTimeout(() => setPhase('hidden'), 1000);
    return () => clearTimeout(t2);
  }, [phase]);

  if (phase === 'hidden') return null;

  return (
    <div id="splash-screen" className={phase === 'fading' ? 'fading' : ''} onTransitionEnd={() => setPhase('hidden')}>
      <div className="splash-icon">
        <svg viewBox="0 0 32 32" fill="#000" width="40" height="40">
          <path d="M12.5 10.5v11l9-5.5-9-5.5z" />
        </svg>
      </div>
      <div className="splash-title">SoundWave</div>
      <div className="splash-tagline">Music for everyone</div>
      <div className="splash-dots">
        <div className="splash-dot" />
        <div className="splash-dot" />
        <div className="splash-dot" />
      </div>
    </div>
  );
}
