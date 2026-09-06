import { useEffect, useState } from 'react';
import { fetchFriends, friendGradient, friendInitials } from '../api/friends';
import { useFriends } from '../context/FriendsContext';
import FriendDetailModal from '../components/FriendDetailModal';
import AddFriendModal from '../components/AddFriendModal';
import FriendRequestsModal from '../components/FriendRequestsModal';

export default function Friends() {
  const [friends, setFriends] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const { requestCount, refreshCount } = useFriends();

  useEffect(() => {
    load();
    refreshCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const list = await fetchFriends();
      setFriends(list);
    } catch {
      setFriends([]);
    }
  }

  return (
    <>
      <div className="friends-header">
        <div>
          <div className="friends-title">친구</div>
          <div className="friends-subtitle">친구 목록을 클릭해 공유 플레이리스트를 확인하세요</div>
        </div>
        <div className="friends-header-actions">
          <button className="frm-open-btn" onClick={() => setShowRequests(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
            친구 요청
            {requestCount > 0 && <span className="frm-open-btn-badge">{requestCount}</span>}
          </button>
          <button className="pill-btn accent" onClick={() => setShowAdd(true)}>+ 친구 추가</button>
          <div className="friend-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input type="text" placeholder="친구 검색..." />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="friends-section-label">
          <span className="online-indicator" />
          <span>내 친구 {friends ? `(${friends.length})` : ''}</span>
        </div>
        <div className="friends-grid">
          {friends === null && (
            <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>불러오는 중...</div>
          )}
          {friends && friends.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
              <div style={{ fontSize: 14 }}>아직 친구가 없어요. "+ 친구 추가"로 시작해보세요.</div>
            </div>
          )}
          {friends && friends.map((f) => {
            const u = f.friend || {};
            const name = u.displayName || u.username || '알 수 없음';
            return (
              <div className="friend-card" key={f.id} onClick={() => setSelectedFriend({ id: u.id, name })}>
                <div className={`friend-avatar ${friendGradient(u.id)}`} style={{ color: '#000' }}>
                  {friendInitials(name)}
                </div>
                <div className="friend-info">
                  <div className="friend-name">{name}</div>
                  <div className="friend-status">@{u.username || ''}</div>
                </div>
                <svg className="friend-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {selectedFriend && <FriendDetailModal friend={selectedFriend} onClose={() => setSelectedFriend(null)} />}
      {showAdd && <AddFriendModal onClose={() => setShowAdd(false)} />}
      {showRequests && (
        <FriendRequestsModal onClose={() => setShowRequests(false)} onChanged={load} />
      )}
    </>
  );
}
