import { useEffect, useRef } from 'react';
import { usePlaylistPicker } from '../context/PlaylistPickerContext';

export default function PlaylistPickerPopover() {
  const { isOpen, rect, playlists, close, addTo, newName, setNewName, createAndAdd } = usePlaylistPicker();
  const popRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    function onOutside(e) {
      if (popRef.current && !popRef.current.contains(e.target)) close();
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEsc, true);
    return () => {
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onEsc, true);
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  let top = 96;
  let left = null;
  let right = 32;
  if (rect) {
    top = rect.bottom + 6;
    left = rect.right - 260;
    if (left < 8) left = 8;
    right = null;
    const maxTop = window.innerHeight - 260;
    if (top > maxTop) top = rect.top - 266;
  }

  return (
    <div
      ref={popRef}
      className="pl-picker-popover"
      style={{ position: 'fixed', top, left: left ?? undefined, right: right ?? undefined }}
    >
      <div className="pl-picker-header">플레이리스트에 추가</div>
      <div className="pl-picker-list">
        {playlists === null && '불러오는 중...'}
        {playlists && playlists.length === 0 && (
          <div className="pl-picker-empty">아직 만든 플레이리스트가 없어요</div>
        )}
        {playlists && playlists.map((pl) => (
          <button key={pl.id} className="pl-picker-item" onClick={() => addTo(pl.id)}>
            <span>{pl.playlistName}</span>
          </button>
        ))}
      </div>
      <div className="pl-picker-new">
        <input
          type="text"
          placeholder="새 플레이리스트 이름"
          maxLength={100}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd(); }}
        />
        <button onClick={createAndAdd}>만들기</button>
      </div>
    </div>
  );
}
