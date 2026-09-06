import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  changePassword, connectSpotifyUrl, deactivateAccount, deleteAccount,
  disconnectSpotify, fetchSpotifyStatus, updateProfile,
} from '../api/profile';

const NOTIF_KEY = 'sw_notifications';
const NOTIF_DEFAULTS = { newmusic: true, friends: true, email: false, sync: true };

export default function Profile() {
  const { user, refresh, isLoggedIn } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ displayName: '', username: '', email: '' });
  const [savingBasic, setSavingBasic] = useState(false);

  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);

  const [notif, setNotif] = useState(NOTIF_DEFAULTS);

  const [spotifyStatus, setSpotifyStatus] = useState(null); // null=loading, {connected,...}, 'error'

  useEffect(() => {
    if (user) {
      setForm({ displayName: user.displayName || '', username: user.username || '', email: user.email || '' });
    }
  }, [user]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
      setNotif((prev) => ({ ...prev, ...saved }));
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchSpotifyStatus().then(setSpotifyStatus).catch(() => setSpotifyStatus('error'));
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
        로그인 후 이용할 수 있어요.
      </div>
    );
  }

  const initials = (user?.displayName || user?.username || 'SW').slice(0, 2).toUpperCase();

  async function handleSaveBasic() {
    const displayName = form.displayName.trim();
    const username = form.username.trim();
    const email = form.email.trim();
    if (!displayName) { showToast('이름을 입력해주세요.'); return; }
    if (!username) { showToast('사용자명을 입력해주세요.'); return; }
    if (!email || !email.includes('@')) { showToast('올바른 이메일을 입력해주세요.'); return; }

    setSavingBasic(true);
    try {
      await updateProfile({ displayName, username, email });
      await refresh();
      showToast('프로필이 업데이트됐어요.');
    } catch (e) {
      showToast(e.data?.error || '업데이트에 실패했어요.');
    } finally {
      setSavingBasic(false);
    }
  }

  const pwStrong = /^(?=.*[a-zA-Z])(?=.*\d).{8,}/.test(pw.next);
  const pwHint = pw.next.length === 0
    ? { text: '영문, 숫자 포함 8자 이상', color: 'var(--text-muted)' }
    : pwStrong
      ? { text: '✅ 안전한 비밀번호예요', color: 'var(--accent)' }
      : { text: '❌ 영문과 숫자를 포함해 8자 이상 입력해주세요.', color: 'var(--negative)' };
  const pwMatchColor = pw.confirm.length > 0 ? (pw.next === pw.confirm ? 'var(--accent)' : 'var(--negative)') : undefined;

  async function handleChangePassword() {
    if (!pw.current) { showToast('현재 비밀번호를 입력해주세요.'); return; }
    if (pw.next.length < 8) { showToast('새 비밀번호는 8자 이상이어야 해요.'); return; }
    if (pw.next !== pw.confirm) { showToast('새 비밀번호가 일치하지 않아요.'); return; }
    if (pw.current === pw.next) { showToast('현재 비밀번호와 동일해요.'); return; }

    setSavingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      showToast('비밀번호가 변경됐어요.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      showToast(e.data?.error || '비밀번호 변경에 실패했어요.');
    } finally {
      setSavingPw(false);
    }
  }

  function saveNotifications() {
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notif));
    showToast('알림 설정이 저장됐어요.');
  }

  async function handleDeactivate() {
    if (!window.confirm('계정을 비활성화하면 로그아웃되며 재로그인 전까지 서비스를 이용할 수 없어요.\n계속하시겠어요?')) return;
    try {
      await deactivateAccount();
      showToast('계정이 비활성화됐어요.');
      await refresh();
      navigate('/');
    } catch {
      showToast('처리 중 오류가 발생했어요.');
    }
  }

  async function handleDelete() {
    const input = window.prompt(
      '계정 삭제는 되돌릴 수 없어요.\n모든 플레이리스트, 친구 목록, 데이터가 영구 삭제됩니다.\n\n삭제하려면 이메일 주소를 입력해주세요:'
    );
    if (!input) return;
    if (input.trim() !== user?.email) { showToast('이메일 주소가 일치하지 않아요.'); return; }

    try {
      await deleteAccount();
      showToast('계정이 삭제됐어요. 이용해주셔서 감사해요.');
      await refresh();
      navigate('/');
    } catch {
      showToast('처리 중 오류가 발생했어요.');
    }
  }

  return (
    <>
      <div className="profile-hero">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar" id="profile-avatar-display">
            {user?.profileImageUrl
              ? <img src={user.profileImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} />
              : initials}
          </div>
          <div className="profile-avatar-edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
          </div>
        </div>
        <div className="profile-info">
          <div className="profile-type">프로필</div>
          <div className="profile-name">{user?.displayName || user?.username || 'SoundWave 사용자'}</div>
          <div className="profile-stats">
            <div className="profile-stat"><span>28</span> 좋아요</div>
            <div className="profile-stat"><span>8</span> 플레이리스트</div>
            <div className="profile-stat"><span>6</span> 팔로잉</div>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="settings-section">
        <div className="settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
          기본 정보
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">이름</label>
            <input className="form-input" value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">사용자명</label>
            <input className="form-input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">이메일</label>
          <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <button className="btn-primary" disabled={savingBasic} onClick={handleSaveBasic}>
          {savingBasic ? '저장 중...' : '변경사항 저장'}
        </button>
      </div>

      {/* 비밀번호 변경 */}
      <div className="settings-section">
        <div className="settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>
          비밀번호 변경
        </div>
        <div className="form-group">
          <label className="form-label">현재 비밀번호</label>
          <input className="form-input" type="password" placeholder="현재 비밀번호 입력" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">새 비밀번호</label>
            <input className="form-input" type="password" placeholder="새 비밀번호 (8자 이상)" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
            <div className="form-hint" style={{ color: pwHint.color }}>{pwHint.text}</div>
          </div>
          <div className="form-group">
            <label className="form-label">새 비밀번호 확인</label>
            <input className="form-input" type="password" placeholder="새 비밀번호 재입력" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} style={pwMatchColor ? { borderColor: pwMatchColor } : undefined} />
          </div>
        </div>
        <button className="btn-primary" disabled={savingPw} onClick={handleChangePassword}>
          {savingPw ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>

      {/* Spotify 연동 */}
      <div className="settings-section">
        <div className="settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Spotify 연동
        </div>
        <SpotifyStatusSection
          status={spotifyStatus}
          onChanged={() => { setSpotifyStatus(null); fetchSpotifyStatus().then(setSpotifyStatus).catch(() => setSpotifyStatus('error')); }}
        />
      </div>

      {/* 알림 설정 */}
      <div className="settings-section">
        <div className="settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
          알림 설정
        </div>
        <ToggleRow label="신곡 알림" desc="팔로우한 아티스트의 새 음악" checked={notif.newmusic} onChange={(v) => setNotif((n) => ({ ...n, newmusic: v }))} />
        <ToggleRow label="친구 활동 알림" desc="친구가 음악을 공유하거나 팔로우할 때" checked={notif.friends} onChange={(v) => setNotif((n) => ({ ...n, friends: v }))} />
        <ToggleRow label="이메일 뉴스레터" desc="SoundWave 소식 및 추천" checked={notif.email} onChange={(v) => setNotif((n) => ({ ...n, email: v }))} />
        <ToggleRow label="Sync AI 추천 알림" desc="AI가 새로운 음악을 발견했을 때" checked={notif.sync} onChange={(v) => setNotif((n) => ({ ...n, sync: v }))} />
        <button className="btn-primary" style={{ marginTop: 8 }} onClick={saveNotifications}>설정 저장</button>
      </div>

      {/* 계정 관리 */}
      <div className="settings-section">
        <div className="settings-title" style={{ color: 'var(--negative)' }}>계정 관리</div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-danger" onClick={handleDeactivate}>계정 비활성화</button>
          <button className="btn-danger" onClick={handleDelete}>탈퇴하기</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          계정 삭제 시 모든 플레이리스트, 좋아요, 데이터가 영구적으로 삭제됩니다.
        </div>
      </div>
    </>
  );
}

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="toggle-row">
      <div>
        <div className="toggle-label">{label}</div>
        <div className="toggle-desc">{desc}</div>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

function SpotifyStatusSection({ status, onChanged }) {
  const showToast = useToast();

  if (status === null) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div>;
  }
  if (status === 'error') {
    return <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>상태를 불러올 수 없어요.</div>;
  }

  function connect() {
    window.location.href = connectSpotifyUrl();
  }

  async function disconnect() {
    if (!window.confirm('Spotify 연동을 해제할까요?')) return;
    try {
      await disconnectSpotify();
      onChanged();
    } catch {
      showToast('처리하지 못했어요');
    }
  }

  async function reconnect() {
    try { await disconnectSpotify(); } catch { /* noop */ }
    connect();
  }

  if (status.connected) {
    const expired = status.isExpired;
    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16,
        background: expired ? 'rgba(255,165,0,.08)' : 'rgba(30,215,96,.08)',
        border: `1px solid ${expired ? 'rgba(255,165,0,.3)' : 'rgba(30,215,96,.2)'}`, borderRadius: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: expired ? '#ffa500' : '#1ed760' }}>
            {expired ? '⚠ 토큰 만료' : '✅ 연동됨'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            @{status.spotifyUserId || ''}{expired ? ' · 재연동하면 전체 재생이 가능해요' : ' · 전체 재생 활성화'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {expired && (
            <button onClick={reconnect} style={{ background: '#1ed760', border: 'none', color: '#000', padding: '8px 16px', borderRadius: 50, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              재연동하기
            </button>
          )}
          <button onClick={disconnect} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.15)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 50, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            연동 해제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'var(--bg-mid)', borderRadius: 12, border: '1px solid rgba(255,255,255,.07)' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>연동 안 됨</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Premium 계정 연동 시 음악 전체 재생 가능</div>
      </div>
      <button onClick={connect} style={{ background: '#1ed760', border: 'none', color: '#000', padding: '8px 18px', borderRadius: 50, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Spotify 연동
      </button>
    </div>
  );
}
