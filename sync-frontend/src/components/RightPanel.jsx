import { useEffect, useMemo, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useLyrics } from '../context/LyricsContext';

function fmtSec(sec) {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RightPanel() {
  const {
    currentTrack, isPlaying, progress, duration, queue, queueIndex,
    isPanelOpen, closePanel, togglePlay, prevTrack, nextTrack,
    toggleShuffle, toggleRepeat, playTrack, panelTab, setPanelTab,
    isLiked, toggleLike,
  } = usePlayer();

  const pct = duration ? (progress / duration) * 100 : 0;
  const upNext = queue.slice(queueIndex + 1);

  return (
    <aside className={`right-panel ${isPanelOpen ? 'open' : ''}`} id="right-panel">
      <div className="rp-header">
        <div className="rp-tabs">
          <button className={`rp-tab ${panelTab === 'nowplaying' ? 'active' : ''}`} onClick={() => setPanelTab('nowplaying')}>Now Playing</button>
          <button className={`rp-tab ${panelTab === 'queue' ? 'active' : ''}`} onClick={() => setPanelTab('queue')}>다음 곡</button>
        </div>
        <button className="rp-close" onClick={closePanel} title="닫기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
        </button>
      </div>

      <div className="rp-body">
        {panelTab === 'nowplaying' && (
          <div className="rp-tab-content" data-tab="nowplaying">
            {currentTrack ? (
              <>
                <div className="rp-now-playing">
                  <div className={`rp-album-art ${currentTrack.gradient || 'grad-4'}`}>
                    {currentTrack.albumArt
                      ? <img src={currentTrack.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                      : (currentTrack.emoji || '🎵')}
                  </div>
                  <div className="rp-track-info" style={{ width: '100%' }}>
                    <div className="rp-track-header">
                      <div>
                        <div className="rp-track-name">{currentTrack.name}</div>
                        <div className="rp-track-artist">{currentTrack.artist}</div>
                      </div>
                      <button
                        className={`icon-btn ${isLiked ? 'liked' : ''}`}
                        style={isLiked ? { color: 'var(--accent)' } : undefined}
                        onClick={toggleLike}
                        title="좋아요"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                      </button>
                    </div>
                  </div>

                  <Waveform trackId={currentTrack._id} progressPct={pct} />

                  <div className="rp-progress-wrap" style={{ width: '100%' }}>
                    <div className="rp-progress-bar">
                      <div className="rp-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="rp-progress-times">
                      <span>{fmtSec(progress)}</span>
                      <span>{fmtSec(duration)}</span>
                    </div>
                  </div>
                  <div className="rp-controls" style={{ width: '100%' }}>
                    <button className="ctrl-btn" onClick={toggleShuffle} title="랜덤">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" /></svg>
                    </button>
                    <button className="ctrl-btn" onClick={prevTrack} title="이전">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                    </button>
                    <button className="rp-play-btn" onClick={togglePlay} title="재생/일시정지">
                      {isPlaying
                        ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                        : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button className="ctrl-btn" onClick={nextTrack} title="다음">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                    </button>
                    <button className="ctrl-btn" onClick={toggleRepeat} title="반복">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" /></svg>
                    </button>
                  </div>
                </div>

                <LyricsSection />
                <RelatedArtists />
              </>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                재생 중인 곡이 없어요
              </div>
            )}
          </div>
        )}

        {panelTab === 'queue' && (
          <div className="rp-tab-content" data-tab="queue">
            <div className="rp-queue">
              <div className="rp-section-label">다음에 재생할 곡</div>
              <div id="rp-queue-list">
                {upNext.length === 0 && (
                  <div style={{ padding: '10px 4px', color: 'var(--text-muted)', fontSize: 13 }}>대기열이 비어 있어요</div>
                )}
                {upNext.map((t, i) => (
                  <div
                    key={t._id || t.id || i}
                    className="queue-item"
                    onClick={() => playTrack(t, queue)}
                  >
                    <div className={`queue-art ${t.gradient || 'grad-1'}`}>
                      {t.albumArt
                        ? <img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                        : (t.emoji || '🎵')}
                    </div>
                    <div className="queue-info">
                      <div className="queue-name">{t.name}</div>
                      <div className="queue-artist">{t.artist}</div>
                    </div>
                    <div className="queue-duration">{t.duration || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/** 진행률에 따라 막대가 채워지는 파형 시각화 — 트랙마다 높이를 한 번씩 랜덤 생성 */
function Waveform({ trackId, progressPct }) {
  const heights = useMemo(() => Array.from({ length: 48 }, () => 20 + Math.random() * 80), [trackId]);
  const playedCount = Math.floor((heights.length * progressPct) / 100);
  return (
    <div className="rp-waveform" style={{ width: '100%' }}>
      {heights.map((h, i) => (
        <div key={i} className={`wave-bar ${i < playedCount ? 'played' : ''}`} style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

function LyricsSection() {
  const { lines, activeIndex, status, loaded, scrollEnabled, seekToLine } = useLyrics();
  const activeLineRef = useRef(null);

  useEffect(() => {
    if (scrollEnabled && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, scrollEnabled]);

  return (
    <div className="rp-lyrics">
      <div className="rp-section-label">가사</div>
      <div id="rp-lyrics-container" style={scrollEnabled ? { height: 300, overflowY: 'auto', padding: '4px 0' } : { height: 90, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        {status === 'loading' && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, opacity: .6 }}>가사 불러오는 중...</div>
        )}
        {status === 'not-found' && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>가사를 찾을 수 없어요 🎵</div>
        )}
        {status === 'not-found-ko' && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>한국어 가사를 찾을 수 없어요 🎵</div>
        )}
        {status === 'error' && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>가사를 불러올 수 없어요</div>
        )}
        {status === 'idle' && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, opacity: .6 }}>재생 중인 곡이 없어요</div>
        )}

        {loaded && !scrollEnabled && (
          <MiniLyrics lines={lines} activeIndex={activeIndex} />
        )}
        {loaded && scrollEnabled && lines.map((line, i) => (
          <div
            key={i}
            ref={i === activeIndex ? activeLineRef : null}
            className={`lyrics-line ${i === activeIndex ? 'active' : ''}`}
            style={{ padding: '8px 4px', textAlign: 'center', cursor: 'pointer', borderRadius: 6 }}
            onClick={() => seekToLine(i)}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 관련 아티스트 — 원본(right-panel.js)도 실제 백엔드 데이터가 아니라
 * 하드코딩된 mock 배열(ARTISTS.slice(0,3))을 그대로 보여주던 장식용 섹션입니다.
 * "팔로우" 버튼도 원본처럼 실제 동작은 없습니다.
 */
const RELATED_ARTISTS = [
  { name: 'aespa', genre: 'K-Pop / 일렉트로닉', emoji: '👩', gradient: 'grad-4' },
  { name: 'BTS', genre: 'K-Pop / 힙합', emoji: '🎤', gradient: 'grad-6' },
  { name: 'IU', genre: 'K-Pop / 발라드', emoji: '🌸', gradient: 'grad-7' },
];

function RelatedArtists() {
  return (
    <div className="rp-related">
      <div className="rp-section-label">관련 아티스트</div>
      <div id="rp-related-list">
        {RELATED_ARTISTS.map((a) => (
          <div className="related-artist" key={a.name}>
            <div className={`related-avatar ${a.gradient}`}>{a.emoji}</div>
            <div className="related-info">
              <div className="related-name">{a.name}</div>
              <div className="related-meta">{a.genre}</div>
            </div>
            <button className="related-follow">팔로우</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniLyrics({ lines, activeIndex }) {
  const idx = Math.max(activeIndex, 0);
  const prev = idx > 0 ? lines[idx - 1] : null;
  const current = lines[idx] || '';
  const next = idx < lines.length - 1 ? lines[idx + 1] : null;
  const rows = [
    prev && { text: prev, active: false },
    { text: current, active: true },
    next && { text: next, active: false },
  ].filter(Boolean);

  return rows.map((r, i) => (
    <div
      key={i}
      className={`lyrics-line ${r.active ? 'active' : ''}`}
      style={{ padding: '2px 8px', textAlign: 'center', width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
    >
      {r.text}
    </div>
  ));
}
