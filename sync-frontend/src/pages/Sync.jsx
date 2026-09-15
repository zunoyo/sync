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
  const [images, setImages] = useState([]);
  const [activeMoods, setActiveMoods] = useState(new Set());
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null);
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
    if (!trimmed && images.length === 0) return;
    setStatus('loading');
    setResult(null);
    const payload = { text: trimmed || null, imageUrl: images.length > 0 ? images[0].src : null };
    setText('');
    setImages([]);

    try {
      const data = await fullRecommend(payload);
      setResult(data);
      if (data?.tracks?.length) bump();
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

  const isLoading = status === 'loading' || status === 'finishing';
  const isDone = status === 'done';

  const orbCaption = isLoading
    ? '감정을 분석하고 있어요'
    : isDone
    ? '분석 완료'
    : status === 'error'
    ? errorMsg
    : isLoggedIn
    ? '지금 기분이나 상황을 알려주세요'
    : '로그인하면 AI 추천을 받을 수 있어요';

  return (
    <div className="sync-center-col">
      <div className="page-eyebrow">Sync AI</div>

      <div className={`sync-flare-hero${isLoading ? ' state-loading' : isDone ? ' state-done' : ''}`}>
        <div className="sync-flare-glow" />
        <div className="sync-orbit" />
        <div className="sync-orbit ring2" />
        <div className="sync-flare-core" />
      </div>

      <p className={`orb-caption${isLoading || isDone ? ' active' : ''}`}>{orbCaption}</p>

      <div className="composer">
        <div className="prompt-box">
          <textarea
            placeholder="예: 비 오는 날 카페에서 공부할 때 듣기 좋은 음악"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <div className="prompt-actions">
            <button className="attach-btn" title="이미지 첨부" onClick={() => fileInputRef.current?.click()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
            <button className="send-btn" title="전송 (Ctrl+Enter)" onClick={sendMessage} disabled={isLoading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>

        {images.length > 0 && (
          <div className="img-previews">
            {images.map((img, i) => (
              <div className="img-chip" key={i}>
                <img src={img.src} alt={img.name} />
                <button className="rm" onClick={() => removeImage(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mood-chips">
        {SYNC_MOODS.map((m) => (
          <button
            key={m}
            className={`mood-chip${activeMoods.has(m) ? ' active' : ''}`}
            onClick={() => toggleMood(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="result-area">
          <div className="sync-loading-stage">
            <span className="sync-loading-text">
              감정을 분석하고 있어요
              <span className="sync-dots"><span /><span /><span /></span>
            </span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="result-area" style={{ textAlign: 'center', color: 'var(--negative)', padding: '20px 0' }}>
          {errorMsg}
        </div>
      )}

      {isDone && result && (
        <div className="result-area sync-results-enter">
          <SyncResults result={result} currentTrack={currentTrack} isPlaying={isPlaying} onPlay={playTrack} />
        </div>
      )}

      <div className="stats-strip">
        오늘 <b>2,847</b>명이 Sync AI로 음악을 발견했어요
      </div>
    </div>
  );
}

function SyncResults({ result, currentTrack, isPlaying, onPlay }) {
  const em = result.emotion || {};
  const conf = em.confidence ? Math.round(em.confidence * 100) : 0;
  const [tracks, setTracks] = useState(() => (result.tracks || []).map(syncTrackToApp));

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

  if (tracks.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>
        추천할 트랙을 찾지 못했어요. 다른 감정으로 다시 시도해보세요.
      </div>
    );
  }

  return (
    <>
      <div className="result-meta">
        <div className="result-emotion">{EMOTION_LABELS[em.primary] || em.primary || '-'}</div>
        {em.secondary && (
          <div className="result-secondary">{EMOTION_LABELS[em.secondary] || em.secondary}</div>
        )}
        <div className="result-conf">{conf}% 신뢰도</div>
      </div>

      {tracks.map((t) => {
        const active = currentTrack && currentTrack._id === t._id;
        return (
          <div key={t._id} className="track-rec" onClick={() => onPlay(t, tracks)}>
            <div className="art">
              {t.albumArt
                ? <img src={t.albumArt} onError={(e) => { e.target.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 5 }} alt="" />
                : '🎵'}
            </div>
            <div className="main">
              <div className="name">{t.name}</div>
              <div className="artist">{t.artist}{t.album ? ` · ${t.album}` : ''}</div>
            </div>
            <div className="play">
              <span>{fmtMs(t.durationMs)}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                {active && isPlaying
                  ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  : <path d="M8 5v14l11-7z" />}
              </svg>
            </div>
          </div>
        );
      })}

      <AnalysisDetail emotion={em} />
    </>
  );
}
