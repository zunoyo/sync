import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';

function pwScore(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (pw.length >= 12) s++;
  return s;
}
const PW_COLORS = ['', '#f3727f', '#ffa42b', '#ffa42b', '#1ed760', '#1ed760'];
const PW_LABELS = ['', '매우 약함', '약함', '보통', '강함', '매우 강함'];

export default function AuthModal() {
  const { open, mode, setMode, closeAuthModal } = useAuthModal();
  const { login, signup } = useAuth();

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [suForm, setSuForm] = useState({ displayName: '', username: '', email: '', password: '', password2: '', agree: false });

  const overlayRef = useRef(null);

  if (!open) return null;

  function switchTab(tab) {
    setMode(tab);
    setError('');
    setSuccess('');
  }

  function handleClose() {
    closeAuthModal();
    setError('');
    setSuccess('');
    setShowSpotifyPrompt(false);
    setLoginForm({ email: '', password: '' });
    setSuForm({ displayName: '', username: '', email: '', password: '', password2: '', agree: false });
  }

  async function doLogin(email, password) {
    setError('');
    if (!email) { setError('이메일을 입력해주세요.'); return; }
    if (!password) { setError('비밀번호를 입력해주세요.'); return; }
    setBusy(true);
    try {
      await login(email, password);
      handleClose();
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setBusy(false);
    }
  }

  function handleLoginSubmit() {
    doLogin(loginForm.email.trim(), loginForm.password);
  }

  function quickDemo() {
    setLoginForm({ email: 'demo@soundwave.kr', password: 'demo1234' });
    doLogin('demo@soundwave.kr', 'demo1234');
  }

  async function handleSignupSubmit() {
    setError('');
    const { displayName, username, email, password, password2, agree } = suForm;
    if (!username || !/^[a-zA-Z0-9_]{2,20}$/.test(username)) { setError('사용자명: 영문, 숫자, _ 조합 2~20자'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('올바른 이메일 주소를 입력해주세요.'); return; }
    if (password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (password !== password2) { setError('비밀번호가 일치하지 않습니다.'); return; }
    if (!agree) { setError('이용약관에 동의해주세요.'); return; }

    setBusy(true);
    try {
      await signup({ username, email, password, displayName: displayName || username });
      await login(email, password);
      setSuccess('✅ 회원가입 완료!');
      setTimeout(() => setShowSpotifyPrompt(true), 400);
    } catch (e) {
      setError(e.status === 409 ? '이미 사용 중인 이메일 또는 사용자명입니다.' : '회원가입 중 오류가 발생했어요. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  const usernameOk = suForm.username ? /^[a-zA-Z0-9_]{2,20}$/.test(suForm.username) : null;
  const score = pwScore(suForm.password);
  const pw2Match = suForm.password2 ? suForm.password === suForm.password2 : null;

  return (
    <div
      id="auth-modal"
      className="auth-modal-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
    >
      <div className="auth-modal-card">
        <div className="auth-logo" style={{ justifyContent: 'center', marginBottom: 20 }}>
          <div className="auth-logo-icon">
            <svg viewBox="0 0 32 32" fill="#000" width="20" height="20">
              <circle cx="16" cy="16" r="13" fill="none" stroke="#000" strokeWidth="2.5" />
              <path d="M12.5 10.5v11l9-5.5-9-5.5z" />
            </svg>
          </div>
          <span className="auth-logo-text">SoundWave</span>
        </div>

        {!showSpotifyPrompt && (
          <>
            <div className="auth-modal-tabs">
              <button className={`auth-modal-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>로그인</button>
              <button className={`auth-modal-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => switchTab('signup')}>회원가입</button>
            </div>

            {error && <div className="auth-error">{error}</div>}
            {success && <div className="auth-success">{success}</div>}

            {mode === 'login' && (
              <div id="modal-login-view">
                <div className="auth-socials" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  <a href="/api/oauth/google" className="auth-social-btn" style={socialBtnStyle('#fff', '#1a1a1a', '1px solid rgba(0,0,0,.1)')}>
                    <span style={{ fontWeight: 900, color: '#4285F4' }}>G</span> Google로 계속하기
                  </a>
                  <a href="/api/oauth/naver" className="auth-social-btn" style={socialBtnStyle('#03C75A', '#fff', 'none')}>
                    <span style={{ fontWeight: 900 }}>N</span> 네이버로 계속하기
                  </a>
                </div>
                <div className="auth-divider">또는 이메일로 로그인</div>

                <div className="auth-field">
                  <label htmlFor="modal-login-email">이메일</label>
                  <input id="modal-login-email" type="email" placeholder="이메일 주소를 입력하세요" autoComplete="email"
                    value={loginForm.email} onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLoginSubmit(); }} />
                </div>
                <div className="auth-field">
                  <label htmlFor="modal-login-password">비밀번호</label>
                  <input id="modal-login-password" type="password" placeholder="비밀번호를 입력하세요" autoComplete="current-password"
                    value={loginForm.password} onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleLoginSubmit(); }} />
                </div>
                <button className="auth-btn" disabled={busy} onClick={handleLoginSubmit}>
                  {busy ? '로그인 중...' : '로그인'}
                </button>

                <div className="auth-divider">또는</div>
                <div className="auth-demo">
                  🎵 체험 계정으로 바로 시작하기<br />
                  <strong>demo@soundwave.kr</strong> / <strong>demo1234</strong><br />
                  <button
                    onClick={quickDemo}
                    style={{ marginTop: 8, background: 'var(--accent)', border: 'none', color: '#000', padding: '6px 18px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}
                  >
                    데모로 시작하기
                  </button>
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div id="modal-signup-view">
                <div className="auth-socials" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  <a href="/api/oauth/google" className="auth-social-btn" style={socialBtnStyle('#fff', '#1a1a1a', '1px solid rgba(0,0,0,.1)')}>
                    <span style={{ fontWeight: 900, color: '#4285F4' }}>G</span> Google로 계속하기
                  </a>
                  <a href="/api/oauth/naver" className="auth-social-btn" style={socialBtnStyle('#03C75A', '#fff', 'none')}>
                    <span style={{ fontWeight: 900 }}>N</span> 네이버로 계속하기
                  </a>
                </div>
                <div className="auth-divider">또는 이메일로 가입</div>

                <div className="auth-field">
                  <label htmlFor="modal-su-display">이름 (표시 이름)</label>
                  <input id="modal-su-display" type="text" placeholder="SoundWave 사용자" autoComplete="name"
                    value={suForm.displayName} onChange={(e) => setSuForm((f) => ({ ...f, displayName: e.target.value }))} />
                </div>
                <div className="auth-field">
                  <label htmlFor="modal-su-username">사용자명</label>
                  <input id="modal-su-username" type="text" placeholder="영문, 숫자, _ 2~20자"
                    value={suForm.username} onChange={(e) => setSuForm((f) => ({ ...f, username: e.target.value }))} />
                  {usernameOk !== null && (
                    <div className={`auth-field-hint ${usernameOk ? 'success' : 'error'}`}>
                      {usernameOk ? '사용 가능한 사용자명이에요' : '영문, 숫자, _ 2~20자'}
                    </div>
                  )}
                </div>
                <div className="auth-field">
                  <label htmlFor="modal-su-email">이메일</label>
                  <input id="modal-su-email" type="email" placeholder="이메일 주소" autoComplete="email"
                    value={suForm.email} onChange={(e) => setSuForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="auth-field">
                  <label htmlFor="modal-su-password">비밀번호</label>
                  <input id="modal-su-password" type="password" placeholder="8자 이상, 영문+숫자+특수문자" autoComplete="new-password"
                    value={suForm.password} onChange={(e) => setSuForm((f) => ({ ...f, password: e.target.value }))} />
                  <div className="pw-strength-bar">
                    <div className="pw-strength-fill" style={{ width: `${score * 20}%`, background: PW_COLORS[score] || 'transparent' }} />
                  </div>
                  {suForm.password && (
                    <div className={`auth-field-hint ${score <= 1 ? 'error' : score <= 2 ? '' : 'success'}`}>{PW_LABELS[score]}</div>
                  )}
                </div>
                <div className="auth-field">
                  <label htmlFor="modal-su-password2">비밀번호 확인</label>
                  <input id="modal-su-password2" type="password" placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password"
                    value={suForm.password2} onChange={(e) => setSuForm((f) => ({ ...f, password2: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSignupSubmit(); }} />
                  {pw2Match !== null && (
                    <div className={`auth-field-hint ${pw2Match ? 'success' : 'error'}`}>
                      {pw2Match ? '비밀번호가 일치해요 ✓' : '비밀번호가 일치하지 않아요'}
                    </div>
                  )}
                </div>
                <div className="auth-checkbox-row">
                  <input type="checkbox" id="modal-su-agree" checked={suForm.agree} onChange={(e) => setSuForm((f) => ({ ...f, agree: e.target.checked }))} />
                  <label htmlFor="modal-su-agree">
                    <a href="#" onClick={(e) => e.preventDefault()}>서비스 이용약관</a> 및{' '}
                    <a href="#" onClick={(e) => e.preventDefault()}>개인정보 처리방침</a>에 동의합니다.
                  </label>
                </div>
                <button className="auth-btn" disabled={busy} onClick={handleSignupSubmit}>
                  {busy ? '가입 중...' : '회원가입'}
                </button>
              </div>
            )}
          </>
        )}

        {showSpotifyPrompt && (
          <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🎵</div>
            <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>Spotify 연동</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Premium 계정을 연동하면<br />음악을 전체 재생할 수 있어요.
            </div>
            <a
              href="/api/spotify/connect"
              style={{ display: 'block', width: '100%', background: '#1ed760', border: 'none', color: '#000', padding: 13, borderRadius: 50, fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            >
              Spotify 연동하기
            </a>
            <button
              onClick={handleClose}
              style={{ width: '100%', background: 'none', border: '1px solid rgba(255,255,255,.15)', color: 'var(--text-secondary)', padding: 11, borderRadius: 50, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              나중에 하기
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>Premium이 없어도 30초 미리듣기는 가능해요</div>
          </div>
        )}
      </div>
    </div>
  );
}

function socialBtnStyle(bg, color, border) {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: bg, color, border, borderRadius: 'var(--radius-full)', padding: 11,
    fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--font)',
  };
}
