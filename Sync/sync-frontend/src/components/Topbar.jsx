import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';

export default function Topbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [localTerm, setLocalTerm] = useState('');
  const dropdownRef = useRef(null);

  const isSearchPage = location.pathname === '/search';
  const [searchParams, setSearchParams] = useSearchParams();
  const initials = (user?.username || 'SW').slice(0, 2).toUpperCase();
  const displayName = user?.displayName || user?.username || 'SoundWave 사용자';

  // 검색창은 항상 로컬 state가 controlled value (한글 등 IME 조합 중에 값이 밖에서
  // 다시 밀려들어오면 조합이 깨지므로, URL(?q=)과는 직접 연결하지 않음)
  // /search 페이지에 들어올 때만 URL의 기존 값으로 한 번 동기화
  useEffect(() => {
    if (isSearchPage) setLocalTerm(searchParams.get('q') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchPage]);

  // 입력값이 바뀌면(렌더 커밋 이후) URL에 반영 — onChange 안에서 직접 하지 않아야 IME가 안 깨짐
  useEffect(() => {
    if (!isSearchPage) return;
    setSearchParams(localTerm ? { q: localTerm } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTerm, isSearchPage]);

  const searchTerm = localTerm;

  useEffect(() => {
    function onDocClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  function handleSearchFocus() {
    if (!isSearchPage) navigate('/search');
  }

  function handleSearchChange(e) {
    setLocalTerm(e.target.value);
  }

  return (
    <header className="topbar">
      <div className="topbar-nav">
        <button className="nav-arrow-btn" onClick={() => navigate(-1)} title="뒤로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        </button>
        <button className="nav-arrow-btn" onClick={() => navigate(1)} title="앞으로">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" /></svg>
        </button>
      </div>

      <div className="search-container" id="search-bar" style={{ display: isSearchPage ? 'block' : 'none' }}>
        <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder="아티스트, 곡, 팟캐스트 검색..."
          value={searchTerm}
          onFocus={handleSearchFocus}
          onChange={handleSearchChange}
        />
      </div>

      <div className="topbar-right">
        <button className="topbar-outline-btn">업그레이드</button>

        {isLoggedIn ? (
          <div className={`dropdown ${dropdownOpen ? 'open' : ''}`} id="avatar-dropdown" ref={dropdownRef}>
            <div className="avatar" title={displayName} onClick={(e) => { e.stopPropagation(); setDropdownOpen((o) => !o); }}>
              {initials}
            </div>
            <div className="dropdown-menu">
              <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.07)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-base)' }}>{displayName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{user?.email}</div>
              </div>
              <button className="dropdown-item" onClick={() => { setDropdownOpen(false); navigate('/profile'); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
                설정
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={logout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" /></svg>
                로그아웃
              </button>
            </div>
          </div>
        ) : (
          <button className="topbar-outline-btn" onClick={() => openAuthModal('login')}>로그인</button>
        )}
      </div>
    </header>
  );
}
