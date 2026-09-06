import { useState } from 'react';
import { createPlaylist, RANDOM_GRADIENT } from '../api/playlists';

const EMOJIS = ['🎵', '🎸', '🎤', '💜', '🔥', '🌙', '⭐', '🎧', '🚗', '📚', '💚', '❤️', '🎹', '🎺', '🎻', '🌊', '🏃', '🌅', '💎', '👑'];

export default function CreatePlaylistModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎵');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function reset() {
    setName('');
    setEmoji('🎵');
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { setError('플레이리스트 이름을 입력해주세요.'); return; }
    setBusy(true);
    setError('');
    try {
      const created = await createPlaylist({ playlistName: trimmed, emoji, gradient: RANDOM_GRADIENT() });
      reset();
      onCreated(created);
    } catch {
      setError('플레이리스트를 만들지 못했어요. 로그인 상태를 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="friend-modal-overlay">
      <div className="friend-modal-card friend-modal-card--sm">
        <div className="fdm-header">
          <div style={{ fontSize: 16, fontWeight: 900 }}>새 플레이리스트</div>
          <button className="fdm-close" onClick={handleClose} title="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>
        <div className="afm-body">
          {error && <div className="cpm-error">{error}</div>}
          <div className="afm-field">
            <label htmlFor="cpm-name">플레이리스트 이름</label>
            <input
              id="cpm-name" type="text" placeholder="예: 나의 K-Pop 모음" autoComplete="off"
              value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            />
          </div>
          <div className="afm-field">
            <label>이모지 선택</label>
            <div className="cpm-emoji-grid">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  className={`cpm-emoji-btn ${emoji === em ? 'active' : ''}`}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <button className="afm-btn" style={{ marginTop: 20 }} disabled={busy} onClick={handleCreate}>
            {busy ? '만드는 중...' : '만들기'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
