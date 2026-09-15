import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const { signup, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isLoggedIn) navigate('/');
  }, [isLoggedIn, navigate]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup(form);
      navigate('/login');
    } catch (err) {
      setError(err.status === 409 ? '이미 사용 중인 이메일 또는 사용자명입니다.' : '회원가입에 실패했습니다.');
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
              <div className="auth-title">Sync 시작하기</div>
              <div className="auth-subtitle">무료 계정을 만들어보세요</div>
              {error && <div className="auth-msg-error">{error}</div>}

              <div className="auth-socials">
                <a href="/api/oauth/google" className="auth-social-btn google">
                  <span style={{ fontWeight: 900, color: '#4285F4' }}>G</span> Google로 계속하기
                </a>
                <a href="/api/oauth/naver" className="auth-social-btn naver">
                  <span style={{ fontWeight: 900 }}>N</span> 네이버로 계속하기
                </a>
              </div>
              <div className="auth-divider">또는 이메일로 가입</div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">이메일</label>
                  <input id="email" type="email" placeholder="이메일 주소" required autoComplete="email"
                    value={form.email} onChange={update('email')} />
                </div>
                <div className="form-group">
                  <label htmlFor="username">사용자명</label>
                  <input id="username" type="text" placeholder="사용자명 (영문, 숫자)" required
                    value={form.username} onChange={update('username')} />
                </div>
                <div className="form-group">
                  <label htmlFor="displayName">이름</label>
                  <input id="displayName" type="text" placeholder="표시될 이름"
                    value={form.displayName} onChange={update('displayName')} />
                </div>
                <div className="form-group">
                  <label htmlFor="password">비밀번호</label>
                  <input id="password" type="password" placeholder="8자 이상 입력" required minLength={8}
                    value={form.password} onChange={update('password')} />
                </div>
                <button type="submit" className="auth-btn" disabled={submitting}>
                  {submitting ? '계정 만드는 중...' : '계정 만들기'}
                </button>
              </form>
            </div>
            <div className="auth-footer">이미 계정이 있으신가요? <Link to="/login">로그인</Link></div>
          </div>
        </div>
      </div>
    </div>
  );
}
