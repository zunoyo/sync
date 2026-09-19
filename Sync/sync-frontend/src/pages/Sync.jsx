import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useLibrary } from '../context/LibraryContext';
import { EMOTION_LABELS, SYNC_MOODS, arLabel, fetchEmotionHistory, fmtMs, fullRecommend, sendFeedback, syncTrackToApp, vaLabel } from '../api/sync';
import { fetchItunesTrack } from '../api/itunes';
import AnalysisDetail from '../components/SyncAnalysis';

/* 최근 분석 기록(원시 리스트)에서 통계만 뽑아냄 — 개별 항목을 다시 보여주는 게 아니라
   "요즘 나는 어떤 감정으로 음악을 찾았나"를 한눈에 보여주는 요약 */
function computeEmotionStats(history) {
  if (!history || history.length === 0) return null;
  const counts = {};
  let confSum = 0, confN = 0;
  let vSum = 0, aSum = 0, vaN = 0;
  history.forEach((h) => {
    if (h.primaryEmotion) counts[h.primaryEmotion] = (counts[h.primaryEmotion] || 0) + 1;
    if (h.confidence != null) { confSum += h.confidence; confN++; }
    if (h.valence != null && h.arousal != null) { vSum += h.valence; aSum += h.arousal; vaN++; }
  });
  const breakdown = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    total: history.length,
    breakdown,
    avgConfidence: confN ? confSum / confN : null,
    avgValence: vaN ? vSum / vaN : null,
    avgArousal: vaN ? aSum / vaN : null,
  };
}

export default function Sync() {
  const { isLoggedIn } = useAuth();
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { bump } = useLibrary();
  const [text, setText] = useState('');
  const [images, setImages] = useState([]); // { name, src(base64) } — 서버로는 첫 장만 전송
  const [activeMoods, setActiveMoods] = useState(new Set());
  const [status, setStatus] = useState('idle'); // idle | loading | finishing | error | done
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null); // { emotion, tracks, historyId }
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [history, setHistory] = useState([]); // 통계 계산용 원시 기록 (개별 항목은 화면에 노출 안 함)
  const fileInputRef = useRef(null);
  const finishTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(finishTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) { setHistory([]); return; }
    let cancelled = false;
    fetchEmotionHistory().then((list) => { if (!cancelled) setHistory(list || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isLoggedIn]);

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
    setFeedbackSent(false);
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
      fetchEmotionHistory().then(setHistory).catch(() => {});
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

  async function handleFeedback(val) {
    if (!result?.historyId || feedbackSent) return;
    setFeedbackSent(true);
    try {
      await sendFeedback(result.historyId, val);
      window.alert(val === 1 ? '👍 피드백 감사합니다!' : '👎 더 좋은 추천을 위해 노력할게요!');
    } catch {
      /* no-op */
    }
  }

  const orbState = status === 'loading' ? ' state-loading' : (status === 'finishing' || status === 'done') ? ' state-done' : '';
  const captionActive = status === 'loading' || status === 'finishing' || status === 'done';
  const captionText =
    status === 'loading' ? '감정을 분석하고 있어요' :
    status === 'finishing' ? '분석 완료' :
    status === 'error' ? errorMsg :
    '지금 기분이나 상황을 알려주세요';

  return (
    <div className="sync-center-col">
      <div className="page-eyebrow">Sync AI</div>

      <div className={`sync-flare-hero${orbState}`} id="sync-flare-hero">
        <div className="sync-flare-glow"></div>
        <div className="sync-orbit"></div>
        <div className="sync-orbit ring2"></div>
        <div className="sync-flare-core"></div>
      </div>
      <p className={`orb-caption${captionActive ? ' active' : ''}`}>{captionText}</p>

      <div className="composer">
        <div className="prompt-box">
          <textarea
            id="sync-textarea"
            placeholder="예: 비 오는 날 카페에서 공부할 때 듣기 좋은 음악"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="prompt-actions">
            <button className="attach-btn" title="이미지 첨부" onClick={() => fileInputRef.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
            <button className="send-btn" title="전송 (Ctrl+Enter)" onClick={sendMessage}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
            </button>
          </div>
        </div>

        {images.length > 0 && (
          <div className="img-previews">
            {images.map((img, i) => (
              <div className="img-chip" key={i}>
                <img src={img.src} alt={img.name} title={img.name} />
                <button className="rm" title="제거" onClick={() => removeImage(i)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mood-chips">
        {SYNC_MOODS.map((m) => (
          <button key={m} className={`mood-chip ${activeMoods.has(m) ? 'active' : ''}`} onClick={() => toggleMood(m)}>
            {m}
          </button>
        ))}
      </div>

      <div id="sync-results" style={{ width: '100%' }}>
        {status === 'idle' && !isLoggedIn && (
          <div className="result-area" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>
            로그인하면 AI 음악 추천을 받아볼 수 있어요.
          </div>
        )}

        {status === 'idle' && isLoggedIn && history.length > 0 && (
          <EmotionStats stats={computeEmotionStats(history)} />
        )}

        {status === 'idle' && isLoggedIn && history.length === 0 && (
          <div className="result-area" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0', fontSize: 13 }}>
            기분이나 상황을 적거나 사진을 올려보세요 — Sync AI가 어울리는 음악을 찾아드려요.
          </div>
        )}

        {(status === 'loading' || status === 'finishing') && (
          <div className="result-area">
            <div className="sync-loading-stage">
              <div className="sync-loading-visual">
                <div className="sync-loading-orb">
                  <div className="sync-loading-orb-ring"></div>
                  <div className="sync-loading-orb-ring ring2"></div>
                  <div className="sync-loading-orb-core">🎧</div>
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
              </div>
              <span className="sync-loading-text">
                {status === 'finishing' ? '분석 완료' : '감정을 분석하고 있어요'}
                <span className="sync-dots"><span></span><span></span><span></span></span>
              </span>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="result-area" style={{ textAlign: 'center', color: 'var(--negative)', padding: '20px 0' }}>
            {errorMsg}
          </div>
        )}

        {status === 'done' && result && (
          <SyncResults
            result={result}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlay={handlePlayTrack}
            onFeedback={handleFeedback}
            feedbackSent={feedbackSent}
          />
        )}
      </div>

      <div className="stats-strip">오늘 <b>2,847</b>명이 Sync AI로 음악을 발견했어요</div>
    </div>
  );
}

function EmotionStats({ stats }) {
  if (!stats || stats.breakdown.length === 0) return null;
  const top = stats.breakdown[0];
  const topLabel = EMOTION_LABELS[top[0]] || top[0];
  const confPct = stats.avgConfidence != null ? Math.round(stats.avgConfidence * 100) : null;

  return (
    <div className="result-area sync-stats">
      <div className="sync-stats-title">최근 감정 분석 통계</div>
      <div className="sync-stats-summary">
        최근 <b>{stats.total}번</b> 분석했고, 그중 <b>{topLabel}</b>이(가) <b>{top[1]}번</b>으로 가장 많았어요.
        {stats.avgValence != null && (
          <> 전반적으로 <b>{vaLabel(stats.avgValence)}</b>이고 <b>{arLabel(stats.avgArousal)}</b>인 감정이 많았어요.</>
        )}
      </div>
      <div className="sync-stats-bars">
        {stats.breakdown.map(([emotion, count]) => {
          const pct = Math.round((count / stats.total) * 100);
          const label = EMOTION_LABELS[emotion] || emotion;
          return (
            <div className="sync-stats-row" key={emotion}>
              <span className="sync-stats-emoji">{label.slice(0, 2)}</span>
              <span className="sync-stats-label">{label.replace(/^[^\s]+\s/, '')}</span>
              <span className="sync-stats-bar-track"><span className="sync-stats-bar-fill" style={{ width: `${pct}%` }} /></span>
              <span className="sync-stats-count">{count}</span>
            </div>
          );
        })}
      </div>
      {confPct != null && <div className="sync-stats-conf">평균 분석 신뢰도 {confPct}%</div>}
    </div>
  );
}

function SyncResults({ result, currentTrack, isPlaying, onPlay, onFeedback, feedbackSent }) {
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

  if (tracks.length === 0) {
    return (
      <div className="result-area sync-results-enter" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
        <div>추천할 트랙을 찾지 못했어요.<br />Last.fm / Spotify API Key를 확인하거나<br />다른 감정으로 다시 시도해보세요.</div>
      </div>
    );
  }

  return (
    <div className="result-area sync-results-enter">
      <div className="result-meta">
        <div className="result-emotion">{EMOTION_LABELS[em.primary] || em.primary || '-'}</div>
        {em.secondary && <div className="result-secondary">{EMOTION_LABELS[em.secondary] || em.secondary}</div>}
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
              {t.previewUrl ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  {active && isPlaying
                    ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    : <path d="M8 5v14l11-7z" />}
                </svg>
              ) : (
                <span style={{ fontSize: 10 }}>미리듣기 없음</span>
              )}
            </div>
          </div>
        );
      })}

      {result.historyId && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(245,238,240,.1)' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', alignSelf: 'center' }}>이 추천이 마음에 드셨나요?</span>
          <button
            disabled={feedbackSent}
            onClick={(e) => { e.stopPropagation(); onFeedback(1); }}
            style={{ background: 'rgba(217,192,143,.15)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '6px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, cursor: feedbackSent ? 'default' : 'pointer', fontFamily: 'var(--font)', opacity: feedbackSent ? 0.5 : 1 }}
          >👍 좋아요</button>
          <button
            disabled={feedbackSent}
            onClick={(e) => { e.stopPropagation(); onFeedback(0); }}
            style={{ background: 'rgba(245,238,240,.06)', border: '1px solid rgba(245,238,240,.15)', color: 'var(--text-secondary)', padding: '6px 16px', borderRadius: 'var(--radius-full)', fontSize: 13, cursor: feedbackSent ? 'default' : 'pointer', fontFamily: 'var(--font)', opacity: feedbackSent ? 0.5 : 1 }}
          >👎 별로예요</button>
        </div>
      )}

      <AnalysisDetail emotion={em} />
    </div>
  );
}
