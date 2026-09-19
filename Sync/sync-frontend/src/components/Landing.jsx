import { useEffect, useRef, useState } from 'react';

/**
 * 커서 반응형 랜딩 화면.
 * 표시 여부는 부모(IntroGate)가 전적으로 결정한다 — 이 컴포넌트는 마운트되면 항상 보여준다.
 * 로고를 클릭하면 페이드아웃 시작 — onFadeStart()를 즉시 호출해 부모가 그 순간부터
 * 다음 애니메이션(Splash)을 뒤에서 미리 켜두게 하고(그래야 이 컴포넌트가 서서히
 * 투명해지는 동안 뒤에 실제 웹사이트가 아니라 Splash가 비친다), 페이드가 실제로 끝나는
 * 시점(650ms 후)에 onDone()을 호출해 이 컴포넌트 자체를 걷어내게 한다.
 */
export default function Landing({ onFadeStart, onDone }) {
  const [revealed, setRevealed] = useState(false);
  const [fading, setFading] = useState(false);

  const rootRef = useRef(null);
  const cursorRef = useRef(null);
  const sizeRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    let moved = false;

    function reveal() {
      if (moved) return;
      moved = true;
      targetRef.current = 340;
      setRevealed(true);
    }

    function onMove(cx, cy) {
      reveal();
      root.style.setProperty('--mx', cx + 'px');
      root.style.setProperty('--my', cy + 'px');
      if (cursorRef.current) {
        cursorRef.current.style.left = cx + 'px';
        cursorRef.current.style.top = cy + 'px';
      }
    }

    const onMouseMove = (e) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e) => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const onMouseDown = () => { if (moved) targetRef.current = 480; };
    const onMouseUp = () => { if (moved) targetRef.current = 340; };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    function raf() {
      sizeRef.current += (targetRef.current - sizeRef.current) * 0.12;
      root.style.setProperty('--fl', sizeRef.current + 'px');
      rafRef.current = requestAnimationFrame(raf);
    }
    rafRef.current = requestAnimationFrame(raf);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function enter() {
    setFading(true);
    onFadeStart?.();
    setTimeout(() => onDone?.(), 650);
  }

  return (
    <div
      ref={rootRef}
      className={'landing-root' + (fading ? ' landing-fading' : '')}
      style={{ '--mx': '50%', '--my': '50%', '--fl': '0px' }}
    >
      {/* 커스텀 커서 */}
      <div ref={cursorRef} className="landing-cursor" />

      {/* 플래시라이트 마스크 */}
      <div className="landing-flashlight">
        <div className={'landing-content' + (revealed ? ' is-revealed' : '')}>

          {/* 중앙 */}
          <div className="landing-center">
            <h1 className="landing-logo landing-logo--clickable" onClick={enter}>SYNC</h1>
          </div>

          {/* 링 장식 */}
          <div className="landing-rings" aria-hidden>
            <div className="landing-ring" style={{ width: '80%', paddingBottom: '80%' }} />
            <div className="landing-ring" style={{ width: '60%', paddingBottom: '60%', opacity: 0.4 }} />
            <div className="landing-ring" style={{ width: '40%', paddingBottom: '40%', opacity: 0.25 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
