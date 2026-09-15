import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchArtistDetail } from '../api/artist';
import { fetchSavedArtists, fetchSavedAlbums, saveArtist, unsaveArtist, saveAlbum, unsaveAlbum } from '../api/savedLibrary';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';

export default function ArtistDetail() {
  const { name } = useParams();
  const artistName = decodeURIComponent(name);
  const { playTrack } = usePlayer();
  const { openPicker } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const { bump } = useLibrary();
  const showToast = useToast();

  const [data, setData] = useState(null);
  const [savedArtistEntry, setSavedArtistEntry] = useState(null);
  const [savedAlbumIds, setSavedAlbumIds] = useState(new Map());
  const [artistBusy, setArtistBusy] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setSelectedAlbumId(null);
    fetchArtistDetail(artistName).then((d) => {
      if (cancelled) return;
      setData(d);
      if (d?.albums?.length) setSelectedAlbumId(d.albums[0].id);
    });
    if (isLoggedIn) {
      fetchSavedArtists().then((list) => {
        if (cancelled) return;
        const found = (list || []).find((a) => a.artistName === artistName);
        setSavedArtistEntry(found || null);
      }).catch(() => {});
      fetchSavedAlbums().then((list) => {
        if (cancelled) return;
        const map = new Map();
        (list || []).forEach((a) => map.set(String(a.albumExternalId), a.id));
        setSavedAlbumIds(map);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [artistName, isLoggedIn]);

  async function toggleArtistSave() {
    if (!isLoggedIn) { showToast('로그인이 필요해요'); return; }
    setArtistBusy(true);
    try {
      if (savedArtistEntry) {
        await unsaveArtist(savedArtistEntry.id);
        setSavedArtistEntry(null);
      } else {
        const saved = await saveArtist({ artistName, artistImageUrl: data?.image, artistExternalId: data?.externalId });
        setSavedArtistEntry(saved);
      }
      bump();
    } catch {
      showToast('처리하지 못했어요');
    } finally {
      setArtistBusy(false);
    }
  }

  async function toggleAlbumSave(album) {
    if (!isLoggedIn) { showToast('로그인이 필요해요'); return; }
    const key = String(album.id);
    const existingId = savedAlbumIds.get(key);
    try {
      if (existingId) {
        await unsaveAlbum(existingId);
        setSavedAlbumIds((prev) => { const next = new Map(prev); next.delete(key); return next; });
      } else {
        const saved = await saveAlbum({ albumExternalId: album.id, albumName: album.name, artistName: album.artistName, albumArtUrl: album.art, releaseYear: album.year });
        setSavedAlbumIds((prev) => new Map(prev).set(key, saved.id));
      }
      bump();
    } catch {
      showToast('처리하지 못했어요');
    }
  }

  const flatTracks = data?.flatTracks || [];
  const totalMin = Math.floor(flatTracks.reduce((s, t) => s + t.durationMs, 0) / 60000);
  const selectedAlbum = data?.albums?.find((a) => a.id === selectedAlbumId) ?? null;

  return (
    <>
      <div className="artist-hero">
        <div className="artist-hero-bg" style={{ backgroundImage: data?.image ? `url(${data.image})` : undefined }} />
        <div className="artist-hero-content">
          <div className="artist-hero-art">
            {data?.image
              ? <img src={data.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : '🎤'}
          </div>
          <div className="artist-hero-meta">
            <div className="artist-hero-eyebrow">아티스트</div>
            <h1 className="artist-hero-name">{artistName}</h1>
            {data?.bio && <div className="artist-hero-bio">{data.bio}</div>}
            <div className="artist-hero-stats">
              {data ? `${flatTracks.length} TRACKS · ${totalMin} MIN` : '불러오는 중...'}
            </div>
            <div className="artist-hero-actions">
              <button
                className="artist-play-lg"
                onClick={() => flatTracks.length && playTrack(flatTracks[0], flatTracks)}
                disabled={!flatTracks.length}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </button>
              <button
                className={`artist-save-btn${savedArtistEntry ? ' saved' : ''}`}
                onClick={toggleArtistSave}
                disabled={artistBusy}
                title="아티스트 저장"
              >
                {savedArtistEntry ? '♥' : '♡'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {!data && (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>곡 불러오는 중...</div>
      )}
      {data && flatTracks.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>곡 정보를 찾을 수 없어요</div>
      )}

      {data && data.albums.length > 0 && (
        <div className="album-rail-wrap">
          <div className="album-rail-head">
            <div className="album-rail-title">앨범</div>
          </div>
          <div className="album-rail">
            {data.albums.map((album) => (
              <div
                key={album.id}
                className={`album-card${selectedAlbumId === album.id ? ' active' : ''}`}
                onClick={() => setSelectedAlbumId(album.id)}
              >
                <div className="album-card-art">
                  {album.art
                    ? <img src={album.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    : '💿'}
                </div>
                <div className="album-card-name">{album.name}</div>
                <div className="album-card-meta">{[album.year, album.tracks.length ? `${album.tracks.length}곡` : ''].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </div>

          {selectedAlbum && (
            <div className="selected-album">
              <div className="sel-album-head">
                <div className="sel-album-art">
                  {selectedAlbum.art
                    ? <img src={selectedAlbum.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    : '💿'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sel-album-name">{selectedAlbum.name}</div>
                  <div className="sel-album-meta">{[selectedAlbum.year, selectedAlbum.tracks.length ? `${selectedAlbum.tracks.length}곡` : ''].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="sel-album-actions">
                  <button
                    className={`sel-album-save-btn${savedAlbumIds.has(String(selectedAlbum.id)) ? ' saved' : ''}`}
                    onClick={() => toggleAlbumSave(selectedAlbum)}
                  >
                    {savedAlbumIds.has(String(selectedAlbum.id)) ? '✓ 저장됨' : '+ 저장'}
                  </button>
                </div>
              </div>

              {selectedAlbum.tracks.map((t, i) => (
                <div
                  key={t._id}
                  className="sel-track-row"
                  onClick={() => playTrack(t, flatTracks)}
                >
                  <span className="num">{i + 1}</span>
                  <div className="name">
                    {t.name}
                    <div style={{ fontSize: 11, color: 'rgba(245,238,240,.4)', marginTop: 1 }}>{t.artist}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openPicker(t, e.currentTarget); }}
                      title="플레이리스트에 추가"
                      style={{ background: 'none', border: 'none', color: 'rgba(245,238,240,.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                    </button>
                    <span className="dur">{t.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
