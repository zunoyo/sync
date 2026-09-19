import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { artistColor, fetchArtistDetail, fetchArtistDetailById } from '../api/artist';
import { fetchSavedArtists, fetchSavedAlbums, saveArtist, unsaveArtist, saveAlbum, unsaveAlbum } from '../api/savedLibrary';
import { usePlayer } from '../context/PlayerContext';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';

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
  const { playTrack } = usePlayer();
  const { openPicker } = usePlaylistPicker();
  const { isLoggedIn } = useAuth();
  const { bump } = useLibrary();
  const showToast = useToast();

  const [data, setData] = useState(null); // { image, externalId, bio, albums, flatTracks }
  const [savedArtistEntry, setSavedArtistEntry] = useState(null); // 저장된 항목(id) 또는 null
  const [savedAlbumIds, setSavedAlbumIds] = useState(new Map()); // externalId(String) -> saved-entry id
  const [artistBusy, setArtistBusy] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false); // 백드롭 사진이 실제로 디코딩 끝났는지 — 페이드인 트리거용
  const [openAlbums, setOpenAlbums] = useState(() => new Set()); // 트랙 목록이 펼쳐진 앨범 id들

  function toggleAlbumOpen(albumId) {
    setOpenAlbums((prev) => {
      const next = new Set(prev);
      if (next.has(albumId)) next.delete(albumId); else next.add(albumId);
      return next;
    });
  }

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
  const totalMin = Math.floor(flatTracks.reduce((s, t) => s + t.durationMs, 0) / 60000);

  return (
    <>
      <div style={{
        background: `linear-gradient(180deg,${color} 0%,#1a1a1a 100%)`,
        padding: '40px 32px 32px', position: 'relative', borderRadius: '16px 16px 0 0', margin: '-24px -24px 0',
        overflow: 'hidden',
      }}>
        {data?.image && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${data.image})`, backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(60px) brightness(.4) saturate(1.5)', transform: 'scale(1.1)',
            opacity: bgLoaded ? 1 : 0, transition: 'opacity .5s ease',
          }} />
        )}
        {data?.image && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(165deg, rgba(156,20,87,.55) 0%, rgba(60,0,40,.45) 55%, transparent 100%)' }} />
        )}
        <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{
            width: 140, height: 140, borderRadius: '50%', flexShrink: 0, background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56,
            boxShadow: '0 8px 32px rgba(0,0,0,.5)', overflow: 'hidden',
          }}>
            {data?.image
              ? <img src={data.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : '🎤'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,.7)', marginBottom: 6, textTransform: 'uppercase' }}>아티스트</div>
            <div style={{ fontSize: 'clamp(28px,4vw,60px)', fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 10 }}>{artistName}</div>
            {data?.bio && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', maxWidth: 440, marginBottom: 4 }}>{data.bio}</div>
            )}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)' }}>
              {data ? `${flatTracks.length}곡 · ${totalMin}분` : '불러오는 중...'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 24 }}>
          <button
            onClick={() => flatTracks.length && playTrack(flatTracks[0], flatTracks)}
            disabled={!flatTracks.length}
            style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(217,192,143,.4)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#000"><path d="M8 5v14l11-7z" /></svg>
          </button>
          <button
            onClick={toggleArtistSave}
            disabled={artistBusy}
            title="아티스트 저장"
            style={{
              width: 36, height: 36, borderRadius: '50%', background: 'none',
              border: `1px solid ${savedArtistEntry ? 'var(--accent)' : 'rgba(255,255,255,.3)'}`,
              color: savedArtistEntry ? 'var(--accent)' : 'rgba(255,255,255,.7)',
              fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {savedArtistEntry ? '♥' : '♡'}
          </button>
        </div>
        </div>
      </div>

      {!data && (
        <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>곡 불러오는 중...</div>
      )}
      {data && flatTracks.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,.4)' }}>곡 정보를 찾을 수 없어요</div>
      )}

      {data && data.albums.map((album) => {
        const saved = savedAlbumIds.has(String(album.id));
        const isOpen = openAlbums.has(album.id);
        return (
          <div key={album.id} style={{ marginBottom: 32 }}>
            <div
              onClick={() => toggleAlbumOpen(album.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.07)', marginBottom: 4, cursor: 'pointer' }}
            >
              {album.art
                ? <img src={album.art} alt="" style={{ width: 56, height: 56, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                : <div style={{ width: 56, height: 56, borderRadius: 6, flexShrink: 0, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>💿</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{album.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 3 }}>{album.year || ''} · {album.tracks.length}곡</div>
              </div>
              <button
                className={`album-save-btn ${saved ? 'saved' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleAlbumSave(album); }}
                style={{
                  flexShrink: 0, background: 'none', border: `1px solid ${saved ? 'var(--accent)' : 'rgba(255,255,255,.3)'}`,
                  color: saved ? 'var(--accent)' : 'rgba(255,255,255,.7)', borderRadius: 50, padding: '6px 14px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {saved ? '✓ 저장됨' : '+ 저장'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleAlbumOpen(album.id); }}
                aria-label="트랙 펼치기/접기"
                style={{
                  flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: 'none',
                  border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .3s ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </div>

            <div style={{ overflow: 'hidden', maxHeight: isOpen ? 4000 : 0, transition: 'max-height .35s ease' }}>
            {album.tracks.map((t, i) => (
              <div
                key={t._id}
                onClick={() => playTrack(t, flatTracks)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
              >
                <span style={{ width: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,.4)', flexShrink: 0 }}>{i + 1}</span>
                {t.albumArtSm
                  ? <img src={t.albumArtSm} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{t.emoji}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); openPicker(t, e.currentTarget); }}
                  title="플레이리스트에 추가"
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
                </button>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.45)', flexShrink: 0 }}>{t.duration}</span>
              </div>
            ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
