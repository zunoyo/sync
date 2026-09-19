import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePlayer } from './PlayerContext';

const LyricsContext = createContext(null);

const INTRO_PCT = 8; // 전주 구간 보정

function parseLrc(lrcText) {
  const result = [];
  for (const line of lrcText.split('\n')) {
    const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (!m) continue;
    const ms = (parseInt(m[1]) * 60 + parseInt(m[2])) * 1000 + parseInt(m[3].length === 2 ? m[3] : m[3].slice(0, 3));
    const text = m[4].trim();
    if (text) result.push({ ms, text });
  }
  return result;
}

export function LyricsProvider({ children }) {
  const { currentTrack, progress, duration, isUsingSpotify, panelTab, seek, openPanel, setPanelTab } = usePlayer();

  const [lines, setLines] = useState([]);       // string[]
  const [timedLines, setTimedLines] = useState([]); // {ms, text}[]
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | not-found | error
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  const trackKeyRef = useRef(null);

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

  async function fetchLyrics(track) {
    setStatus('loading');
    try {
      const q = new URLSearchParams({ artist_name: track.artist || '', track_name: track.name });
      const res = await fetch(`https://lrclib.net/api/get?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.syncedLyrics) {
          const timed = parseLrc(data.syncedLyrics);
          setTimedLines(timed);
          setLines(timed.map((t) => t.text));
          setLoaded(true);
          setStatus('done');
          return;
        }
        if (data?.plainLyrics) {
          setLines(data.plainLyrics.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60));
          setLoaded(true);
          setStatus('done');
          return;
        }
      }
    } catch { /* lrclib 실패 — 아래 lyrics.ovh 폴백으로 진행 */ }

    try {
      const artist = encodeURIComponent(track.artist || '');
      const title = encodeURIComponent(track.name);
      const res = await fetch(`https://api.lyrics.ovh/v1/${artist}/${title}`);
      const data = await res.json();
      if (data.lyrics) {
        const raw = data.lyrics;
        const hasKorean = /[\uAC00-\uD7A3]/.test(raw);
        const titleKorean = /[\uAC00-\uD7A3]/.test(track.name + (track.artist || ''));
        if (titleKorean && !hasKorean) { setStatus('not-found-ko'); return; }
        setLines(raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 60));
        setLoaded(true);
        setStatus('done');
      } else {
        setStatus('not-found');
      }
    } catch {
      setStatus('error');
    }
  }

  // 재생 위치에 따라 활성 줄 계산
  useEffect(() => {
    if (!loaded || !lines.length) return;
    const posMs = progress * 1000;

    if (timedLines.length > 0) {
      let idx = 0;
      for (let i = 0; i < timedLines.length; i++) {
        if (timedLines[i].ms <= posMs) idx = i; else break;
      }
      setActiveIndex(idx);
      return;
    }

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

  const value = { lines, activeIndex, status, loaded, scrollEnabled, toggleScroll, seekToLine, panelTab };

  return <LyricsContext.Provider value={value}>{children}</LyricsContext.Provider>;
}

export function useLyrics() {
  const ctx = useContext(LyricsContext);
  if (!ctx) throw new Error('useLyrics는 LyricsProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
