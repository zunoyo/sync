import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as SpotifyPlayer from '../api/spotifyPlayer';
import { searchSpotifyId } from '../api/spotifySearch';
import { recordPlayHistory, getLastPlayed } from '../api/playHistory';
import { fetchItunesTrack } from '../api/itunes';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const PlayerContext = createContext(null);

/**
 * 재생 우선순위 (원본 player.js와 동일):
 *   ① Spotify Web Playback SDK (연동 + Premium 계정일 때 — 전체 재생)
 *   ② previewUrl(HTML5 Audio, 30초 미리듣기)
 *   ③ 재생 불가 — "지금 재생 중" 표시만 갱신
 */
export function PlayerProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const showToast = useToast();

  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio();
  const useSpotifyRef = useRef(false); // 현재 재생 경로 (동기적으로 필요한 곳에 사용)
  const currentTrackIdRef = useRef(null); // Spotify SDK 준비 대기 재시도 시, 그 사이 다른 곡으로 안 바뀌었는지 확인용

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // seconds
  const [duration, setDuration] = useState(0); // seconds
  const [volume, setVolumeState] = useState(65);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState('nowplaying');
  const [isUsingSpotify, setIsUsingSpotify] = useState(false);
  const [isLiked, setIsLiked] = useState(false); // 재생바/우측패널 하트 — 원본처럼 서버에 저장되지 않는 표시용 토글

  // Spotify SDK 초기화 — 로그인 상태가 되면 한 번 시도 (연동 안 돼있으면 내부에서 조용히 종료)
  useEffect(() => {
    if (!isLoggedIn) return;

    SpotifyPlayer.onProgress((pct, posMs, durMs) => {
      if (!useSpotifyRef.current) return;
      setProgress(posMs / 1000);
      setDuration(durMs / 1000);
    });
    SpotifyPlayer.onStateChange(({ paused }) => {
      if (!useSpotifyRef.current) return;
      setIsPlaying(!paused);
    });
    SpotifyPlayer.onPremiumError(() => {
      showToast(
        <>
          🎵 Spotify Premium이 필요해요.{' '}
          <a href="https://www.spotify.com/premium/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>업그레이드</a>
          {' '}| 지금은 30초 미리듣기로 재생됩니다.
        </>,
        8000,
      );
    });

    SpotifyPlayer.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  // 로그인 상태가 되면(최초 로드 포함) 계정의 마지막 재생곡을 플레이어 바에 복원
  // — 자동재생은 하지 않고 일시정지 상태로 트랙 정보만 표시, 재생 버튼을 누르면 playTrack이 이어서 처리
  useEffect(() => {
    if (!isLoggedIn) return;
    if (currentTrackIdRef.current) return; // 이미 이번 세션에서 뭔가 재생/선택된 상태면 덮어쓰지 않음

    let cancelled = false;
    (async () => {
      const last = await getLastPlayed();
      if (cancelled || !last || currentTrackIdRef.current) return;

      const enriched = await fetchItunesTrack(`${last.trackName} ${last.artistName || ''}`.trim());
      if (cancelled || currentTrackIdRef.current) return;

      const restored = {
        _id: 'restored-last-track',
        name: last.trackName,
        artist: last.artistName || '',
        album: enriched?.albumName || '',
        albumArt: enriched?.albumArt || null,
        previewUrl: enriched?.previewUrl || null,
        durationMs: enriched?.durationMs || null,
        spotifyId: last.spotifyTrackId || null,
      };
      currentTrackIdRef.current = restored._id;
      setCurrentTrack(restored);
      setDuration(restored.durationMs ? restored.durationMs / 1000 : 0);
      setProgress(0);
      setIsPlaying(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume / 100;

    const onTime = () => { if (!useSpotifyRef.current) setProgress(audio.currentTime); };
    const onLoaded = () => { if (!useSpotifyRef.current) setDuration(audio.duration || 0); };
    const onEnded = () => {
      if (useSpotifyRef.current) return;
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play();
      } else {
        nextTrack();
      }
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRepeat, queueIndex, queue]);

  async function playTrack(track, trackQueue = null) {
    if (!track) return;
    if (trackQueue) {
      setQueue(trackQueue);
      setQueueIndex(trackQueue.findIndex((t) => t._id === track._id || t.id === track.id));
    }
    setCurrentTrack(track);
    currentTrackIdRef.current = track._id || track.id;
    setProgress(0);

    recordPlayHistory({
      spotifyTrackId: track.spotifyId || track.id || track._id || '',
      trackName: track.name || '',
      artistName: track.artist || '',
      source: track.source || 'playback',
    });

    const audio = audioRef.current;
    audio.pause();
    useSpotifyRef.current = false;
    setIsUsingSpotify(false);

    // ① Spotify SDK — 준비돼 있으면 전체 재생
    if (SpotifyPlayer.isReady()) {
      let sid = track.spotifyId;
      if (!sid && track.name) {
        sid = await searchSpotifyId(track.name, track.artist || '');
        if (sid) track.spotifyId = sid; // 다음 재생을 위해 캐시
      }
      if (sid) {
        const ok = await SpotifyPlayer.play(sid);
        if (ok) {
          useSpotifyRef.current = true;
          setIsUsingSpotify(true);
          setIsPlaying(true);
          return;
        }
      }
    }

    // ② previewUrl (HTML5 Audio)
    if (track.previewUrl) {
      audio.src = track.previewUrl;
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      // 재생 가능한 소스가 없음 — "지금 재생 중" 표시만 갱신
      setIsPlaying(false);
      setDuration(track.durationMs ? track.durationMs / 1000 : 0);
    }

    // 실제 Spotify ID가 붙어 있는 트랙(예: 플레이리스트에 저장된 곡)인데 SDK로는 못 튼 경우 안내
    if (track.spotifyId) {
      if (!SpotifyPlayer.isConnected()) {
        showToast(
          <>
            🎵 전체 재생하려면 Spotify 연동이 필요해요.{' '}
            <a href="/api/spotify/connect" style={{ color: 'var(--accent)' }}>연동하기</a>
          </>,
          8000,
        );
      } else if (!SpotifyPlayer.isPremiumError() && !SpotifyPlayer.isReady()) {
        // 연동은 됐지만 SDK 초기화가 아직 끝나지 않음 — 잠시 후 자동 재시도
        waitForSpotifyAndRetry(track, trackQueue, 5);
      }
    }
  }

  function waitForSpotifyAndRetry(track, trackQueue, attemptsLeft) {
    if (attemptsLeft <= 0) return;
    setTimeout(() => {
      const stillCurrent = currentTrackIdRef.current === (track._id || track.id);
      if (!stillCurrent) return; // 그 사이 다른 곡을 재생하기 시작했으면 재시도 취소
      if (SpotifyPlayer.isReady()) {
        playTrack(track, trackQueue);
      } else {
        waitForSpotifyAndRetry(track, trackQueue, attemptsLeft - 1);
      }
    }, 1000);
  }

  function togglePlay() {
    if (!currentTrack) return;
    if (useSpotifyRef.current) {
      isPlaying ? SpotifyPlayer.pause() : SpotifyPlayer.resume();
      setIsPlaying((p) => !p);
      return;
    }
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else if (audio.src) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      // 로그인 시 복원된 마지막 재생곡처럼 아직 실제 재생원이 로드되지 않은 경우
      // playTrack의 재생 우선순위(Spotify SDK → previewUrl)를 그대로 태워 처음부터 재생 시작
      playTrack(currentTrack, queue.length ? queue : null);
    }
  }

  function nextTrack() {
    if (!queue.length) return;
    let nextIdx;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = (queueIndex + 1) % queue.length;
    }
    setQueueIndex(nextIdx);
    playTrack(queue[nextIdx]);
  }

  function prevTrack() {
    if (!queue.length) return;
    const prevIdx = (queueIndex - 1 + queue.length) % queue.length;
    setQueueIndex(prevIdx);
    playTrack(queue[prevIdx]);
  }

  function seek(sec) {
    setProgress(sec);
    if (useSpotifyRef.current) {
      SpotifyPlayer.seekMs(sec * 1000);
    } else {
      audioRef.current.currentTime = sec;
    }
  }

  function setVolume(v) {
    setVolumeState(v);
    audioRef.current.volume = v / 100;
    SpotifyPlayer.setVolume(v);
  }

  const value = {
    currentTrack,
    isPlaying,
    progress,
    duration,
    volume,
    isShuffle,
    isRepeat,
    queue,
    queueIndex,
    isPanelOpen,
    panelTab,
    setPanelTab,
    isUsingSpotify,
    isLiked,
    toggleLike: () => setIsLiked((l) => !l),
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    toggleShuffle: () => setIsShuffle((s) => !s),
    toggleRepeat: () => setIsRepeat((r) => !r),
    togglePanel: () => setIsPanelOpen((o) => !o),
    openPanel: () => setIsPanelOpen(true),
    closePanel: () => setIsPanelOpen(false),
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer는 PlayerProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
