import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { artistColor, fetchArtistDetail, fetchArtistDetailById } from '../api/artist';
import { fetchSavedArtists, fetchSavedAlbums, saveArtist, unsaveArtist, saveAlbum, unsaveAlbum } from '../api/savedLibrary';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';

// 넘치는 글자만 좌우로 흐르게 하는 한 줄 텍스트 (hover=true면 마우스를 올렸을 때만 이동)
function Marquee({ text, className = '', hover = false }) {
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return undefined;
    const measure = () => {
      const over = Math.ceil(inner.scrollWidth - wrap.clientWidth);
      if (over > 2) {
        wrap.classList.add('is-marq');
        wrap.style.setProperty('--mq-dist', `-${over}px`);
        wrap.style.setProperty('--mq-time', `${Math.max(6, over / 25 + 3)}s`);
      } else {
        wrap.classList.remove('is-marq');
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div ref={wrapRef} className={`ad-marq${hover ? ' hover' : ''} ${className}`} title={text}>
      <span ref={innerRef} className="ad-marq-in">{text}</span>
    </div>
  );
}

export default function ArtistDetail() {
  const { name } = useParams();
  // 관련 아티스트 등에서 /artist/A → /artist/B 로 바로 이동할 때는 같은 라우트라
  // 컴포넌트가 그대로 재사용될 수 있음 — key로 강제 리마운트해서 항상 새로 불러오게 함
  return <ArtistDetailInner key={name} />;
}

function ArtistDetailInner() {
  const { name } = useParams();
  const location = useLocation();
  const artistName = decodeURIComponent(name);
  const knownExternalId = location.state?.externalId || null;
  const { playTrack, currentTrack } = usePlayer();
  const { openPicker } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const { bump } = useLibrary();
  const showToast = useToast();

  const [data, setData] = useState(null); // { image, externalId, bio, albums, flatTracks }
  const [savedArtistEntry, setSavedArtistEntry] = useState(null); // 저장된 항목(id) 또는 null
  const [savedAlbumIds, setSavedAlbumIds] = useState(new Map()); // externalId(String) -> saved-entry id
  const [artistBusy, setArtistBusy] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false); // 백드롭 사진이 실제로 디코딩 끝났는지 — 페이드인 트리거용
  const [selectedAlbumId, setSelectedAlbumId] = useState(null); // 우측에 트랙을 보여줄 앨범 (null이면 첫 앨범)

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const load = knownExternalId ? fetchArtistDetailById(knownExternalId, artistName) : fetchArtistDetail(artistName);
    load.then((d) => { if (!cancelled) setData(d); });
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
  }, [artistName, isLoggedIn, knownExternalId]);

  // 백드롭 사진 프리로드 — data.image가 생기는 즉시 opacity:1로 렌더하면 이미지가
  // 실제로 로드되는 순간 뚝 끊기듯 나타나서 느리게 느껴짐. 디코딩이 끝난 뒤에만
  // bgLoaded를 켜서 opacity 트랜지션으로 부드럽게 페이드인시킨다.
  useEffect(() => {
    setBgLoaded(false);
    if (!data?.image) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setBgLoaded(true); };
    img.src = data.image;
    return () => { cancelled = true; };
  }, [data?.image]);

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

  const color = artistColor(artistName);
  const flatTracks = data?.flatTracks || [];
  const albums = data?.albums || [];
  const totalMin = Math.floor(flatTracks.reduce((s, t) => s + t.durationMs, 0) / 60000);
  const selAlbum = albums.find((a) => String(a.id) === String(selectedAlbumId)) || albums[0] || null;
  const selMin = selAlbum ? Math.floor(selAlbum.tracks.reduce((s, t) => s + t.durationMs, 0) / 60000) : 0;
  const selSaved = selAlbum ? savedAlbumIds.has(String(selAlbum.id)) : false;
  const following = !!savedArtistEntry;

  return (
    <>
      <div className="ad-hero">
        {data?.image && (
          <div
            className={`ad-hero-bg${bgLoaded ? ' is-visible' : ''}`}
            style={{ backgroundImage: `url(${data.image})` }}
          />
        )}
        <div className="ad-hero-inner">
          <div className="ad-art" style={{ background: color }}>
            {data?.image
              ? <img src={data.image} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
              : '🎤'}
          </div>
          <div className="ad-hero-main">
            <div className="ad-eyebrow">ARTIST</div>
            <h1 className="ad-name" title={artistName}>{artistName}</h1>
            <div className="ad-sub">
              {data ? (data.bio || `${flatTracks.length}곡 · ${totalMin}분`) : '불러오는 중...'}
            </div>
            <div className="ad-actions">
              <button className={`ad-follow${following ? ' saved' : ''}`} onClick={toggleArtistSave} disabled={artistBusy}>
                {following ? '✓ 팔로잉' : '＋ 팔로우'}
              </button>
              <button
                className="ad-play"
                title="아티스트 전체 재생"
                disabled={!flatTracks.length}
                onClick={() => flatTracks.length && playTrack(flatTracks[0], flatTracks)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </button>
            </div>
          </div>
          {data && (
            <div className="ad-stats">
              <div><b>{albums.length}</b><span>앨범</span></div>
              <div><b>{flatTracks.length}</b><span>곡</span></div>
              <div><b>{totalMin}</b><span>분</span></div>
            </div>
          )}
        </div>
      </div>

      {!data && <div className="ad-empty">곡 불러오는 중...</div>}
      {data && flatTracks.length === 0 && <div className="ad-empty">곡 정보를 찾을 수 없어요</div>}

      {data && selAlbum && (
        <div className="ad-body">
          <div className="ad-albums">
            <div className="ad-albums-title">ALBUMS · {albums.length}</div>
            {albums.map((album) => (
              <div
                key={album.id}
                className={`ad-album${String(album.id) === String(selAlbum.id) ? ' active' : ''}`}
                onClick={() => setSelectedAlbumId(album.id)}
              >
                <div className="ad-album-art">
                  {album.art
                    ? <img src={album.art} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                    : '💿'}
                </div>
                <div className="ad-album-info">
                  <Marquee className="ad-album-name" text={album.name} hover />
                  <div className="ad-album-meta">{[album.year || '', `${album.tracks.length}곡`].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="ad-detail">
            <div className="ad-album-head">
              <div className="ad-cover">
                {selAlbum.art
                  ? <img src={selAlbum.art} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                  : '💿'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="ad-album-label">ALBUM</div>
                <Marquee className="ad-album-title" text={selAlbum.name} />
                <div className="ad-album-sub">
                  {[artistName, selAlbum.year || '', `${selAlbum.tracks.length}곡`, selMin ? `${selMin}분` : ''].filter(Boolean).join(' · ')}
                </div>
                <div className="ad-album-actions">
                  <button className="ad-btn primary" onClick={() => selAlbum.tracks.length && playTrack(selAlbum.tracks[0], selAlbum.tracks)}>▶ 전체 재생</button>
                  <button className={`ad-btn${selSaved ? ' saved' : ''}`} onClick={() => toggleAlbumSave(selAlbum)}>
                    {selSaved ? '✓ 보관함에 저장됨' : '+ 보관함'}
                  </button>
                </div>
              </div>
            </div>

            <div className="ad-tracks">
              {selAlbum.tracks.map((t, i) => (
                <div
                  key={t._id}
                  className={`ad-track${currentTrack && (currentTrack._id || currentTrack.id) === t._id ? ' playing' : ''}`}
                  onClick={() => playTrack(t, flatTracks)}
                >
                  <span className="num">{currentTrack && (currentTrack._id || currentTrack.id) === t._id ? '▶' : i + 1}</span>
                  <Marquee className="name" text={t.name} hover />
                  <button
                    className="add"
                    title="플레이리스트에 추가"
                    onClick={(e) => { e.stopPropagation(); openPicker(t, e.currentTarget); }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                  </button>
                  <span className="dur">{t.duration}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
