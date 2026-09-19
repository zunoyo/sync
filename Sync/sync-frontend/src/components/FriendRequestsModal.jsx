import { useEffect, useState } from 'react';
import { acceptFriendRequest, fetchFriendRequests, friendGradient, friendInitials, rejectFriendRequest } from '../api/friends';
import { useFriends } from '../context/FriendsContext';

export default function FriendRequestsModal({ onClose, onChanged }) {
  const [requests, setRequests] = useState(null);
  const { refreshCount } = useFriends();

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const list = await fetchFriendRequests();
      setRequests(list);
    } catch {
      setRequests([]);
    }
  }

  async function handleAccept(id) {
    try { await acceptFriendRequest(id); } catch { /* noop */ }
    await load();
    refreshCount();
    onChanged();
  }

  async function handleDecline(id) {
    try { await rejectFriendRequest(id); } catch { /* noop */ }
    await load();
    refreshCount();
  }

  const count = requests?.length ?? 0;

  return (
    <div className="friend-modal-overlay">
      <div className="friend-modal-card">
        <div className="frm-header">
          <div className="frm-title">{count ? `친구 요청 ${count}건` : '친구 요청'}</div>
          <button className="frm-close" onClick={onClose} title="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
          </button>
        </div>
        <div id="frm-list">
          {requests === null && (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중...</div>
          )}
          {requests && requests.length === 0 && (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-base)', marginBottom: 4 }}>모두 처리됐어요!</div>
              <div style={{ fontSize: 13 }}>새로운 친구 요청이 없어요</div>
            </div>
          )}
          {requests && requests.map((req) => {
            const u = req.user || {};
            const name = u.displayName || u.username || '알 수 없음';
            return (
              <div className="frm-item" key={req.id}>
                <div className={`frm-avatar ${friendGradient(u.id)}`}>{friendInitials(name)}</div>
                <div className="frm-info">
                  <div className="frm-name">{name}</div>
                  <div className="frm-meta">@{u.username || ''}</div>
                </div>
                <div className="frm-actions">
                  <button className="frm-accept" onClick={() => handleAccept(req.id)}>수락</button>
                  <button className="frm-decline" onClick={() => handleDecline(req.id)}>거절</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
