import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFriends } from '../context/FriendsContext';
import { useLibrary } from '../context/LibraryContext';
import { fetchPlaylists, plGradient, plEmoji } from '../api/playlists';
import { fetchSavedArtists, fetchSavedAlbums } from '../api/savedLibrary';
import CreatePlaylistModal from './CreatePlaylistModal';

const NAV_ITEMS = [
  { to: '/', label: '홈', end: true, icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { to: '/search', label: '검색하기', icon: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
];

const NAV_ITEMS_2 = [
  { to: '/friends', label: '친구', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { to: '/sync', label: 'Sync', icon: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z', badge: 'AI' },
];

const NAV_ITEMS_3 = [
  { to: '/playlists', label: '플레이리스트 관리', icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z' },
  { to: '/profile', label: '회원정보', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
];

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'playlist', label: '플레이리스트' },
  { key: 'artist', label: '아티스트' },
  { key: 'album', label: '앨범' },
];

export default function Sidebar() {
  const { isLoggedIn } = useAuth();
  const { requestCount } = useFriends();
  const { version, bump } = useLibrary();
  const [playlists, setPlaylists] = useState([]);
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setPlaylists([]);
      setArtists([]);
      setAlbums([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchPlaylists().catch(() => []),
      fetchSavedArtists().catch(() => []),
      fetchSavedAlbums().catch(() => []),
    ]).then(([pls, ars, als]) => {
      if (cancelled) return;
      setPlaylists(Array.isArray(pls) ? pls : []);
      setArtists(Array.isArray(ars) ? ars : []);
      setAlbums(Array.isArray(als) ? als : []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isLoggedIn, version]);

  const showPl = filter === 'all' || filter === 'playlist';
  const showAr = filter === 'all' || filter === 'artist';
  const showAl = filter === 'all' || filter === 'album';
  const isEmpty = !playlists.length && !artists.length && !albums.length;

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link className="logo" to="/">
          <div className="logo-icon">
            <svg viewBox="0 0 32 32" fill="#000" width="20" height="20">
              <circle cx="16" cy="16" r="13" fill="none" stroke="#000" strokeWidth="2.5" />
              <path d="M12.5 10.5v11l9-5.5-9-5.5z" />
            </svg>
          </div>
          <span className="logo-text">SoundWave</span>
        </Link>

        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <div className="nav-divider" />
          {NAV_ITEMS_2.map((item) => (
            <NavItem key={item.to} {...item} badgeCount={item.to === '/friends' ? requestCount : undefined} />
          ))}
          <div className="nav-divider" />
          {NAV_ITEMS_3.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </ul>
      </div>

      <div className="sidebar-bottom">
        <div className="library-header">
          <button className="library-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            내 라이브러리
          </button>
          {isLoggedIn && (
            <button className="icon-btn" title="새 플레이리스트 추가" onClick={() => setModalOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
            </button>
          )}
        </div>

        <div className="library-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-pill lib-filter-pill ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="library-list">
          {!isLoggedIn && (
            <div className="library-empty-hint" style={{ padding: '14px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              로그인하면 라이브러리가 표시돼요
            </div>
          )}
          {isLoggedIn && loading && (
            <div className="library-empty-hint">불러오는 중...</div>
          )}
          {isLoggedIn && !loading && isEmpty && (
            <div className="library-empty-hint">
              아직 저장한 항목이 없어요.<br />플레이리스트를 만들거나 곡을 추가해보세요.
            </div>
          )}

          {isLoggedIn && !loading && showPl && playlists.length > 0 && (
            <>
              <GroupLabel label="플레이리스트" />
              {playlists.map((pl) => (
                <Link key={pl.id} className="library-item" to={`/playlists/${pl.id}`} style={{ textDecoration: 'none' }}>
                  <div className={`library-item-art ${plGradient(pl)}`}>{plEmoji(pl)}</div>
                  <div className="library-item-info">
                    <div className="library-item-name">{pl.playlistName}</div>
                    <div className="library-item-meta">플레이리스트{pl.public ? ' · 공유중' : ''}</div>
                  </div>
                </Link>
              ))}
            </>
          )}

          {isLoggedIn && !loading && showAr && artists.length > 0 && (
            <>
              <GroupLabel label="아티스트" />
              {artists.map((a) => (
                <Link key={a.id} className="library-item" to={`/artist/${encodeURIComponent(a.artistName)}`} style={{ textDecoration: 'none' }}>
                  <div className="library-item-art circle grad-4" style={{ overflow: 'hidden' }}>
                    {a.artistImageUrl
                      ? <img src={a.artistImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      : '🎤'}
                  </div>
                  <div className="library-item-info">
                    <div className="library-item-name">{a.artistName}</div>
                    <div className="library-item-meta">아티스트</div>
                  </div>
                </Link>
              ))}
            </>
          )}

          {isLoggedIn && !loading && showAl && albums.length > 0 && (
            <>
              <GroupLabel label="앨범" />
              {albums.map((a) => (
                <Link key={a.id} className="library-item" to={`/album/${encodeURIComponent(a.albumExternalId)}`} state={{ artistName: a.artistName, albumName: a.albumName }} style={{ textDecoration: 'none' }}>
                  <div className="library-item-art" style={{ overflow: 'hidden' }}>
                    {a.albumArtUrl
                      ? <img src={a.albumArtUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      : '💿'}
                  </div>
                  <div className="library-item-info">
                    <div className="library-item-name">{a.albumName}</div>
                    <div className="library-item-meta">앨범 · {a.artistName || ''}</div>
                  </div>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      <CreatePlaylistModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => { setModalOpen(false); bump(); }}
      />
    </aside>
  );
}

function GroupLabel({ label }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.4px', padding: '10px 10px 4px' }}>
      {label}
    </div>
  );
}

function NavItem({ to, label, icon, end, badge, badgeCount }) {
  const { pathname } = useLocation();
  const isActive = end ? pathname === to : pathname.startsWith(to);
  return (
    <li className={`nav-item ${isActive ? 'active' : ''}`}>
      <Link to={to}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d={icon} /></svg>
        {label}
        {badge && (
          <span className="nav-badge" style={{ background: 'linear-gradient(90deg,var(--accent),var(--info))', color: '#000' }}>
            {badge}
          </span>
        )}
        {!badge && badgeCount > 0 && <span className="nav-badge">{badgeCount}</span>}
      </Link>
    </li>
  );
}
