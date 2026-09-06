import { usePlayer } from '../context/PlayerContext';
import { useLyrics } from '../context/LyricsContext';

function fmtSec(sec) {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, progress, duration, volume,
    isShuffle, isRepeat, togglePlay, nextTrack, prevTrack,
    toggleShuffle, toggleRepeat, seek, setVolume,
    isPanelOpen, togglePanel, isUsingSpotify,
    isLiked, toggleLike, openPanel, setPanelTab,
  } = usePlayer();
  const { scrollEnabled, toggleScroll } = useLyrics();

  const pct = duration ? (progress / duration) * 100 : 0;

  function handleSeek(e) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(Math.max(0, Math.min(duration, ratio * duration)));
  }

  function handleVolume(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setVolume(Math.round(Math.max(0, Math.min(1, ratio)) * 100));
  }

  function openQueue() {
    setPanelTab('queue');
    openPanel();
  }

  return (
    <div className="player-wrapper">
      <div className="player-bar">
        <div className="player-track">
          <div className={`player-art ${currentTrack?.gradient || 'grad-4'}`}>
            {currentTrack?.albumArt
              ? <img src={currentTrack.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
              : (currentTrack?.emoji || '🎵')}
          </div>
          <div className="player-track-info">
            <div className="player-track-name">{currentTrack?.name || '재생 중인 곡 없음'}</div>
            <div className="player-track-artist">
              {currentTrack?.artist || ''}
              {isUsingSpotify && (
                <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 10, fontWeight: 700, letterSpacing: '.3px' }}>
                  ● SPOTIFY 전체 재생
                </span>
              )}
            </div>
          </div>
          <div className="player-track-btns">
            <button
              className={`icon-btn ${isLiked ? 'liked' : ''}`}
              style={isLiked ? { color: 'var(--accent)' } : undefined}
              onClick={toggleLike}
              title="좋아요"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
            </button>
          </div>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button className={`ctrl-btn ${isShuffle ? 'active' : ''}`} onClick={toggleShuffle} title="랜덤">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
            </button>
            <button className="ctrl-btn" onClick={prevTrack} title="이전 곡">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
            <button className="play-ctrl-btn" onClick={togglePlay} title="재생/일시정지">
              {isPlaying
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
            </button>
            <button className="ctrl-btn" onClick={nextTrack} title="다음 곡">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <button className={`ctrl-btn ${isRepeat ? 'active' : ''}`} onClick={toggleRepeat} title="반복">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>
            </button>
          </div>
          <div className="progress-area">
            <span className="progress-time">{fmtSec(progress)}</span>
            <div className="progress-bar" onClick={handleSeek}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="progress-time end">{fmtSec(duration)}</span>
          </div>
        </div>

        <div className="player-right">
          <button className={`ctrl-btn ${scrollEnabled ? 'active' : ''}`} title="가사 자동스크롤" onClick={toggleScroll}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
          </button>
          <button className="ctrl-btn" title="다음 곡 목록" onClick={openQueue}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
          </button>
          <div className="volume-area">
            <button className="ctrl-btn" title="볼륨">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
            </button>
            <div className="volume-bar" onClick={handleVolume}>
              <div className="volume-fill" style={{ width: `${volume}%` }} />
            </div>
          </div>
          <button className={`panel-toggle-btn ${isPanelOpen ? 'active' : ''}`} onClick={togglePanel} title="Now Playing 패널">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-4-2h2V7h-2v10z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
