import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate('/');
  }, [isLoggedIn, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-standalone-body">
      <div className="auth-split-layout">
        <div className="auth-left-panel">
          <div className="auth-logo-text">SYNC</div>
          <div className="auth-tagline">당신의 음악, 새로운 방식으로</div>
          <div className="auth-deco-orb auth-deco-orb-1" />
          <div className="auth-deco-orb auth-deco-orb-2" />
        </div>
        <div className="auth-right-panel">
          <div className="auth-wrap">
            <div className="auth-card">
              <div className="auth-title">다시 만나요!</div>
              <div className="auth-subtitle">로그인해서 음악을 즐겨보세요</div>
              {error && <div className="auth-msg-error">{error}</div>}

              <div className="auth-socials">
                <a href="/api/oauth/google" className="auth-social-btn google">
                  <span style={{ fontWeight: 900, color: '#4285F4' }}>G</span> Google로 계속하기
                </a>
                <a href="/api/oauth/naver" className="auth-social-btn naver">
                  <span style={{ fontWeight: 900 }}>N</span> 네이버로 계속하기
                </a>
              </div>
              <div className="auth-divider">또는 이메일로 로그인</div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">이메일</label>
                  <input id="email" type="email" placeholder="이메일을 입력하세요" required autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="password">비밀번호</label>
                  <input id="password" type="password" placeholder="비밀번호를 입력하세요" required
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <button type="submit" className="auth-btn" disabled={submitting}>
                  {submitting ? '로그인 중...' : '로그인'}
                </button>
              </form>
              <div className="auth-demo">🎵 데모 계정: <strong>demo@sync.kr</strong> / <strong>demo1234</strong></div>
            </div>
            <div className="auth-footer">계정이 없으신가요? <Link to="/signup">회원가입</Link></div>
          </div>
        </div>
      </div>
    </div>
  );
}
