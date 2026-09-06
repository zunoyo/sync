/**
 * SOUNDWAVE — Auth Modal
 *
 * 로그인/회원가입 모달을 제어합니다.
 * Auth 모듈(js/auth.js)에 의존합니다.
 *
 * 공개 API
 *   AuthModal.show(tab)       — 모달 표시 ('login' | 'signup')
 *   AuthModal.hide()          — 모달 닫기
 *   AuthModal.switchTab(tab)  — 탭 전환
 *   AuthModal.handleLogin()   — 로그인 처리
 *   AuthModal.handleSignup()  — 회원가입 처리
 *   AuthModal.quickDemo()     — 데모 계정으로 즉시 로그인
 *   AuthModal.init()          — 앱 시작 시 1회 호출
 */

const AuthModal = (() => {

  let currentTab = 'login';

  /* ── DOM 헬퍼 ── */
  const $ = (id) => document.getElementById(id);

  /* ══════════════ 표시 / 숨김 ══════════════ */

  function show(tab = 'login') {
    const el = $('auth-modal');
    if (el) el.classList.remove('hidden');
    switchTab(tab);
  }

  function hide() {
    const el = $('auth-modal');
    if (el) el.classList.add('hidden');
  }

  /* ══════════════ 탭 전환 ══════════════ */

  function switchTab(tab) {
    currentTab = tab;

    $('tab-login')?.classList.toggle('active', tab === 'login');
    $('tab-signup')?.classList.toggle('active', tab === 'signup');

    const lv = $('modal-login-view');
    const sv = $('modal-signup-view');
    if (lv) lv.style.display = tab === 'login'  ? 'block' : 'none';
    if (sv) sv.style.display = tab === 'signup' ? 'block' : 'none';

    _clearMessages();
  }

  /* ══════════════ 메시지 ══════════════ */

  function _clearMessages() {
    const err = $('modal-error');
    const suc = $('modal-success');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (suc) { suc.style.display = 'none'; suc.textContent = ''; }
  }

  function _showError(msg) {
    const el = $('modal-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _showSuccess(msg) {
    const el = $('modal-success');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  /* ══════════════ 로그인 ══════════════ */

  function handleLogin() {
    const email    = $('modal-login-email')?.value.trim();
    const password = $('modal-login-password')?.value;
    const btn      = $('modal-login-btn');

    _clearMessages();
    if (!email)    return _showError('이메일을 입력해주세요.');
    if (!password) return _showError('비밀번호를 입력해주세요.');

    if (btn) { btn.disabled = true; btn.textContent = '로그인 중...'; }

    setTimeout(async () => {
      // ① localStorage 먼저 시도 (SPA 계정)
      const localRes = Auth.login(email, password);
      if (localRes.ok) {
        // Auth.login() 내부의 서버 세션 생성(_syncServerSession)은 fire-and-forget이라
        // 여기서 명시적으로 한 번 더 기다려준다. 이걸 안 기다리고 바로 새로고침하면
        // 새로고침이 세션 쿠키가 실제로 저장되기 전에 진행 중이던 요청을 끊어버려서,
        // 로그인 직후인데도 새로 뜬 페이지가 "로그인 안 된 상태"로 보이는 문제가 있었다.
        try {
          await fetch('/api/users/login', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password }),
          });
        } catch (e) {
          console.warn('[AuthModal] 서버 세션 동기화 대기 중 오류:', e.message);
        }
        _onSuccess();
        return;
      }

      // ② 서버 DB 확인 (BCrypt 해시 비교 — 폼 가입 / DB 직접 계정)
      try {
        const serverRes = await fetch('/api/users/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        if (serverRes.ok) {
          const user = await serverRes.json();
          // localStorage 동기화 (이후 로컬 로그인 가능)
          const userData = {
            id:                user.id,
            username:          user.username,
            email:             user.email,
            password:          password,
            display_name:      user.displayName || user.display_name || user.username,
            profile_image_url: user.profileImageUrl || null,
            created_at:        user.createdAt    || new Date().toISOString(),
          };
          const users = JSON.parse(localStorage.getItem('sw_users') || '[]');
          const idx   = users.findIndex(u => u.email === email);
          if (idx >= 0) users[idx] = userData;
          else          users.push(userData);
          localStorage.setItem('sw_users', JSON.stringify(users));
          const { password: _pw, ...safe } = userData;
          localStorage.setItem('sw_user', JSON.stringify(safe));
          _onSuccess();
        } else {
          _showError('이메일 또는 비밀번호가 올바르지 않습니다.');
          if (btn) { btn.disabled = false; btn.textContent = '로그인'; }
        }
      } catch(e) {
        _showError('서버 연결에 실패했어요. 잠시 후 다시 시도해주세요.');
        if (btn) { btn.disabled = false; btn.textContent = '로그인'; }
      }
    }, 400);
  }

  function quickDemo() {
    const e = $('modal-login-email');
    const p = $('modal-login-password');
    if (e) e.value = 'demo@soundwave.kr';
    if (p) p.value = 'demo1234';
    handleLogin();
  }

  /* ══════════════ 회원가입 ══════════════ */

  function handleSignup() {
    const displayName = $('modal-su-display')?.value.trim();
    const username    = $('modal-su-username')?.value.trim();
    const email       = $('modal-su-email')?.value.trim();
    const password    = $('modal-su-password')?.value;
    const password2   = $('modal-su-password2')?.value;
    const agree       = $('modal-su-agree')?.checked;
    const btn         = $('modal-signup-btn');

    _clearMessages();

    if (!username || !/^[a-zA-Z0-9_]{2,20}$/.test(username))
      return _showError('사용자명: 영문, 숫자, _ 조합 2~20자');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return _showError('올바른 이메일 주소를 입력해주세요.');
    if (password.length < 8)
      return _showError('비밀번호는 8자 이상이어야 합니다.');
    if (password !== password2)
      return _showError('비밀번호가 일치하지 않습니다.');
    if (!agree)
      return _showError('이용약관에 동의해주세요.');

    if (btn) { btn.disabled = true; btn.textContent = '가입 중...'; }

    // ── 서버 DB 저장 후 localStorage + 세션 동기화 ──────────
    // Auth.signup() 은 localStorage 전용이므로 서버 API 를 먼저 호출
    (async () => {
      try {
        // ① 서버 DB 에 계정 저장 (BCrypt 해싱 포함)
        const signupRes = await fetch('/api/users/signup', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username,
            email,
            password,
            displayName: displayName || username,
          }),
        });

        if (signupRes.status === 409) {
          _showError('이미 사용 중인 이메일 또는 사용자명입니다.');
          if (btn) { btn.disabled = false; btn.textContent = '회원가입'; }
          return;
        }
        if (!signupRes.ok) {
          _showError('회원가입 중 오류가 발생했어요. 다시 시도해주세요.');
          if (btn) { btn.disabled = false; btn.textContent = '회원가입'; }
          return;
        }

        // ② 서버 세션 로그인 (Spotify OAuth 등 서버 세션 필요한 기능에 필수)
        await fetch('/api/users/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });

        // ③ localStorage 도 동기화 (SPA 상태 유지)
        Auth.signup({ username, email, password, displayName });
        Auth.login(email, password);

        _showSuccess('✅ 회원가입 완료!');

        // ④ Spotify 연동 프롬프트 표시
        setTimeout(() => _showSpotifyPrompt(), 400);

      } catch (e) {
        console.error('[AuthModal] 회원가입 오류:', e);
        _showError('서버 연결에 실패했어요. 잠시 후 다시 시도해주세요.');
        if (btn) { btn.disabled = false; btn.textContent = '회원가입'; }
      }
    })();
  }

  /* ── Spotify 연동 프롬프트 ─────────────────────────────── */
  function _showSpotifyPrompt() {
    const lv = $('modal-login-view');
    const sv = $('modal-signup-view');
    if (lv) lv.style.display = 'none';
    if (sv) sv.style.display = 'none';
    _clearMessages();

    let prompt = $('spotify-signup-prompt');
    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = 'spotify-signup-prompt';
      const card = document.querySelector('.auth-modal-card');
      if (card) card.appendChild(prompt);
    }

    prompt.style.cssText = 'padding:8px 0 4px';
    prompt.innerHTML = `
      <div style="text-align:center;padding:16px 0 20px">
        <div style="font-size:28px;margin-bottom:12px">🎵</div>
        <div style="font-size:17px;font-weight:900;margin-bottom:8px">Spotify 연동</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:24px">
          Premium 계정을 연동하면<br>음악을 전체 재생할 수 있어요.
        </div>
        <button onclick="try{localStorage.setItem('sw_spotify_redirect','1')}catch(e){}; window.location.href='/api/spotify/connect'"
                style="width:100%;background:#1ed760;border:none;color:#000;
                       padding:13px;border-radius:50px;font-size:13px;font-weight:700;
                       cursor:pointer;font-family:inherit;margin-bottom:10px">
          Spotify 연동하기
        </button>
        <button onclick="AuthModal._skipSpotify()"
                style="width:100%;background:none;border:1px solid rgba(255,255,255,.15);
                       color:var(--text-secondary);padding:11px;border-radius:50px;
                       font-size:13px;cursor:pointer;font-family:inherit">
          나중에 하기
        </button>
        <div style="font-size:11px;color:var(--text-muted);margin-top:14px">
          Premium이 없어도 30초 미리듣기는 가능해요
        </div>
      </div>`;
    prompt.style.display = 'block';
  }

  function _skipSpotify() {
    hide();
    _refreshTopbar();
    if (typeof ProfilePage !== 'undefined') ProfilePage.populate();
  }

  /* ══════════════ 비밀번호 유효성 (회원가입 탭) ══════════════ */

  function validateUsername(input) {
    const v  = input.value;
    const ok = /^[a-zA-Z0-9_]{2,20}$/.test(v);
    const el = $('modal-hint-username');
    if (!el) return;
    if (!v)       { el.textContent = '';                          el.className = 'auth-field-hint'; }
    else if (!ok) { el.textContent = '영문, 숫자, _ 2~20자';     el.className = 'auth-field-hint error'; }
    else          { el.textContent = '사용 가능한 사용자명이에요'; el.className = 'auth-field-hint success'; }
  }

  function _pwScore(pw) {
    let s = 0;
    if (pw.length >= 8)          s++;
    if (/[A-Z]/.test(pw))        s++;
    if (/[0-9]/.test(pw))        s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    if (pw.length >= 12)         s++;
    return s;
  }

  function onPwInput(input) {
    const pw    = input.value;
    const score = _pwScore(pw);
    const fill  = $('modal-pw-strength');
    const hint  = $('modal-hint-pw');
    const colors = ['', '#f3727f', '#ffa42b', '#ffa42b', '#1ed760', '#1ed760'];
    const labels = ['', '매우 약함', '약함', '보통', '강함', '매우 강함'];

    if (fill) {
      fill.style.width      = (score * 20) + '%';
      fill.style.background = colors[score] || 'transparent';
    }
    if (hint) {
      if (!pw)          { hint.textContent = '';          hint.className = 'auth-field-hint'; }
      else if (score <= 1) { hint.textContent = labels[score]; hint.className = 'auth-field-hint error'; }
      else if (score <= 2) { hint.textContent = labels[score]; hint.className = 'auth-field-hint'; }
      else              { hint.textContent = labels[score]; hint.className = 'auth-field-hint success'; }
    }
    validatePw2($('modal-su-password2'));
  }

  function validatePw2(input) {
    if (!input) return;
    const pw1  = $('modal-su-password')?.value;
    const pw2  = input.value;
    const hint = $('modal-hint-pw2');
    if (!hint) return;
    if (!pw2)          { hint.textContent = '';                      hint.className = 'auth-field-hint'; }
    else if (pw1!==pw2){ hint.textContent = '비밀번호가 일치하지 않아요'; hint.className = 'auth-field-hint error'; }
    else               { hint.textContent = '비밀번호가 일치해요 ✓'; hint.className = 'auth-field-hint success'; }
  }

  /* ══════════════ 로그인 성공 후 처리 ══════════════ */

  function _onSuccess() {
    /* 로그아웃과 동일하게 전체 페이지를 새로고침한다.
       사이드바 라이브러리·홈 화면 차트/빠른 액세스·친구 배지 등
       "로그인 전에 한 번 로드되고 다시 안 불러와지는" 부류의 문제를
       하나하나 개별 갱신으로 막기보다, 아예 새로 불러오는 게 확실하다. */
    window.location.replace('/');
  }

  /** 상단바 아바타 + 드롭다운 사용자 정보를 실시간 갱신 */
  function _refreshTopbar() {
    const user = Auth.getUser();
    if (!user) return;

    const initials    = (user.username || 'SW').slice(0, 2).toUpperCase();
    const displayName = user.display_name || user.username || 'SoundWave 사용자';
    const email       = user.email || '';

    const avatarBtn   = $('avatar-btn');
    const nameEl      = $('topbar-user-name');
    const emailEl     = $('topbar-user-email');

    if (avatarBtn) { avatarBtn.textContent = initials; avatarBtn.title = displayName; }
    if (nameEl)    nameEl.textContent  = displayName;
    if (emailEl)   emailEl.textContent = email;
  }

  /* ══════════════ 초기화 ══════════════ */

  function init() {
    const params        = new URLSearchParams(window.location.search);
    const spotifyResult = params.get('spotify');

    if (spotifyResult) {
      // Spotify OAuth 콜백: URL 파라미터 즉시 제거 후 서버 세션으로 복원
      history.replaceState({}, '', '/');
      try { localStorage.removeItem('sw_spotify_redirect'); } catch(e) {}
      _restoreFromServerSession(spotifyResult);
      return;  // 아래 로그인 체크 건너뜀
    }

    /* 일반 진입: localStorage 로그인 확인 */
    if (!Auth.isLoggedIn()) show('login');

    /* Enter 키 */
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const modal = $('auth-modal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      currentTab === 'login' ? handleLogin() : handleSignup();
    });
  }

  /* ── 서버 세션으로 localStorage 복원 ─────────────────────
     Spotify OAuth 후 localStorage가 비워져도 서버 세션이
     살아있으면 자동 로그인 복원
  ────────────────────────────────────────────────────── */
  async function _restoreFromServerSession(spotifyResult) {
    try {
      const res = await fetch('/api/users/me', { credentials: 'include' });

      if (res.ok) {
        const user = await res.json();

        // localStorage 에 사용자 복원
        const userData = {
          id:                user.id,
          username:          user.username,
          email:             user.email,
          display_name:      user.displayName || user.display_name || user.username,
          profile_image_url: user.profileImageUrl || null,
          created_at:        user.createdAt || new Date().toISOString(),
        };
        localStorage.setItem('sw_user', JSON.stringify(userData));

        // localStorage users 배열에도 추가 (이후 로컬 로그인 가능)
        const users = JSON.parse(localStorage.getItem('sw_users') || '[]');
        const idx   = users.findIndex(u => u.email === user.email);
        if (idx >= 0) users[idx] = { ...users[idx], ...userData };
        else          users.push(userData);
        localStorage.setItem('sw_users', JSON.stringify(users));

        // 상단바 갱신
        _refreshTopbar();
        if (typeof ProfilePage !== 'undefined') ProfilePage.populate();

        // Spotify 결과 토스트
        if (spotifyResult === 'connected') {
          _showToast('✅ Spotify 연동이 완료됐어요!', 'success');
          if (typeof SpotifyPlayer !== 'undefined') {
            setTimeout(() => SpotifyPlayer.init(), 500);
          }
        } else if (spotifyResult === 'error') {
          _showToast('❌ Spotify 연동에 실패했어요.', 'error');
        } else if (spotifyResult === 'cancelled') {
          _showToast('Spotify 연동을 건너뛰었어요.', 'info');
        }

      } else {
        // 서버 세션도 없음 → 로그인 필요
        show('login');
        _bindKeyHandler();
      }
    } catch(e) {
      // 네트워크 오류 → localStorage로 폴백
      if (!Auth.isLoggedIn()) show('login');
      _bindKeyHandler();
    }
  }

  function _bindKeyHandler() {
    document.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const modal = $('auth-modal');
      if (!modal || modal.classList.contains('hidden')) return;
      if (e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      currentTab === 'login' ? handleLogin() : handleSignup();
    });
  }

  function _showToast(msg, type) {
    const colors  = { success:'rgba(30,215,96,.15)', error:'rgba(243,114,127,.15)', info:'rgba(83,157,245,.15)' };
    const borders = { success:'rgba(30,215,96,.4)',  error:'rgba(243,114,127,.4)', info:'rgba(83,157,245,.4)'  };
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
      background:${colors[type]||colors.info};border:1px solid ${borders[type]||borders.info};
      border-radius:12px;padding:12px 20px;font-size:13px;font-weight:600;
      color:var(--text-base);z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap`;
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  return {
    show, hide, switchTab,
    handleLogin, handleSignup, quickDemo,
    validateUsername, onPwInput, validatePw2,
    _skipSpotify,
    init,
  };

})();
