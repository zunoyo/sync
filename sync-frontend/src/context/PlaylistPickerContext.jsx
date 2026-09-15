import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useLibrary } from './LibraryContext';
import { useAuthModal } from './AuthModalContext';
import { addTrackToPlaylist, createPlaylist, fetchPlaylists, RANDOM_GRADIENT } from '../api/playlists';

const PlaylistPickerContext = createContext(null);

export function PlaylistPickerProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const showToast = useToast();
  const { bump } = useLibrary();
  const { openAuthModal } = useAuthModal();

  const [track, setTrack] = useState(null);
  const [rect, setRect] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [newName, setNewName] = useState('');
  const cacheRef = useRef(null);

  const close = useCallback(() => {
    setTrack(null);
    setRect(null);
    setPlaylists(null);
    setNewName('');
  }, []);

  const invalidateCache = useCallback(() => { cacheRef.current = null; }, []);

  const openPicker = useCallback(async (t, anchorEl) => {
    if (!t) return;
    if (!isLoggedIn) {
      openAuthModal('login');
      return;
    }
    const r = anchorEl?.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    setRect(r);
    setTrack(t);
    setPlaylists(null);

    if (!cacheRef.current) {
      try { cacheRef.current = await fetchPlaylists(); } catch { cacheRef.current = []; }
    }
    setPlaylists(cacheRef.current);
  }, [isLoggedIn, openAuthModal]);

  async function addTo(playlistId) {
    if (!track) return;
    try {
      await addTrackToPlaylist(playlistId, track);
      showToast('✅ 플레이리스트에 추가했어요');
    } catch (e) {
      if (e.status === 409) showToast('이미 추가된 곡이에요');
      else if (e.status === 401) showToast('로그인이 필요해요');
      else showToast('추가하지 못했어요');
    }
    close();
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createPlaylist({ playlistName: name, emoji: '🎵', gradient: RANDOM_GRADIENT() });
      invalidateCache();
      bump();
      await addTrackToPlaylist(created.id, track);
      showToast('✅ 플레이리스트에 추가했어요');
    } catch {
      showToast('플레이리스트를 만들지 못했어요');
    }
    close();
  }

  const value = { openPicker, close, invalidateCache, isOpen: !!track, track, rect, playlists, newName, setNewName, addTo, createAndAdd };

  return (
    <PlaylistPickerContext.Provider value={value}>
      {children}
    </PlaylistPickerContext.Provider>
  );
}

export function usePlaylistPicker() {
  const ctx = useContext(PlaylistPickerContext);
  if (!ctx) throw new Error('usePlaylistPicker는 PlaylistPickerProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
