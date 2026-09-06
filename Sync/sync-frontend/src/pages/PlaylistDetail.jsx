import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchPlaylist, fetchPlaylistTracks, serverTrackToApp, plGradient, plEmoji,
  updateVisibility, deletePlaylist, removeTrack,
} from '../api/playlists';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useToast } from '../context/ToastContext';
import { useLibrary } from '../context/LibraryContext';

export default function PlaylistDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { playTrack } = usePlayer();
  const { invalidateCache } = usePlaylistPicker();
  const { bump } = useLibrary();
  const showToast = useToast();

  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setPlaylist(null);
    setTracks(null);
    setError(false);
    try {
      const [pl, rawTracks] = await Promise.all([fetchPlaylist(id), fetchPlaylistTracks(id)]);
      setPlaylist(pl);
      setTracks(rawTracks.map(serverTrackToApp));
    } catch {
      setError(true);
    }
  }

  async function handleShareToggle() {
    if (!playlist) return;
    setShareBusy(true);
    try {
      const updated = await updateVisibility(playlist.id, !playlist.public);
      setPlaylist(updated);
    } catch {
      showToast('변경하지 못했어요');
    } finally {
      setShareBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('이 플레이리스트를 삭제할까요?')) return;
    try {
      await deletePlaylist(id);
      invalidateCache();
      bump();
      navigate('/playlists');
    } catch {
      showToast('삭제하지 못했어요');
    }
  }

  async function handleRemoveTrack(trackDbId, e) {
    e.stopPropagation();
    try {
      await removeTrack(trackDbId);
      setTracks((prev) => prev.filter((t) => t.trackDbId !== trackDbId));
    } catch {
      showToast('제거하지 못했어요');
    }
  }

  if (error) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오기 실패</div>;
  }

  const shared = !!playlist?.public;

  return (
    <>
      <div className={`detail-hero ${playlist ? plGradient(playlist) : 'grad-1'}`}>
        <div className="detail-hero-art">{playlist ? plEmoji(playlist) : '🎵'}</div>
        <div className="detail-hero-info">
          <div className="detail-hero-type">플레이리스트</div>
          <div className="detail-hero-name">{playlist ? playlist.playlistName : '불러오는 중...'}</div>
          <div className="detail-hero-meta">{tracks ? `${tracks.length}곡` : ''}</div>
          <div className="detail-hero-actions">
            <button
              className="play-btn-large"
              disabled={!tracks?.length}
              onClick={() => tracks?.length && playTrack(tracks[0], tracks)}
              title="재생"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>
            <button
              onClick={handleShareToggle}
              disabled={!playlist || shareBusy}
              title={shared ? '친구 공유 끄기' : '친구 공유 켜기'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none',
                border: `1px solid ${shared ? 'var(--accent)' : 'rgba(255,255,255,.3)'}`,
                color: shared ? 'var(--accent)' : 'rgba(255,255,255,.85)',
                borderRadius: 50, padding: '0 16px', height: 40, whiteSpace: 'nowrap',
                cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
                <path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .05 3.11L8.91 10.7a3 3 0 1 0 0 2.6l6.14 3.59A3 3 0 1 0 16 15a3 3 0 0 0-.05.34l-6.14-3.59a3 3 0 0 0 0-1.5l6.14-3.59A3 3 0 0 0 18 8z" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{shared ? '공유중' : '비공개'}</span>
            </button>
            <button className="action-btn" title="삭제" onClick={handleDelete}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {tracks === null && !error && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중...</div>
      )}

      {tracks && tracks.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎵</div>
          <div style={{ fontSize: 14 }}>아직 곡이 없어요. 검색이나 홈에서 곡을 추가해보세요.</div>
        </div>
      )}

      {tracks && tracks.length > 0 && (
        <div className="track-list">
          {tracks.map((t, i) => (
            <div key={t.trackDbId} className="track-item" onClick={() => playTrack(t, tracks)}>
              <div className="track-num-wrap">
                <span className="track-num">{i + 1}</span>
                <svg className="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </div>
              {t.albumArt
                ? <div className="track-art" style={{ overflow: 'hidden' }}><img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                : <div className="track-art grad-4">🎵</div>}
              <div className="track-info">
                <div className="track-name">{t.name}</div>
                <div className="track-artist">{t.artist}</div>
              </div>
              <div className="track-album">{t.album}</div>
              <div className="track-actions">
                <button className="track-remove-btn" title="플레이리스트에서 제거" onClick={(e) => handleRemoveTrack(t.trackDbId, e)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H5v-2h14v2z" /></svg>
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
