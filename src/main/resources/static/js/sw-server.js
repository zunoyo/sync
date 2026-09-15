/* ══ SyncPage ════════════════════════════════════════ */
var SyncPage = (function () {

    var imgs          = [];     // 첨부 이미지 목록
    var _currentTracks = [];   // 현재 추천 트랙 목록
    var _audio        = null;  // HTML5 Audio 객체
    var _playingIndex = -1;    // 현재 재생 중인 트랙 인덱스

    /* ── 초기화 ─────────────────────────────────── */
    function init() {
        _audio = new Audio();

        var ab = document.getElementById('sync-attach-btn');
        var fi = document.getElementById('sync-file-input');
        var ta = document.getElementById('sync-textarea');

        if (ab && fi) {
            ab.addEventListener('click', function () { fi.click(); });
            fi.addEventListener('change', function (e) {
                Array.from(e.target.files).forEach(function (file) {
                    if (!file.type.startsWith('image/')) return;
                    var r = new FileReader();
                    r.onload = function (ev) {
                        imgs.push({ name: file.name, src: ev.target.result });
                        _renderPreviews();
                    };
                    r.readAsDataURL(file);
                });
                fi.value = '';
            });
        }

        if (ta) {
            ta.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }

        // 오디오 이벤트
        if (_audio) {
            _audio.addEventListener('ended', function () {
                _setPlayingState(-1);
            });
        }
    }

    /* ── 이미지 미리보기 ─────────────────────────── */
    function _renderPreviews() {
        var c = document.getElementById('sync-image-previews');
        if (!c) return;
        c.innerHTML = imgs.map(function (img, i) {
            return '<div class="sync-img-preview">' +
                '<img src="' + img.src + '" alt="' + img.name + '">' +
                '<button class="sync-img-remove" ' +
                'onclick="SyncPage.removeImage(' + i + ')" title="제거">✕</button>' +
                '</div>';
        }).join('');
    }

    /* ── 로딩 표시 ───────────────────────────────── */
    function _showLoading() {
        var c = document.getElementById('sync-results');
        if (!c) return;
        c.innerHTML = [
            '<div class="ai-response">',
                '<div class="ai-response-header">',
                    '<div class="ai-icon" style="animation:spin 1s linear infinite">⏳</div>',
                    '<div>',
                        '<div class="ai-name">Sync AI</div>',
                        '<div style="font-size:11px;color:var(--text-secondary)">',
                            '감정 분석 중...',
                        '</div>',
                    '</div>',
                '</div>',
                '<p class="ai-text">잠시만 기다려주세요 🎵</p>',
            '</div>'
        ].join('');
    }

    /* ── 오류 표시 ───────────────────────────────── */
    function _showError(msg) {
        var c = document.getElementById('sync-results');
        if (!c) return;
        c.innerHTML = [
            '<div class="ai-response">',
                '<div class="ai-response-header">',
                    '<div class="ai-icon">⚠️</div>',
                    '<div><div class="ai-name">오류 발생</div></div>',
                '</div>',
                '<p class="ai-text" style="color:var(--negative)">' + msg + '</p>',
            '</div>'
        ].join('');
    }

    /* ── 시간 포맷 ───────────────────────────────── */
    function _formatDuration(ms) {
        if (!ms) return '--:--';
        var sec = Math.floor(ms / 1000);
        var m   = Math.floor(sec / 60);
        var s   = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ── 결과 렌더링 ─────────────────────────────── */
    function _renderResults(data) {
        var c = document.getElementById('sync-results');
        if (!c) return;

        var emotion = data.emotion || {};
        var tracks  = data.tracks  || [];

        _currentTracks = tracks;

        var emotionLabels = {
            happy:      '😊 행복',
            sad:        '😢 슬픔',
            calm:       '😌 차분',
            energetic:  '⚡ 활기',
            romantic:   '💕 로맨틱',
            melancholy: '🌧 감성',
            angry:      '🔥 강렬',
            dreamy:     '🌙 몽환'
        };

        var confidence = emotion.confidence
            ? Math.round(emotion.confidence * 100) : 0;

        var html = [
            '<div class="ai-response">',
                '<div class="ai-response-header">',
                    '<div class="ai-icon">🤖</div>',
                    '<div>',
                        '<div class="ai-name">Sync AI</div>',
                        '<div style="font-size:11px;color:var(--text-secondary)">',
                            '감정 분석 완료',
                        '</div>',
                    '</div>',
                '</div>',

                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">',
                    '<span style="background:var(--accent);color:#000;',
                            'padding:4px 14px;border-radius:var(--radius-full);',
                            'font-size:13px;font-weight:700">',
                        emotionLabels[emotion.primary] || emotion.primary || '-',
                    '</span>',
                    emotion.secondary
                        ? '<span style="background:rgba(255,255,255,.1);' +
                                'padding:4px 14px;border-radius:var(--radius-full);' +
                                'font-size:13px">' +
                            (emotionLabels[emotion.secondary] || emotion.secondary) +
                          '</span>'
                        : '',
                    '<span style="font-size:12px;color:var(--text-secondary);',
                            'align-self:center">',
                        '신뢰도 ' + confidence + '%',
                    '</span>',
                '</div>',

                '<p class="ai-text">',
                    '감정 분석 결과를 바탕으로 ',
                    tracks.length + '곡을 추천해드려요! 🎵',
                '</p>',
            '</div>'
        ].join('');

        if (tracks.length === 0) {
            html += [
                '<div style="padding:32px;text-align:center;',
                        'color:var(--text-secondary)">',
                    '<div style="font-size:32px;margin-bottom:12px">🔍</div>',
                    '<div>추천할 트랙을 찾지 못했어요.<br>',
                    'Last.fm / Spotify API Key를 확인하거나<br>',
                    '다른 감정으로 다시 시도해보세요.</div>',
                '</div>'
            ].join('');
        } else {
            tracks.forEach(function (t, i) {
                var dur = _formatDuration(t.durationMs);
                var gradients = [
                    'grad-1','grad-2','grad-3','grad-4',
                    'grad-5','grad-6','grad-7','grad-8'
                ];
                var grad = gradients[i % gradients.length];

                var artHtml = t.albumArt
                    ? '<img src="' + t.albumArt + '" ' +
                      'style="width:44px;height:44px;border-radius:6px;' +
                      'object-fit:cover;flex-shrink:0" ' +
                      'onerror="this.outerHTML=\'<div class=&quot;track-art ' + grad + '&quot; ' +
                      'style=&quot;width:44px;height:44px;border-radius:6px;display:flex;' +
                      'align-items:center;justify-content:center;font-size:18px;' +
                      'flex-shrink:0&quot;>🎵</div>\'">'
                    : '<div class="track-art ' + grad + '" ' +
                      'style="width:44px;height:44px;border-radius:6px;display:flex;' +
                      'align-items:center;justify-content:center;font-size:18px;' +
                      'flex-shrink:0">🎵</div>';

                var playBtn = t.previewUrl
                    ? '<button id="sync-play-btn-' + i + '" ' +
                      'class="ctrl-btn" ' +
                      'onclick="event.stopPropagation();SyncPage.playPreview(' + i + ')" ' +
                      'title="미리듣기" style="color:var(--accent)">' +
                      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
                      '<path id="sync-play-icon-' + i + '" d="M8 5v14l11-7z"/></svg>' +
                      '</button>'
                    : '<span style="font-size:11px;color:var(--text-muted)">미리듣기 없음</span>';

                html += [
                    '<div class="sync-track-rec" ',
                        'onclick="SyncPage.playPreview(' + i + ')" ',
                        'id="sync-track-' + i + '">',
                        artHtml,
                        '<div style="flex:1;overflow:hidden">',
                            '<div style="font-size:14px;font-weight:700;',
                                    'overflow:hidden;text-overflow:ellipsis;',
                                    'white-space:nowrap">',
                                t.name || '알 수 없음',
                            '</div>',
                            '<div style="font-size:12px;color:var(--text-secondary)">',
                                (t.artist || '') +
                                (t.album ? ' · ' + t.album : ''),
                            '</div>',
                        '</div>',
                        '<div style="display:flex;align-items:center;gap:8px">',
                            '<span style="font-size:12px;color:var(--text-muted)">',
                                dur,
                            '</span>',
                            playBtn,
                        '</div>',
                    '</div>'
                ].join('');
            });

            // 피드백 버튼
            if (data.historyId) {
                html += [
                    '<div style="display:flex;gap:8px;justify-content:center;',
                            'margin-top:16px;padding-top:16px;',
                            'border-top:1px solid rgba(255,255,255,.07)">',
                        '<span style="font-size:13px;color:var(--text-secondary);',
                                'align-self:center">이 추천이 마음에 드셨나요?</span>',
                        '<button onclick="SyncPage.feedback(' + data.historyId + ',1)" ',
                            'style="background:rgba(30,215,96,.15);border:1px solid var(--accent);',
                            'color:var(--accent);padding:6px 16px;border-radius:var(--radius-full);',
                            'font-size:13px;cursor:pointer;font-family:var(--font)">',
                            '👍 좋아요',
                        '</button>',
                        '<button onclick="SyncPage.feedback(' + data.historyId + ',0)" ',
                            'style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);',
                            'color:var(--text-secondary);padding:6px 16px;',
                            'border-radius:var(--radius-full);font-size:13px;',
                            'cursor:pointer;font-family:var(--font)">',
                            '👎 별로예요',
                        '</button>',
                    '</div>'
                ].join('');
            }
        }

        c.innerHTML = html;
    }

    /* ── 재생 상태 업데이트 ──────────────────────── */
    function _setPlayingState(index) {
        // 이전 재생 버튼 원래대로
        if (_playingIndex >= 0) {
            var prevBtn = document.getElementById(
                'sync-play-btn-' + _playingIndex);
            var prevIcon = document.getElementById(
                'sync-play-icon-' + _playingIndex);
            if (prevBtn)  prevBtn.style.color  = 'var(--accent)';
            if (prevIcon) prevIcon.setAttribute('d', 'M8 5v14l11-7z');
            var prevTrack = document.getElementById(
                'sync-track-' + _playingIndex);
            if (prevTrack) prevTrack.style.background = '';
        }

        _playingIndex = index;

        // 현재 재생 버튼 일시정지 아이콘으로
        if (index >= 0) {
            var btn  = document.getElementById('sync-play-btn-' + index);
            var icon = document.getElementById('sync-play-icon-' + index);
            if (btn)  btn.style.color = 'var(--negative)';
            if (icon) icon.setAttribute(
                'd', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
            var trackEl = document.getElementById('sync-track-' + index);
            if (trackEl) {
                trackEl.style.background = 'rgba(30,215,96,.08)';
            }
        }
    }

    /* ── 미리듣기 재생 ───────────────────────────── */
    function playPreview(index) {
        var t = _currentTracks[index];
        if (!t) return;

        if (!t.previewUrl) {
            alert('이 트랙은 미리듣기가 제공되지 않습니다.\nSpotify Premium이 있으면 전체 재생이 가능합니다.');
            return;
        }

        // 같은 트랙 클릭 → 일시정지 토글
        if (_playingIndex === index && _audio && !_audio.paused) {
            _audio.pause();
            _setPlayingState(-1);
            return;
        }

        // 새 트랙 재생
        if (_audio) {
            _audio.pause();
            _audio.src = t.previewUrl;
            _audio.play().catch(function (e) {
                console.error('재생 실패:', e);
            });
        }

        _setPlayingState(index);

        // 플레이어 바 업데이트
        _updatePlayerBar(t);

        // 재생 기록 저장
        _recordPlayHistory(t);
    }

    /* ── 플레이어 바 업데이트 ────────────────────── */
    function _updatePlayerBar(t) {
        var nameEl   = document.getElementById('player-name');
        var artistEl = document.getElementById('player-artist');
        var artEl    = document.getElementById('player-art');

        if (nameEl)   nameEl.textContent   = t.name   || '알 수 없음';
        if (artistEl) artistEl.textContent = t.artist || '';

        if (artEl) {
            if (t.albumArt) {
                artEl.style.cssText =
                    'background-image:url(' + t.albumArt + ');' +
                    'background-size:cover;background-position:center;' +
                    'border-radius:4px';
                artEl.textContent = '';
            } else {
                artEl.style.cssText = '';
                artEl.textContent = '🎵';
            }
        }
    }

    /* ── 재생 기록 저장 ──────────────────────────── */
    function _recordPlayHistory(t) {
        fetch('/api/play-history', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                spotifyTrackId: t.spotifyTrackId || '',
                trackName:      t.name   || '',
                artistName:     t.artist || '',
                source:         'sync_rec',
                emotionVectorId: null
            })
        }).catch(function (e) {
            console.warn('재생 기록 저장 실패:', e);
        });
    }

    /* ── 피드백 저장 ─────────────────────────────── */
    function feedback(historyId, value) {
        fetch('/api/sync/feedback/' + historyId, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ feedback: value })
        }).then(function () {
            alert(value === 1 ? '👍 피드백 감사합니다!' : '👎 더 좋은 추천을 위해 노력할게요!');
        }).catch(function (e) {
            console.warn('피드백 저장 실패:', e);
        });
    }

    /* ── 메시지 전송 (핵심 함수) ─────────────────── */
    function sendMessage() {
        var ta   = document.getElementById('sync-textarea');
        var text = ta ? ta.value.trim() : '';

        if (!text && imgs.length === 0) {
            alert('텍스트나 이미지를 입력해주세요.');
            return;
        }

        // 로딩 표시
        _showLoading();

        // 입력 타입 결정
        var inputType = 'text';
        if (text && imgs.length > 0) inputType = 'both';
        else if (imgs.length > 0)    inputType = 'image';

        // 요청 데이터
        var request = {
            inputType: inputType,
            inputText: text    || null,
            imageUrl:  imgs.length > 0 ? imgs[0].src : null
        };

        // 입력 초기화
        if (ta) ta.value = '';
        imgs = [];
        _renderPreviews();

        // API 호출
        fetch('/api/sync/full-recommend', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(request)
        })
        .then(function (res) {
            if (res.status === 401) {
                throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
            }
            if (!res.ok) {
                return res.json().then(function (e) {
                    throw new Error(e.error || '추천 실패 (status: ' + res.status + ')');
                });
            }
            return res.json();
        })
        .then(function (data) {
            _renderResults(data);
        })
        .catch(function (e) {
            _showError(e.message);
        });
    }

    function removeImage(i) {
        imgs.splice(i, 1);
        _renderPreviews();
    }

    return {
        init:        init,
        sendMessage: sendMessage,
        removeImage: removeImage,
        playPreview: playPreview,
        feedback:    feedback
    };
})();