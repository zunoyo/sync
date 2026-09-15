/**
 * SOUNDWAVE — 회원정보 페이지 모듈
 * 기본 정보 / 비밀번호 변경 / 알림 설정 / 계정 관리
 */
const ProfileModule = (() => {

  /* ── 토스트 알림 ── */
  function _toast(msg, type = 'success') {
    const colors = {
      success: { bg:'rgba(30,215,96,.15)', border:'rgba(30,215,96,.4)', icon:'✅' },
      error:   { bg:'rgba(243,114,127,.15)', border:'rgba(243,114,127,.4)', icon:'❌' },
      info:    { bg:'rgba(83,157,245,.15)',  border:'rgba(83,157,245,.4)',  icon:'ℹ️' },
    };
    const c = colors[type] || colors.info;
    const d = document.createElement('div');
    d.style.cssText =
      `position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;
       background:${c.bg};border:1px solid ${c.border};border-radius:12px;
       padding:12px 20px;font-size:13px;font-weight:600;color:var(--text-base);
       display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);
       white-space:nowrap;animation:fadeInUp .25s ease`;
    d.innerHTML = `<span>${c.icon}</span><span>${msg}</span>`;
    document.body.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; d.style.transition = 'opacity .3s'; setTimeout(() => d.remove(), 300); }, 3000);
  }

  /* ── 버튼 로딩 상태 ── */
  function _setLoading(btn, loading, text = '') {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.textContent = '처리 중...';
    } else {
      btn.textContent = text || btn.dataset.origText || btn.textContent;
    }
  }

  /* ── 프로필 페이지 채우기 (Auth 데이터 기반) ── */
  function populate() {
    const user = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
    if (!user) return;

    // 아바타
    const avatar = document.getElementById('profile-avatar-display');
    if (avatar) {
      if (user.profile_image_url) {
        avatar.innerHTML = `<img src="${user.profile_image_url}"
          style="width:100%;height:100%;object-fit:cover;border-radius:50%"
          onerror="this.parentElement.textContent='${(user.display_name||user.username||'SW').slice(0,2).toUpperCase()}'">`;
      } else {
        avatar.textContent = (user.display_name || user.username || 'SW').slice(0, 2).toUpperCase();
      }
    }

    // 프로필 이름
    const nameEl = document.querySelector('.profile-name');
    if (nameEl) nameEl.textContent = user.display_name || user.username || 'SoundWave 사용자';

    // 폼 채우기
    _setVal('f-name',     user.display_name || '');
    _setVal('f-username', user.username     || '');
    _setVal('f-email',    user.email        || '');

    // 알림 설정 복원 (localStorage)
    _loadNotifications();
  }

  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  /* ══ 기본 정보 저장 ══════════════════════════════════ */
  async function saveBasicInfo() {
    const btn         = document.querySelector('#page-profile .settings-section:nth-child(2) .btn-primary');
    const displayName = (document.getElementById('f-name')?.value || '').trim();
    const username    = (document.getElementById('f-username')?.value || '').trim();
    const email       = (document.getElementById('f-email')?.value || '').trim();

    if (!displayName) { _toast('이름을 입력해주세요.', 'error'); return; }
    if (!username)    { _toast('사용자명을 입력해주세요.', 'error'); return; }
    if (!email || !email.includes('@')) { _toast('올바른 이메일을 입력해주세요.', 'error'); return; }

    _setLoading(btn, true);
    try {
      const res  = await fetch('/api/users/me/profile', {
        method:  'PUT',
        headers: { 'Content-Type':'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName, username, email }),
      });
      const data = await res.json();

      if (res.ok) {
        // localStorage 동기화
        const stored = JSON.parse(localStorage.getItem('sw_user') || '{}');
        stored.display_name = displayName;
        stored.username     = username;
        stored.email        = email;
        localStorage.setItem('sw_user', JSON.stringify(stored));

        // 상단 바 갱신
        _refreshTopbar(displayName);

        _toast('프로필이 업데이트됐어요.', 'success');
        populate();
      } else {
        _toast(data.error || '업데이트에 실패했어요.', 'error');
      }
    } catch(e) {
      _toast('서버 연결에 실패했어요.', 'error');
    }
    _setLoading(btn, false, '변경사항 저장');
  }

  /* ══ 비밀번호 유효성 검사 ═══════════════════════════ */
  function validatePw() {
    const newPw  = document.getElementById('f-new-pw')?.value  || '';
    const newPw2 = document.getElementById('f-new-pw2')?.value || '';
    const hint   = document.getElementById('pw-hint');
    const input2 = document.getElementById('f-new-pw2');

    // 강도 체크
    const strong = /^(?=.*[a-zA-Z])(?=.*\d).{8,}/.test(newPw);
    if (hint) {
      hint.style.color = newPw.length === 0 ? 'var(--text-muted)'
                       : strong ? '#1ed760' : 'var(--negative)';
      hint.textContent = newPw.length === 0 ? '영문, 숫자 포함 8자 이상'
                       : strong ? '✅ 안전한 비밀번호예요'
                       : '❌ 영문과 숫자를 포함해 8자 이상 입력해주세요.';
    }

    // 일치 여부
    if (input2 && newPw2.length > 0) {
      input2.style.borderColor = (newPw === newPw2) ? '#1ed760' : 'var(--negative)';
    }
  }

  /* ══ 비밀번호 변경 ══════════════════════════════════ */
  async function changePassword() {
    const btn       = document.querySelector('#page-profile .settings-section:nth-child(3) .btn-primary');
    const curPw     = document.getElementById('f-cur-pw')?.value  || '';
    const newPw     = document.getElementById('f-new-pw')?.value  || '';
    const newPw2    = document.getElementById('f-new-pw2')?.value || '';

    if (!curPw)                         { _toast('현재 비밀번호를 입력해주세요.', 'error'); return; }
    if (newPw.length < 8)               { _toast('새 비밀번호는 8자 이상이어야 해요.', 'error'); return; }
    if (newPw !== newPw2)               { _toast('새 비밀번호가 일치하지 않아요.', 'error'); return; }
    if (curPw === newPw)                { _toast('현재 비밀번호와 동일해요.', 'error'); return; }

    _setLoading(btn, true);
    try {
      const res  = await fetch('/api/users/me/password', {
        method:  'PUT',
        headers: { 'Content-Type':'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const data = await res.json();

      if (res.ok) {
        // localStorage의 캐시 비밀번호 갱신 (BCrypt 저장은 하지 않음)
        const stored = JSON.parse(localStorage.getItem('sw_user') || '{}');
        stored.password = newPw;
        localStorage.setItem('sw_user', JSON.stringify(stored));

        _toast('비밀번호가 변경됐어요.', 'success');
        document.getElementById('f-cur-pw').value  = '';
        document.getElementById('f-new-pw').value  = '';
        document.getElementById('f-new-pw2').value = '';
        const hint = document.getElementById('pw-hint');
        if (hint) { hint.textContent = '영문, 숫자 포함 8자 이상'; hint.style.color = ''; }
      } else {
        _toast(data.error || '비밀번호 변경에 실패했어요.', 'error');
      }
    } catch(e) {
      _toast('서버 연결에 실패했어요.', 'error');
    }
    _setLoading(btn, false, '비밀번호 변경');
  }

  /* ══ 알림 설정 저장/복원 (localStorage) ════════════ */
  function saveNotifications() {
    const ids = ['notif-newmusic','notif-friends','notif-email','notif-sync'];
    const settings = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) settings[id] = el.checked;
    });
    localStorage.setItem('sw_notifications', JSON.stringify(settings));
    _toast('알림 설정이 저장됐어요.', 'success');
  }

  function _loadNotifications() {
    try {
      const saved = JSON.parse(localStorage.getItem('sw_notifications') || '{}');
      Object.entries(saved).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.checked = val;
      });
    } catch(e) {}
  }

  /* ══ 계정 비활성화 ══════════════════════════════════ */
  async function deactivateAccount() {
    const confirmed = confirm(
      '계정을 비활성화하면 로그아웃되며 재로그인 전까지 서비스를 이용할 수 없어요.\n계속하시겠어요?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/users/me/deactivate', {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) {
        localStorage.removeItem('sw_user');
        localStorage.removeItem('sw_users');
        _toast('계정이 비활성화됐어요.', 'info');
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch(e) { _toast('처리 중 오류가 발생했어요.', 'error'); }
  }

  /* ══ 계정 삭제 ═══════════════════════════════════════ */
  async function deleteAccount() {
    const input = prompt(
      '계정 삭제는 되돌릴 수 없어요.\n' +
      '모든 플레이리스트, 친구 목록, 데이터가 영구 삭제됩니다.\n\n' +
      '삭제하려면 이메일 주소를 입력해주세요:'
    );
    if (!input) return;

    const user = (typeof Auth !== 'undefined') ? Auth.getUser() : null;
    if (!user || input.trim() !== user.email) {
      _toast('이메일 주소가 일치하지 않아요.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/users/me', {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        localStorage.removeItem('sw_user');
        localStorage.removeItem('sw_users');
        localStorage.removeItem('sw_notifications');
        _toast('계정이 삭제됐어요. 이용해주셔서 감사해요.', 'info');
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch(e) { _toast('처리 중 오류가 발생했어요.', 'error'); }
  }

  /* ── 상단 바 갱신 헬퍼 ── */
  function _refreshTopbar(name) {
    const btn = document.getElementById('topbar-user-btn');
    if (btn) btn.textContent = (name || '').slice(0, 2).toUpperCase() || 'SW';
  }

  /* ── 전역 함수 등록 (index.mustache onclick 연결) ── */
  function init() {
    window.saveBasicInfo     = saveBasicInfo;
    window.validatePw        = validatePw;
    window.changePassword    = changePassword;
    window.saveNotifications = saveNotifications;
    window.deactivateAccount = deactivateAccount;
    window.deleteAccount     = deleteAccount;
  }

  return { init, populate };
})();
