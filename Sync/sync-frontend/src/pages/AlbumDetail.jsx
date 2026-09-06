import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { fetchAlbumDetail } from '../api/artist';
import { fetchSavedAlbums, saveAlbum, unsaveAlbum } from '../api/savedLibrary';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';

export default function AlbumDetail() {
  const { externalId } = useParams();
  const location = useLocation();
  // 저장된 앨범 목록(사이드바/플레이리스트)에서 넘어온 경우, iTunes 폴백 실패 시
  // Spotify로 재검색할 수 있도록 아티스트/앨범 이름을 함께 받아둠
  const { artistName: hintArtistName, albumName: hintAlbumName } = location.state || {};
  const { playTrack } = usePlayer();
  const { openPicker } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const { bump } = useLibrary();
  const showToast = useToast();

  const [album, setAlbum] = useState(null); // { albumName, artistName, albumArt, releaseYear, tracks }
  const [savedEntry, setSavedEntry] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAlbum(null);
    fetchAlbumDetail(externalId, hintArtistName, hintAlbumName).then((d) => { if (!cancelled) setAlbum(d); });
    if (isLoggedIn) {
      fetchSavedAlbums().then((list) => {
        if (cancelled) return;
        const found = (list || []).find((a) => String(a.albumExternalId) === String(externalId));
        setSavedEntry(found || null);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [externalId, isLoggedIn]);

  async function toggleSave() {
    if (!isLoggedIn) { showToast('로그인이 필요해요'); return; }
    if (!album) return;
    setBusy(true);
    try {
      if (savedEntry) {
        await unsaveAlbum(savedEntry.id);
        setSavedEntry(null);
      } else {
        const saved = await saveAlbum({
          albumExternalId: externalId, albumName: album.albumName, artistName: album.artistName,
          albumArtUrl: album.albumArt, releaseYear: album.releaseYear,
        });
        setSavedEntry(saved);
      }
      bump();
    } catch {
      showToast('처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="detail-hero grad-4">
        <div className="detail-hero-art">
          {album?.albumArt
            ? <img src={album.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
            : '💿'}
        </div>
        <div className="detail-hero-info">
          <div className="detail-hero-type">앨범</div>
          <div className="detail-hero-name">{album?.albumName || '불러오는 중...'}</div>
          {album?.artistName && <div className="detail-hero-desc">{album.artistName}</div>}
          <div className="detail-hero-meta">
            {album ? `${album.tracks.length}곡${album.releaseYear ? ` · ${album.releaseYear}` : ''}` : '불러오는 중...'}
          </div>
          <div className="detail-hero-actions">
            <button
              className="play-btn-large"
              disabled={!album?.tracks?.length}
              onClick={() => album?.tracks?.length && playTrack(album.tracks[0], album.tracks)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button
              className="action-btn"
              title="앨범 저장"
              disabled={busy}
              onClick={toggleSave}
              style={{ color: savedEntry ? 'var(--accent)' : undefined }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {!album && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>곡 불러오는 중...</div>
      )}
      {album && album.tracks.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>곡 정보를 찾을 수 없어요</div>
      )}
      {album && album.tracks.length > 0 && (
        <div className="track-list">
          {album.tracks.map((t, i) => (
            <div key={t._id} className="track-item" onClick={() => playTrack(t, album.tracks)}>
              <div className="track-num-wrap">
                <span className="track-num">{i + 1}</span>
                <svg className="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </div>
              <div className="track-info">
                <div className="track-name">{t.name}</div>
                <div className="track-artist">{t.artist}</div>
              </div>
              <div className="track-actions">
                <button className="track-add-btn" title="플레이리스트에 추가" onClick={(e) => { e.stopPropagation(); openPicker(t, e.currentTarget); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                </button>
                <span className="track-duration">{t.duration}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
