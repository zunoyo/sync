import { useEffect, useState } from 'react';
import { fetchFriendPlaylists } from '../api/friends';
import { fetchPlaylistTracks, serverTrackToApp } from '../api/playlists';
import { friendGradient, friendInitials } from '../api/friends';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';

export default function FriendDetailModal({ friend, onClose }) {
  const [playlists, setPlaylists] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [trackCache, setTrackCache] = useState({});
  const { playTrack } = usePlayer();
  const { openPicker } = usePlaylistPicker();

  useEffect(() => {
    if (!friend) return;
    setPlaylists(null);
    setExpanded(null);
    setTrackCache({});
    fetchFriendPlaylists(friend.id).then(setPlaylists).catch(() => setPlaylists([]));
  }, [friend]);

  if (!friend) return null;

  async function togglePlaylist(plId) {
    const next = expanded === plId ? null : plId;
    setExpanded(next);
    if (next && !trackCache[plId]) {
      try {
        const raw = await fetchPlaylistTracks(plId);
        setTrackCache((prev) => ({ ...prev, [plId]: raw.map(serverTrackToApp) }));
      } catch {
        setTrackCache((prev) => ({ ...prev, [plId]: [] }));
      }
    }
  }

  return (
    <div className="friend-modal-overlay">
      <div className="friend-modal-card">
        <div className="fdm-header">
          <div className={`fdm-avatar ${friendGradient(friend.id)}`}>{friendInitials(friend.name)}</div>
          <div>
            <div className="fdm-name">{friend.name || '친구'}</div>
          </div>
          <button className="fdm-close" onClick={onClose} title="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>
        <div className="fdm-playlists-wrap">
          <div className="fdm-section-label">공유한 플레이리스트</div>
          <div id="fdm-playlists">
            {playlists === null && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중...</div>
            )}
            {playlists && playlists.length === 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🎵</div>
                <div style={{ fontSize: 13 }}>공유한 플레이리스트가 없어요</div>
              </div>
            )}
            {playlists && playlists.map((pl) => {
              const isOpen = expanded === pl.id;
              const tracks = trackCache[pl.id] || [];
              return (
                <div className="fdm-playlist" key={pl.id}>
                  <div className="fdm-playlist-header" onClick={() => togglePlaylist(pl.id)}>
                    <div className={`fdm-playlist-art ${pl.gradient || 'grad-1'}`}>{pl.emoji || '🎵'}</div>
                    <div className="fdm-playlist-info">
                      <div className="fdm-playlist-name">{pl.playlistName}</div>
                      <div className="fdm-playlist-count">{isOpen ? `${tracks.length}곡` : '탭해서 보기'}</div>
                    </div>
                    <div className={`fdm-chevron ${isOpen ? 'open' : ''}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
                    </div>
                  </div>
                  <div className={`fdm-track-list ${isOpen ? 'open' : ''}`}>
                    {isOpen && tracks.length === 0 && (
                      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>곡이 없어요</div>
                    )}
                    {tracks.map((t, i) => (
                      <div className="fdm-track" key={t.trackDbId} onClick={() => playTrack(t, tracks)}>
                        <span className="fdm-track-num">{i + 1}</span>
                        {t.albumArt
                          ? <div className="fdm-track-art" style={{ overflow: 'hidden' }}><img src={t.albumArt} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                          : <div className="fdm-track-art grad-4">🎵</div>}
                        <div className="fdm-track-info">
                          <div className="fdm-track-name">{t.name}</div>
                          <div className="fdm-track-artist">{t.artist}</div>
                        </div>
                        <span className="fdm-track-dur">{t.duration}</span>
                        <button className="fdm-play-btn" title="내 플레이리스트에 저장" onClick={(e) => { e.stopPropagation(); openPicker(t, e.currentTarget); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                        </button>
                        <button className="fdm-play-btn" title="재생" onClick={(e) => { e.stopPropagation(); playTrack(t, tracks); onClose(); }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
