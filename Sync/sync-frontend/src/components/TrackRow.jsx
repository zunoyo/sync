import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { toggleLike as toggleLikeApi } from '../api/playlists';

/** 트랙 리스트 한 줄 — 재생, 플레이리스트 추가, 좋아요 */
export default function TrackRow({ track, index, queue }) {
  const { currentTrack, isPlaying, playTrack } = usePlayer();
  const { openPicker, invalidateCache } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const showToast = useToast();
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  const active = !!currentTrack && (
    (currentTrack._id != null && currentTrack._id === track._id) ||
    (currentTrack.id != null && currentTrack.id === track.id)
  );

  function handleAdd(e) {
    e.stopPropagation();
    openPicker(track, e.currentTarget);
  }

  async function handleLike(e) {
    e.stopPropagation();
    if (!isLoggedIn) { showToast('로그인이 필요해요'); return; }
    setBusy(true);
    try {
      const result = await toggleLikeApi(track);
      setLiked(result.liked);
      showToast(result.liked ? `'${result.playlistName}'에 저장했어요` : `'${result.playlistName}'에서 제거했어요`);
      invalidateCache();
    } catch {
      showToast('처리하지 못했어요');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`track-item ${active ? 'active' : ''}`} onClick={() => playTrack(track, queue)}>
      <div className="track-num-wrap">
        {active && isPlaying ? (
          <div className="eq-bars">
            <div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" /><div className="eq-bar" />
          </div>
        ) : (
          <span className="track-num">{index + 1}</span>
        )}
        <svg className="track-play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </div>
      <div className={`${track.gradient || 'grad-1'}`} style={{ width: 42, height: 42, borderRadius: 6, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        {track.albumArt
          ? <img src={track.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
          : (track.emoji || '🎵')}
      </div>
      <div className="track-info">
        <div className="track-name">{track.name}</div>
        <div className="track-artist">{track.artist}</div>
      </div>
      <div className="track-album">{track.album}</div>
      <div className="track-actions">
        <button className="track-add-btn" title="플레이리스트에 추가" onClick={handleAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
        </button>
        <button className={`track-like-btn ${liked ? 'liked' : ''}`} title="좋아요" disabled={busy} onClick={handleLike} style={liked ? { color: 'var(--accent)' } : undefined}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
        </button>
        <span className="track-duration">{track.duration}</span>
      </div>
    </div>
  );
}
