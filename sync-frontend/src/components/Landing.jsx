import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// 페이지 새로고침마다 초기화 — 매번 랜딩을 보여줌
let _hasEntered = false;

export default function Landing({ onDone }) {
  const navigate = useNavigate();

  const [show, setShow] = useState(() => !_hasEntered);
  const [revealed, setRevealed] = useState(false);
  const [fading, setFading] = useState(false);

  const rootRef = useRef(null);
  const cursorRef = useRef(null);
  const sizeRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef(null);

  // 이벤트/RAF 세팅 — show가 true일 때 딱 한 번만 실행
  useEffect(() => {
    if (!show) return;
    const root = rootRef.current;
    if (!root) return;

    let moved = false;

    function reveal() {
      if (moved) return;
      moved = true;
      targetRef.current = 260;
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
    const onMouseDown = () => { if (moved) targetRef.current = 380; };
    const onMouseUp   = () => { if (moved) targetRef.current = 260; };

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
  }, [show]); // show 외 의존성 없음 — revealed 변경 시 재실행 안 함

  function enter(path) {
    _hasEntered = true;
    setFading(true);
    setTimeout(() => {
      setShow(false);
      onDone?.();
      navigate(path);
    }, 650);
  }

  if (!show) return null;

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
            <h1 className="landing-logo landing-logo--clickable" onClick={() => enter('/')}>SYNC</h1>
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
