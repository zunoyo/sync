/**
 * SOUNDWAVE — Right Panel Component (Now Playing)
 * id="right-panel-root" 요소를 우측 패널 HTML로 교체합니다.
 *
 * rp-play-btn 구조:
 *   기본(재생 중) → .rp-pause-icon 표시 (⏸)
 *   .paused 클래스 → .rp-play-icon 표시 (▶)
 *   player.js의 updatePlayBtn() 이 두 버튼을 동시에 토글합니다.
 */
(function () {
  var root = document.getElementById('right-panel-root');
  if (!root) return;
  root.outerHTML = `
<aside class="right-panel open" id="right-panel">

  <!-- 헤더: 탭 + 닫기 -->
  <div class="rp-header">
    <div class="rp-tabs">
      <button class="rp-tab active" data-tab="nowplaying">Now Playing</button>
      <button class="rp-tab"        data-tab="queue">다음 곡</button>
    </div>
    <button class="rp-close" onclick="closePanel()" title="닫기">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>
  </div>

  <!-- 바디 -->
  <div class="rp-body">

    <!-- NOW PLAYING 탭 -->
    <div class="rp-tab-content" data-tab="nowplaying">
      <div class="rp-now-playing">

        <div id="rp-album-art" class="rp-album-art grad-4">🎤</div>

        <div class="rp-track-info" style="width:100%">
          <div class="rp-track-header">
            <div>
              <div id="rp-track-name"   class="rp-track-name">Supernova</div>
              <div id="rp-track-artist" class="rp-track-artist">aespa</div>
            </div>
            <button class="icon-btn liked" style="color:var(--accent)"
                    onclick="togglePlayerLike()" title="좋아요">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </button>
          </div>
        </div>

        <div id="rp-waveform" class="rp-waveform" style="width:100%"></div>

        <div class="rp-progress-wrap" style="width:100%">
          <div class="rp-progress-bar" id="rp-progress-bar">
            <div class="rp-progress-fill" id="rp-progress-fill" style="width:35%"></div>
          </div>
          <div class="rp-progress-times">
            <span id="rp-current-time">1:07</span>
            <span id="rp-end-time">3:13</span>
          </div>
        </div>

        <div class="rp-controls" style="width:100%">
          <button class="ctrl-btn" onclick="toggleShuffle()" title="랜덤">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
          </button>
          <button class="ctrl-btn" title="이전">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>

          <!-- ▶ / ⏸ 토글 버튼 ─────────────────────────
               재생 중  : .rp-pause-icon 보임 (⏸)
               .paused  : .rp-play-icon  보임 (▶)
          ─────────────────────────────────────────── -->
          <button id="rp-play-btn" class="rp-play-btn"
                  onclick="togglePlay()" title="재생/일시정지">
            <svg class="rp-pause-icon" width="22" height="22"
                 viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
            <svg class="rp-play-icon" width="22" height="22"
                 viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>

          <button class="ctrl-btn" title="다음">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button class="ctrl-btn" onclick="toggleRepeat()" title="반복">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          </button>
        </div>

      </div><!-- end rp-now-playing -->

      <!-- 가사 -->
      <div class="rp-lyrics">
        <div class="rp-section-label">가사</div>
        <div id="rp-lyrics-container">
          <div class="lyrics-line">내가 바라던 세상은</div>
          <div class="lyrics-line active">너로 가득 찬 곳이었어</div>
          <div class="lyrics-line">But now I'm reaching for the stars</div>
          <div class="lyrics-line">전부 다 걸고 뛰어올라</div>
          <div class="lyrics-line">Supernova, 눈부신 빛</div>
          <div class="lyrics-line">넌 나의 전부야</div>
          <div class="lyrics-line">어둠 속에서도 빛나는</div>
          <div class="lyrics-line">너만의 universe</div>
        </div>
      </div>

      <!-- 관련 아티스트 -->
      <div class="rp-related">
        <div class="rp-section-label">관련 아티스트</div>
        <div id="rp-related-list"></div>
      </div>
    </div>

    <!-- 다음 곡 탭 -->
    <div class="rp-tab-content" data-tab="queue" style="display:none">
      <div class="rp-queue">
        <div class="rp-section-label">다음에 재생할 곡</div>
        <div id="rp-queue-list"></div>
      </div>
    </div>

  </div><!-- end rp-body -->
</aside>`;
})();
