import { useState } from 'react';
import { sendFriendRequest } from '../api/friends';

export default function AddFriendModal({ onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSend() {
    const trimmed = value.trim();
    setError('');
    setSuccess('');
    if (!trimmed) { setError('사용자명 또는 이메일을 입력해주세요.'); return; }

    setBusy(true);
    try {
      await sendFriendRequest(trimmed);
      setSuccess('✅ 친구 요청을 보냈어요! 상대방이 수락하면 친구가 됩니다.');
      setTimeout(onClose, 1500);
    } catch {
      setError('해당 사용자를 찾을 수 없거나 이미 요청을 보냈어요.');
      setBusy(false);
    }
  }

  return (
    <div className="friend-modal-overlay">
      <div className="friend-modal-card friend-modal-card--sm">
        <div className="afm-body">
          <div className="afm-title">친구 추가</div>
          <div className="afm-subtitle">사용자명 또는 이메일로 친구를 찾아 요청을 보낼 수 있어요</div>
          {error && <div className="afm-error">{error}</div>}
          {success && <div className="afm-success">{success}</div>}
          <div className="afm-field">
            <label htmlFor="afm-input">사용자명 또는 이메일</label>
            <input
              id="afm-input" type="text" placeholder="예: soundwave_user 또는 user@email.com" autoComplete="off"
              value={value} onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
            />
          </div>
          <div className="afm-hint">💡 요청을 보내면 상대방이 수락해야 친구가 됩니다.</div>
          <button className="afm-btn" disabled={busy} onClick={handleSend}>
            {busy ? '요청 중...' : '친구 요청 보내기'}
          </button>
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button
              onClick={onClose}
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
