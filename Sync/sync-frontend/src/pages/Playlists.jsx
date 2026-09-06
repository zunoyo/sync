import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPlaylists, fetchPlaylistTracks, deletePlaylist, plGradient, plEmoji } from '../api/playlists';
import { fetchSavedArtists, fetchSavedAlbums, unsaveArtist, unsaveAlbum } from '../api/savedLibrary';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useToast } from '../context/ToastContext';
import { useLibrary } from '../context/LibraryContext';
import CreatePlaylistModal from '../components/CreatePlaylistModal';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'my', label: '내 플레이리스트' },
  { key: 'saved', label: '저장된 플레이리스트' },
  { key: 'artist', label: '아티스트' },
  { key: 'album', label: '앨범' },
];

export default function Playlists() {
  const [filter, setFilter] = useState('all');
  const [playlists, setPlaylists] = useState([]);
  const [counts, setCounts] = useState({});
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { invalidateCache } = usePlaylistPicker();
  const { version, bump } = useLibrary();
  const showToast = useToast();

  const showPl = filter === 'all' || filter === 'my' || filter === 'saved';
  const showAr = filter === 'all' || filter === 'artist';
  const showAl = filter === 'all' || filter === 'album';

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, version]);

  async function load() {
    setLoading(true);
    const [pls, ars, als] = await Promise.all([
      showPl ? fetchPlaylists().catch(() => []) : Promise.resolve([]),
      showAr ? fetchSavedArtists().catch(() => []) : Promise.resolve([]),
      showAl ? fetchSavedAlbums().catch(() => []) : Promise.resolve([]),
    ]);
    setPlaylists(pls);
    setArtists(ars);
    setAlbums(als);

    if (pls.length) {
      const entries = await Promise.all(pls.map(async (pl) => {
        try {
          const tracks = await fetchPlaylistTracks(pl.id);
          return [pl.id, tracks.length];
        } catch {
          return [pl.id, 0];
        }
      }));
      setCounts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    }
    setLoading(false);
  }

  const visiblePlaylists = filter === 'my' ? playlists.filter((p) => p.source === 'user_created')
    : filter === 'saved' ? playlists.filter((p) => p.source !== 'user_created')
      : playlists;

  async function handleDelete(id, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('이 플레이리스트를 삭제할까요?')) return;
    try {
      await deletePlaylist(id);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      invalidateCache();
      bump();
    } catch {
      showToast('삭제하지 못했어요');
    }
  }

  async function handleUnsaveArtist(id, e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unsaveArtist(id);
      setArtists((prev) => prev.filter((a) => a.id !== id));
      bump();
    } catch {
      showToast('삭제하지 못했어요');
    }
  }

  async function handleUnsaveAlbum(id, e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unsaveAlbum(id);
      setAlbums((prev) => prev.filter((a) => a.id !== id));
      bump();
    } catch {
      showToast('삭제하지 못했어요');
    }
  }

  return (
    <>
      <div className="section-header" style={{ marginBottom: 24 }}>
        <h2 className="section-title">플레이리스트 관리</h2>
        <button className="pill-btn accent" onClick={() => setModalOpen(true)}>+ 새 플레이리스트</button>
      </div>

      <div className="playlist-toolbar">
        <div style={{ position: 'relative', flex: 1, maxWidth: 280 }}>
          <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="text" placeholder="플레이리스트 검색..."
            style={{ width: '100%', background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 'var(--radius-full)', padding: '9px 16px 9px 36px', fontSize: 13, color: 'var(--text-base)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`filter-pill pl-filter-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cards-grid" id="playlist-grid">
        {loading && (
          <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중...</div>
        )}

        {!loading && showPl && (
          <div className="create-playlist-banner" onClick={() => setModalOpen(true)}>
            <div className="create-icon">➕</div>
            <div className="create-title">새 플레이리스트 만들기</div>
            <div className="create-desc">좋아하는 곡들을 모아보세요</div>
          </div>
        )}

        {!loading && showPl && visiblePlaylists.length === 0 && <EmptyNote msg="아직 만든 플레이리스트가 없어요" />}
        {!loading && showPl && visiblePlaylists.map((pl) => (
          <PlaylistCard key={pl.id} pl={pl} count={counts[pl.id]} onDelete={handleDelete} />
        ))}

        {!loading && showAr && filter === 'all' && <SectionLabel label="아티스트" />}
        {!loading && showAr && artists.length === 0 && <EmptyNote msg="저장한 아티스트가 없어요" />}
        {!loading && showAr && artists.map((a) => (
          <ArtistCard key={a.id} a={a} onDelete={handleUnsaveArtist} />
        ))}

        {!loading && showAl && filter === 'all' && <SectionLabel label="앨범" />}
        {!loading && showAl && albums.length === 0 && <EmptyNote msg="저장한 앨범이 없어요" />}
        {!loading && showAl && albums.map((a) => (
          <AlbumCard key={a.id} a={a} onDelete={handleUnsaveAlbum} />
        ))}
      </div>

      <CreatePlaylistModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          invalidateCache();
          bump();
        }}
      />
    </>
  );
}

function PlaylistCard({ pl, count, onDelete }) {
  const shared = !!pl.public;
  return (
    <Link to={`/playlists/${pl.id}`} className="playlist-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className={`playlist-card-art ${plGradient(pl)}`}>
        <span style={{ fontSize: 52 }}>{plEmoji(pl)}</span>
        {shared && (
          <span
            title="친구에게 공유중"
            style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(30,215,96,.9)', color: '#000', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)' }}
          >
            공유중
          </span>
        )}
        <div className="playlist-card-overlay">
          <span className="detail-play-btn" title="열기">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </div>
      </div>
      <button className="pl-menu-btn icon-btn" title="삭제" onClick={(e) => onDelete(pl.id, e)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
      </button>
      <div className="playlist-card-body">
        <div className="playlist-card-name">{pl.playlistName}</div>
        <div className="playlist-card-meta">플레이리스트{count !== undefined ? ` · ${count}곡` : ''}</div>
      </div>
    </Link>
  );
}

function ArtistCard({ a, onDelete }) {
  return (
    <Link to={`/artist/${encodeURIComponent(a.artistName)}`} className="playlist-card" style={{ '--card-radius': '50%', textDecoration: 'none', color: 'inherit' }}>
      <div className="playlist-card-art" style={{ borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-card)' }}>
        {a.artistImageUrl
          ? <img src={a.artistImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 52 }}>🎤</span>}
      </div>
      <button className="pl-menu-btn icon-btn" title="삭제" onClick={(e) => onDelete(a.id, e)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
      </button>
      <div className="playlist-card-body">
        <div className="playlist-card-name">{a.artistName}</div>
        <div className="playlist-card-meta">아티스트</div>
      </div>
    </Link>
  );
}

function AlbumCard({ a, onDelete }) {
  return (
    <Link to={`/album/${encodeURIComponent(a.albumExternalId)}`} state={{ artistName: a.artistName, albumName: a.albumName }} className="playlist-card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="playlist-card-art" style={{ background: 'var(--bg-card)' }}>
        {a.albumArtUrl
          ? <img src={a.albumArtUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 52 }}>💿</span>}
      </div>
      <button className="pl-menu-btn icon-btn" title="삭제" onClick={(e) => onDelete(a.id, e)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
      </button>
      <div className="playlist-card-body">
        <div className="playlist-card-name">{a.albumName}</div>
        <div className="playlist-card-meta">{a.artistName || ''}{a.releaseYear ? ` · ${a.releaseYear}` : ''}</div>
      </div>
    </Link>
  );
}

function SectionLabel({ label }) {
  return (
    <div style={{ gridColumn: '1/-1', fontSize: 18, fontWeight: 700, margin: '8px 0 4px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      {label}
    </div>
  );
}

function EmptyNote({ msg }) {
  return (
    <div style={{ gridColumn: '1/-1', padding: 56, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
      <div style={{ fontSize: 14 }}>{msg}</div>
    </div>
  );
}
