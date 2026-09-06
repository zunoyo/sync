import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { EMOTION_LABELS, SYNC_MOODS, fmtMs, fullRecommend, syncTrackToApp } from '../api/sync';
import { fetchItunesTrack } from '../api/itunes';
import AnalysisDetail from '../components/SyncAnalysis';

export default function Sync() {
  const { isLoggedIn } = useAuth();
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { bump } = useLibrary();
  const [text, setText] = useState('');
  const [images, setImages] = useState([]); // { name, src(base64) } — 서버로는 첫 장만 전송
  const [activeMoods, setActiveMoods] = useState(new Set());
  const [status, setStatus] = useState('idle'); // idle | loading | finishing | error | done
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null); // { emotion, tracks }
  const fileInputRef = useRef(null);
  const finishTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(finishTimerRef.current);
  }, []);

  function toggleMood(mood) {
    setActiveMoods((prev) => {
      const next = new Set(prev);
      next.has(mood) ? next.delete(mood) : next.add(mood);
      return next;
    });
  }

  function handleFiles(e) {
    Array.from(e.target.files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages((prev) => [...prev, { name: file.name, src: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removeImage(i) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function sendMessage() {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) {
      window.alert('텍스트나 이미지를 입력해주세요.');
      return;
    }
    setStatus('loading');
    setResult(null);
    const payload = { text: trimmed || null, imageUrl: images.length > 0 ? images[0].src : null };
    setText('');
    setImages([]);

    try {
      const data = await fullRecommend(payload);
      setResult(data);
      // 추천이 끝나면 백엔드가 "{감정} 감정 추천" 플레이리스트를 자동으로 만들어 저장하므로
      // 사이드바/플레이리스트 목록이 새로고침 없이 바로 반영되도록 알림
      if (data?.tracks?.length) bump();

      // 분석 중 애니메이션이 뚝 끊기지 않도록, 완료 표시를 잠깐 보여준 뒤에 리스트를 띄움
      setStatus('finishing');
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => setStatus('done'), 700);
    } catch (e) {
      setErrorMsg(e.status === 401 ? '로그인이 필요합니다. 다시 로그인해주세요.' : (e.message || '추천 실패'));
      setStatus('error');
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  }

  function handlePlayTrack(t, allTracks) {
    playTrack(t, allTracks);
  }

  return (
    <>
      <div className="sync-hero">
        <span className="sync-logo">🎵</span>
        <div className="sync-title">Sync AI</div>
        <div className="sync-subtitle">지금 기분, 상황, 활동을 알려주세요.<br />AI가 당신만을 위한 완벽한 음악을 추천해드립니다.</div>

        <div className="sync-input-area">
          <textarea
            placeholder={"예: '비 오는 날 카페에서 공부할 때 듣기 좋은 음악'\nCtrl+Enter 로 전송"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="sync-attach-btn" title="이미지 첨부" onClick={() => fileInputRef.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
          <button className="sync-send-btn" title="전송" onClick={sendMessage}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
          </button>
        </div>

        {images.length > 0 && (
          <div className="sync-image-previews">
            {images.map((img, i) => (
              <div className="sync-img-preview" key={i}>
                <img src={img.src} alt={img.name} title={img.name} />
                <button className="sync-img-remove" title="제거" onClick={() => removeImage(i)}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="sync-mood-pills">
          {SYNC_MOODS.map((m) => (
            <button key={m} className={`mood-pill ${activeMoods.has(m) ? 'active' : ''}`} onClick={() => toggleMood(m)}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title" style={{ fontSize: 18 }}>✨ 추천 결과</h2></div>
        <div id="sync-results">
          {status === 'idle' && !isLoggedIn && (
            <div className="ai-response">
              <div className="ai-response-header">
                <div className="ai-icon">🤖</div>
                <div><div className="ai-name">Sync AI</div></div>
              </div>
              <p className="ai-text">로그인하면 AI 음악 추천을 받아볼 수 있어요.</p>
            </div>
          )}

          {(status === 'loading' || status === 'finishing') && (
            <div className="ai-response">
              <div className="ai-response-header">
                <div className={`ai-icon ${status === 'finishing' ? 'sync-check-pop' : ''}`}>
                  {status === 'finishing' ? '✓' : '🤖'}
                </div>
                <div>
                  <div className="ai-name">Sync AI</div>
                  {status === 'finishing' && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>분석 완료!</div>
                  )}
                </div>
              </div>
              {status === 'loading' ? (
                <div className="sync-loading-stage">
                  <div className="sync-orb">
                    <div className="sync-orb-ring"></div>
                    <div className="sync-orb-ring ring2"></div>
                    <div className="sync-orb-core">🎧</div>
                  </div>
                  <div className="sync-analyzing">
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                    <div className="eq-bar"></div>
                  </div>
                  <span className="sync-loading-text">
                    감정을 분석하고 있어요
                    <span className="sync-dots"><span></span><span></span><span></span></span>
                  </span>
                </div>
              ) : (
                <p className="ai-text">당신만을 위한 음악을 준비했어요 🎶</p>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="ai-response">
              <div className="ai-response-header">
                <div className="ai-icon">⚠️</div>
                <div><div className="ai-name">오류 발생</div></div>
              </div>
              <p className="ai-text" style={{ color: 'var(--negative)' }}>{errorMsg}</p>
            </div>
          )}

          {status === 'done' && result && (
            <div className="sync-results-enter">
              <SyncResults result={result} currentTrack={currentTrack} isPlaying={isPlaying} onPlay={handlePlayTrack} />
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header"><h2 className="section-title" style={{ fontSize: 18 }}>📊 내 청취 패턴 분석</h2></div>
        <div style={{ background: 'var(--bg-mid)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
            <div style={{ background: 'rgba(30,215,96,.1)', border: '1px solid rgba(30,215,96,.2)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--accent)' }}>K-Pop</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>가장 많이 들음</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>68%</div>
            </div>
            <div style={{ background: 'rgba(83,157,245,.1)', border: '1px solid rgba(83,157,245,.2)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--info)' }}>Lo-Fi</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>집중할 때</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>18%</div>
            </div>
            <div style={{ background: 'rgba(255,164,43,.1)', border: '1px solid rgba(255,164,43,.2)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--warning)' }}>인디</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>감성 충전</div>
              <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>14%</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SyncResults({ result, currentTrack, isPlaying, onPlay }) {
  const em = result.emotion || {};
  const conf = em.confidence ? Math.round(em.confidence * 100) : 0;
  const [tracks, setTracks] = useState(() => (result.tracks || []).map(syncTrackToApp));

  // Last.fm 태그로만 찾은 곡은 앨범아트/재생시간/미리듣기가 비어있는 경우가 많아
  // iTunes로 한 번 더 보강 (Home 차트와 동일한 패턴)
  useEffect(() => {
    const base = (result.tracks || []).map(syncTrackToApp);
    setTracks(base);
    let cancelled = false;

    const needsArt = base.map((t, i) => ({ t, i })).filter(({ t }) => !t.albumArt || !t.previewUrl);
    if (needsArt.length === 0) return;

    (async () => {
      const results = await Promise.all(needsArt.map(({ t }) => fetchItunesTrack(`${t.name} ${t.artist}`)));
      if (cancelled) return;
      setTracks((prev) => {
        const updated = [...prev];
        needsArt.forEach(({ i }, ri) => {
          const it = results[ri];
          if (!it) return;
          updated[i] = {
            ...updated[i],
            albumArt: updated[i].albumArt || it.albumArt,
            previewUrl: updated[i].previewUrl || it.previewUrl,
            durationMs: updated[i].durationMs || it.durationMs,
            album: updated[i].album || it.albumName,
          };
        });
        return updated;
      });
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <>
      <div className="ai-response">
        <div className="ai-response-header">
          <div className="ai-icon">🤖</div>
          <div>
            <div className="ai-name">Sync AI</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>감정 분석 완료</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
          <span style={{ background: 'var(--accent)', color: '#000', padding: '4px 14px', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 700 }}>
            {EMOTION_LABELS[em.primary] || em.primary || '-'}
          </span>
          {em.secondary && (
            <span style={{ background: 'rgba(255,255,255,.1)', padding: '4px 14px', borderRadius: 'var(--radius-full)', fontSize: 13 }}>
              {EMOTION_LABELS[em.secondary] || em.secondary}
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>신뢰도 {conf}%</span>
        </div>
        <p className="ai-text">감정 분석 결과를 바탕으로 {tracks.length}곡을 추천해드려요! 🎵</p>
      </div>

      {tracks.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div>추천할 트랙을 찾지 못했어요.<br />Last.fm / Spotify API Key를 확인하거나<br />다른 감정으로 다시 시도해보세요.</div>
        </div>
      ) : (
        tracks.map((t, i) => {
          const active = currentTrack && currentTrack._id === t._id;
          return (
            <div key={t._id} className="sync-track-rec" onClick={() => onPlay(t, tracks)} style={active ? { background: 'rgba(30,215,96,.08)' } : undefined}>
              {t.albumArt
                ? <img src={t.albumArt} onError={(e) => { e.target.style.display = 'none'; }} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                : <div className="track-art" style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🎵</div>}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.artist}{t.album ? ` · ${t.album}` : ''}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtMs(t.durationMs)}</span>
                {t.previewUrl ? (
                  <button className="ctrl-btn" style={{ color: 'var(--accent)' }} title="미리듣기" onClick={(e) => { e.stopPropagation(); onPlay(t, tracks); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      {active && isPlaying
                        ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                        : <path d="M8 5v14l11-7z" />}
                    </svg>
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>미리듣기 없음</span>
                )}
              </div>
            </div>
          );
        })
      )}

      {tracks.length > 0 && <AnalysisDetail emotion={em} />}
    </>
  );
}
