import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePlayer } from './PlayerContext';
import { albumColor, tintStyles } from '../utils/albumColor';

const LyricsContext = createContext(null);

const INTRO_PCT = 8; // 전주 구간 보정
const LYRIC_LEAD_MS = 0; // 눈에 보이는 하이라이트를 소리보다 약간 앞당기는 값(싱크가 늦게 느껴지면 키우고, 빠르면 줄이세요)

function parseLrc(lrcText) {
  const result = [];
  for (const line of lrcText.split('\n')) {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    // [mm:ss.xx] 의 xx 는 1/100초 → 3자리(ms)로 맞춘다. (예전에는 '50' 을 50ms 로 읽어 가사가 평균 0.5초 일찍 넘어갔다)
    const ms = (parseInt(m[1]) * 60 + parseInt(m[2])) * 1000 + parseInt(m[3].padEnd(3, '0').slice(0, 3));
    const text = m[4].trim();
    if (text) result.push({ ms, text });
  }
  return result;
}

export function LyricsProvider({ children }) {
  const { currentTrack, progress, duration, isPlaying, isUsingSpotify, panelTab, seek, openPanel, setPanelTab } = usePlayer();

  const [lines, setLines] = useState([]);       // string[]
  const [timedLines, setTimedLines] = useState([]); // {ms, text}[]
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | not-found | error
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const trackKeyRef = useRef(null);

  // 곡별 수동 싱크 보정 (+: 가사를 더 일찍 표시). lrclib 타임스탬프와 음원이 곡마다 조금씩 달라서 필요하다.
  const offsetKey = currentTrack ? `sync.lyricOffset:${currentTrack.name}|${currentTrack.artist || ''}` : null;
  const [offsetMs, setOffsetMs] = useState(0);
  useEffect(() => {
    let v = 0;
    try { v = offsetKey ? parseInt(localStorage.getItem(offsetKey) || '0', 10) || 0 : 0; } catch { /* 저장소 접근 불가 */ }
    setOffsetMs(v);
  }, [offsetKey]);
  function nudge(delta) {
    setOffsetMs((o) => {
      const n = delta === 0 ? 0 : Math.max(-5000, Math.min(5000, o + delta));
      try { if (offsetKey) { if (n === 0) localStorage.removeItem(offsetKey); else localStorage.setItem(offsetKey, String(n)); } } catch { /* 무시 */ }
      return n;
    });
  }

  // 앨범아트 대표색 → 가사 배경 CSS 변수
  const [tint, setTint] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setTint(null);
    albumColor(currentTrack?.albumArt).then((c) => { if (!cancelled) setTint(tintStyles(c)); });
    return () => { cancelled = true; };
  }, [currentTrack?.albumArt]);

  // 가사 크게 보기
  const [bigOpen, setBigOpen] = useState(false);

  // 트랙이 바뀌면 가사를 새로 불러옴
  useEffect(() => {
    const key = currentTrack ? `${currentTrack.name}__${currentTrack.artist || ''}` : null;
    if (key === trackKeyRef.current) return;
    trackKeyRef.current = key;

    setLines([]);
    setTimedLines([]);
    setLoaded(false);
    setActiveIndex(-1);

    if (!currentTrack?.name) { setStatus('idle'); return; }
    fetchLyrics(currentTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // 서버 프록시(/api/lyrics)가 lrclib → lyrics.ovh 순으로 대신 조회한다.
  // 브라우저에서 lrclib.net 을 직접 부르면 CORS/520 으로 실패하는 일이 잦았다.
  async function fetchLyrics(track) {
    setStatus('loading');
    try {
      const q = new URLSearchParams({ artist: track.artist || '', title: track.name });
      // 곡 길이(초)를 같이 보내 서버가 같은 제목의 다른 버전/다른 곡 가사를 걸러내게 한다
      if (track.durationMs) q.set('duration', String(Math.round(track.durationMs / 1000)));
      const res = await fetch(`/api/lyrics?${q}`);
      const data = res.ok ? await res.json() : null;
      // 요청 중에 곡이 바뀌었다면 결과를 버린다
      if (trackKeyRef.current !== `${track.name}__${track.artist || ''}`) return;

      if (data?.syncedLyrics) {
        const timed = parseLrc(data.syncedLyrics);
        setTimedLines(timed);
        setLines(timed.map((t) => t.text));
        setLoaded(true);
        setStatus('done');
      } else if (data?.plainLyrics) {
        setLines(data.plainLyrics.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60));
        setLoaded(true);
        setStatus('done');
      } else {
        setStatus(data?.status === 'not-found-ko' ? 'not-found-ko' : 'not-found');
      }
    } catch {
      setStatus('error');
    }
  }

  // Spotify 위치는 0.5초 간격으로만 갱신되므로 그 사이는 시계로 보간해서 줄이 늦게 넘어가지 않게 한다
  const anchorRef = useRef({ p: 0, t: 0 });
  useEffect(() => { anchorRef.current = { p: progress, t: performance.now() }; }, [progress]);
  useEffect(() => {
    if (!loaded || !timedLines.length || !isUsingSpotify) return undefined;
    const tick = () => {
      const a = anchorRef.current;
      const elapsed = isPlaying ? Math.min(performance.now() - a.t, 1200) : 0;
      const posMs = a.p * 1000 + elapsed + LYRIC_LEAD_MS + offsetMs;
      let idx = 0;
      for (let i = 0; i < timedLines.length; i++) {
        if (timedLines[i].ms <= posMs) idx = i; else break;
      }
      setActiveIndex((prev) => (prev === idx ? prev : idx));
    };
    tick();
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, [loaded, timedLines, isUsingSpotify, isPlaying, offsetMs]);

  // 재생 위치에 따라 활성 줄 계산
  useEffect(() => {
    if (!loaded || !lines.length) return;

    // 타임스탬프 가사 + Spotify 전체 재생은 아래 보간 effect 가 처리한다.
    // (iTunes 30초 미리듣기는 곡 중간 구간이라 타임스탬프와 맞지 않아 비율 추정으로 진행)
    if (timedLines.length > 0 && isUsingSpotify) return;

    // 타임스탬프 없는 가사 — 전체 곡 길이 대비 진행률로 추정 (iTunes 30초 미리듣기 보정 포함)
    const fullDurationSec = currentTrack?.durationMs ? currentTrack.durationMs / 1000 : duration;
    let effectivePct = fullDurationSec ? (progress / fullDurationSec) * 100 : 0;
    effectivePct = Math.min(100, effectivePct);

    const lyrPct = effectivePct <= INTRO_PCT ? 0 : ((effectivePct - INTRO_PCT) / (100 - INTRO_PCT)) * 100;
    const idx = Math.min(Math.floor((lines.length * lyrPct) / 100), lines.length - 1);
    setActiveIndex(Math.max(0, idx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, loaded, lines.length, timedLines, isUsingSpotify]);

  function toggleScroll() {
    setScrollEnabled((s) => {
      const next = !s;
      if (next) { openPanel(); setPanelTab('nowplaying'); }
      return next;
    });
  }

  function seekToLine(idx) {
    if (timedLines[idx]) {
      seek(timedLines[idx].ms / 1000);
      return;
    }
    const fullDurationSec = currentTrack?.durationMs ? currentTrack.durationMs / 1000 : duration;
    const target = (idx / Math.max(lines.length, 1)) * fullDurationSec;
    seek(Math.min(target, duration || target));
  }

  const hasTimed = timedLines.length > 0 && isUsingSpotify;
  const value = {
    lines, activeIndex, status, loaded, scrollEnabled, toggleScroll, seekToLine, panelTab,
    offsetMs, nudge, hasTimed, tint, bigOpen, openBig: () => setBigOpen(true), closeBig: () => setBigOpen(false),
  };

  return <LyricsContext.Provider value={value}>{children}</LyricsContext.Provider>;
}

export function useLyrics() {
  const ctx = useContext(LyricsContext);
  if (!ctx) throw new Error('useLyrics는 LyricsProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
