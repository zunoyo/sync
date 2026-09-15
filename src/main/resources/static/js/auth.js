/**
 * SOUNDWAVE — Auth Module (Spring Boot 버전)
 * localStorage 기반 인증 + 서버 세션 동기화
 */
const Auth = (() => {

  const DEMO_USER = {
    id:                0,
    username:          'soundwave',
    email:             'demo@soundwave.kr',
    display_name:      'SoundWave 사용자',
    profile_image_url: null,
    created_at:        '2024-01-01T00:00:00.000Z',
  };

  function readUsers() {
    try { return JSON.parse(localStorage.getItem('sw_users') || '[]'); }
    catch { return []; }
  }

  function writeUsers(arr) {
    localStorage.setItem('sw_users', JSON.stringify(arr));
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem('sw_user') || 'null'); }
    catch { return null; }
  }

  function isLoggedIn() { return !!getUser(); }
  function requireAuth() { return isLoggedIn(); }
  function redirectIfLoggedIn() {
    if (isLoggedIn()) window.location.replace('/');
  }

  /* ── 서버 세션 동기화 ────────────────────────────────
     SPA 로그인 성공 시 서버에도 세션을 생성합니다.
     /api/sync/** 등 서버 세션이 필요한 API 사용을 위해 필수.
  ─────────────────────────────────────────────────── */
  function _syncServerSession(email, password) {
    fetch('/api/users/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email, password: password })
    }).then(function(res) {
      if (res.ok) {
        console.log('[Auth] 서버 세션 생성 완료');
      } else {
        console.warn('[Auth] 서버 세션 생성 실패 - DB에 계정이 있는지 확인');
      }
    }).catch(function(e) {
      console.warn('[Auth] 서버 세션 동기화 오류:', e.message);
    });
  }

  /* ── 서버 세션 → 클라이언트 상태 동기화 ──────────────────
     Google/Naver 로그인은 서버 사이드 리다이렉트로 완료되므로
     이 브라우저의 localStorage에는 아무 기록도 남지 않는다.
     페이지 로드 시 이 함수로 서버 세션 상태를 항상 확인·동기화해서
     Auth.getUser()/isLoggedIn()이 로그인 방식과 무관하게
     항상 정확한 값을 반환하도록 만든다.
  ─────────────────────────────────────────────────────── */
  function syncWithServer() {
    return fetch('/api/users/me', { credentials: 'include' })
      .then(function(res) {
        if (res.ok) {
          return res.json().then(function(user) {
            localStorage.setItem('sw_user', JSON.stringify({
              id:                user.id,
              username:          user.username,
              email:             user.email,
              display_name:      user.displayName,
              profile_image_url: user.profileImageUrl,
              created_at:        user.createdAt,
            }));
          });
        }
        // 세션 없음/만료 → 로컬 상태도 함께 정리 (남아있던 이전 로그인 정보 방지)
        localStorage.removeItem('sw_user');
      })
      .catch(function(e) {
        console.warn('[Auth] 서버 세션 동기화 실패:', e.message);
      });
  }

  /* ── 로그인 ──────────────────────────────────────── */
  function login(email, password) {
    // 데모 계정
    if (email === DEMO_USER.email && password === 'demo1234') {
      localStorage.setItem('sw_user', JSON.stringify(DEMO_USER));
      _syncServerSession(email, password); // ✅ 서버 세션 동기화
      return { ok: true };
    }

    // 일반 계정 (localStorage)
    const users = readUsers();
    const found = users.find(u => u.email === email && u.password === password);
    if (!found) {
      return { ok: false, msg: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    const { password: _pw, ...safe } = found;
    localStorage.setItem('sw_user', JSON.stringify(safe));
    _syncServerSession(email, password); // ✅ 서버 세션 동기화
    return { ok: true };
  }

  /* ── 회원가입 ────────────────────────────────────── */
  function signup({ username, email, password, displayName }) {
    if (!username || !email || !password) {
      return { ok: false, msg: '모든 필드를 입력해주세요.' };
    }
    if (email === DEMO_USER.email) {
      return { ok: false, msg: '이미 사용 중인 이메일입니다.' };
    }

    const users = readUsers();
    if (users.find(u => u.email === email)) {
      return { ok: false, msg: '이미 사용 중인 이메일입니다.' };
    }
    if (users.find(u => u.username === username)) {
      return { ok: false, msg: '이미 사용 중인 사용자명입니다.' };
    }

    const newUser = {
      id:                Date.now(),
      username,
      email,
      password,
      display_name:      displayName || username,
      profile_image_url: null,
      created_at:        new Date().toISOString(),
    };

    writeUsers([...users, newUser]);
    return { ok: true };
  }

  /* ── 로그아웃 ────────────────────────────────────── */
  function logout() {
    localStorage.removeItem('sw_user');
    // 서버 세션도 제거
    fetch('/api/users/logout', {
      method: 'POST',
      credentials: 'include'
    }).catch(function() {});
    window.location.replace('/');
  }

  /* ── 프로필 수정 ─────────────────────────────────── */
  function updateUser(updates) {
    const user = getUser();
    if (!user) return;
    const updated = { ...user, ...updates };
    localStorage.setItem('sw_user', JSON.stringify(updated));

    if (user.id !== DEMO_USER.id) {
      const users = readUsers();
      const idx   = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...updates };
        writeUsers(users);
      }
    }
  }

  function changePassword(currentPw, newPw) {
    const user = getUser();
    if (!user) return { ok: false, msg: '로그인 정보가 없습니다.' };
    if (user.id === DEMO_USER.id) {
      return { ok: false, msg: '데모 계정은 비밀번호를 변경할 수 없습니다.' };
    }

    const users  = readUsers();
    const stored = users.find(u => u.id === user.id);
    if (!stored || stored.password !== currentPw) {
      return { ok: false, msg: '현재 비밀번호가 올바르지 않습니다.' };
    }

    updateUser({ password: newPw });
    return { ok: true };
  }

  return {
    getUser, isLoggedIn, requireAuth, redirectIfLoggedIn,
    login, signup, logout, updateUser, changePassword, syncWithServer,
  };
})();
