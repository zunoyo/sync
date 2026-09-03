/**
 * SOUNDWAVE Sync AI — API 연동
 * navigation.js의 SyncPage.sendMessage를 서버 API 버전으로 오버라이드
 */
(function () {

    var imgs          = [];
    var _audio        = null;
    var _currentTracks = [];
    var _playingIndex = -1;

    /* ── 이미지 미리보기 ─────────────────────── */
    function _renderPreviews() {
        var c = document.getElementById('sync-image-previews');
        if (!c) return;
        c.innerHTML = imgs.map(function (img, i) {
            return '<div class="sync-img-preview">' +
                '<img src="' + img.src + '">' +
                '<button class="sync-img-remove" ' +
                'onclick="SyncPage.removeImage(' + i + ')">✕</button>' +
                '</div>';
        }).join('');
    }

    /* ── 로딩 표시 ───────────────────────────── */
    function _showLoading() {
        var c = document.getElementById('sync-results');
        if (!c) return;
        c.innerHTML = [
            '<div class="ai-response">',
                '<div class="ai-response-header">',
                    '<div class="ai-icon">⏳</div>',
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

    /* ── 오류 표시 ───────────────────────────── */
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

    /* ── 시간 포맷 ───────────────────────────── */
    function _fmt(ms) {
        if (!ms) return '--:--';
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ── 재생 상태 업데이트 ──────────────────── */
    function _setPlayingState(idx) {
        if (_playingIndex >= 0) {
            var pb = document.getElementById('spi-' + _playingIndex);
            var pt = document.getElementById('spt-' + _playingIndex);
            if (pb) pb.innerHTML = '<path d="M8 5v14l11-7z"/>';
            if (pt) pt.style.background = '';
        }
        _playingIndex = idx;
        if (idx >= 0) {
            var nb = document.getElementById('spi-' + idx);
            var nt = document.getElementById('spt-' + idx);
            if (nb) nb.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
            if (nt) nt.style.background = 'rgba(30,215,96,.08)';
        }
    }

    /* ── 플레이어 바 업데이트 ────────────────── */
    function _updateBar(t) {
        var ne = document.getElementById('player-name');
        var ae = document.getElementById('player-artist');
        var ar = document.getElementById('player-art');
        if (ne) ne.textContent = t.name   || '알 수 없음';
        if (ae) ae.textContent = t.artist || '';
        if (ar) {
            if (t.albumArt) {
                ar.style.cssText =
                    'background-image:url(' + t.albumArt + ');' +
                    'background-size:cover;background-position:center;border-radius:4px';
                ar.textContent = '';
            } else {
                ar.style.cssText = '';
                ar.textContent = '🎵';
            }
        }
    }

    /* ── 태그 문자열 파싱 (백엔드 parseTags()와 동일한 규칙) ── */
    function _parseTags(raw) {
        if (!raw) return [];
        var cleaned = String(raw).trim().replace(/^\[|]$/g, '').trim();
        if (!cleaned) return [];
        return cleaned.split(',')
            .map(function (s) { return s.trim().replace(/^"|"$/g, '').trim(); })
            .filter(Boolean);
    }

    /* ── valence/arousal 값 → 짧은 라벨 ── */
    function _vaLabel(v) {
        if (v == null) return '';
        if (v > 0.15)  return '긍정적';
        if (v < -0.15) return '부정적';
        return '중립';
    }
    function _arLabel(v) {
        if (v == null) return '';
        if (v > 0.15)  return '활발함';
        if (v < -0.15) return '차분함';
        return '보통';
    }

    /* ── 감정 좌표(긍정도·활성도) 2D 산점도 — 정서 원형모델(circumplex) 스타일 ── */
    function _renderVAPlot(valence, arousal) {
        var v = Math.max(-1, Math.min(1, valence));
        var a = Math.max(-1, Math.min(1, arousal));
        var W = 240, H = 240, PAD = 30;
        var pw = W - PAD * 2, ph = H - PAD * 2;
        var cx = PAD + (v + 1) / 2 * pw;
        var cy = PAD + (1 - a) / 2 * ph;   // arousal +1(위) → 작은 y, -1(아래) → 큰 y

        return [
            '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;max-width:230px;height:auto;display:block;margin:0 auto">',
                '<rect x="' + PAD + '" y="' + PAD + '" width="' + pw + '" height="' + ph + '" ' +
                    'fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.12)" stroke-width="1" rx="6"/>',
                '<line x1="' + PAD + '" y1="' + (PAD + ph / 2) + '" x2="' + (PAD + pw) + '" y2="' + (PAD + ph / 2) + '" ' +
                    'stroke="rgba(255,255,255,.15)" stroke-width="1"/>',
                '<line x1="' + (PAD + pw / 2) + '" y1="' + PAD + '" x2="' + (PAD + pw / 2) + '" y2="' + (PAD + ph) + '" ' +
                    'stroke="rgba(255,255,255,.15)" stroke-width="1"/>',
                '<text x="' + (PAD + 8) + '" y="' + (PAD + 16) + '" font-size="9" fill="rgba(255,255,255,.38)">화남·불안</text>',
                '<text x="' + (PAD + pw - 8) + '" y="' + (PAD + 16) + '" font-size="9" fill="rgba(255,255,255,.38)" text-anchor="end">신남·기쁨</text>',
                '<text x="' + (PAD + 8) + '" y="' + (PAD + ph - 8) + '" font-size="9" fill="rgba(255,255,255,.38)">우울·슬픔</text>',
                '<text x="' + (PAD + pw - 8) + '" y="' + (PAD + ph - 8) + '" font-size="9" fill="rgba(255,255,255,.38)" text-anchor="end">평온·만족</text>',
                '<text x="' + (PAD - 6) + '" y="' + (PAD + ph / 2 + 3) + '" font-size="10" fill="rgba(255,255,255,.55)" text-anchor="end">부정</text>',
                '<text x="' + (PAD + pw + 6) + '" y="' + (PAD + ph / 2 + 3) + '" font-size="10" fill="rgba(255,255,255,.55)">긍정</text>',
                '<text x="' + (PAD + pw / 2) + '" y="' + (PAD - 10) + '" font-size="10" fill="rgba(255,255,255,.55)" text-anchor="middle">활발</text>',
                '<text x="' + (PAD + pw / 2) + '" y="' + (PAD + ph + 20) + '" font-size="10" fill="rgba(255,255,255,.55)" text-anchor="middle">차분</text>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="11" style="fill:var(--accent)" opacity="0.22"/>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="5" style="fill:var(--accent)" stroke="#0a0a0a" stroke-width="1.5"/>',
            '</svg>'
        ].join('');
    }

    /* ── 분석 신뢰도 원형 게이지 ── */
    function _renderConfidenceGauge(pct) {
        var r = 30, cx = 36, cy = 36;
        var circ = 2 * Math.PI * r;
        var offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
        return [
            '<svg viewBox="0 0 72 72" style="width:64px;height:64px;flex-shrink:0">',
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
                    'stroke="rgba(255,255,255,.1)" stroke-width="7"/>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" style="stroke:var(--accent)" ' +
                    'stroke-width="7" stroke-linecap="round" stroke-dasharray="' + circ + '" ' +
                    'stroke-dashoffset="' + offset + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>',
                '<text x="' + cx + '" y="' + (cy + 5) + '" font-size="15" font-weight="700" fill="#fff" ' +
                    'text-anchor="middle">' + pct + '%</text>',
            '</svg>'
        ].join('');
    }

    /* ── 감정 분석 결과 표 ── */
    function _renderAnalysisTable(em, conf) {
        var rows = [
            ['1차 감정', em.primary || '—'],
            ['2차 감정', em.secondary || '—'],
            ['긍정도 (valence)', em.valence != null ? em.valence.toFixed(2) + ' · ' + _vaLabel(em.valence) : '—'],
            ['활성도 (arousal)', em.arousal != null ? em.arousal.toFixed(2) + ' · ' + _arLabel(em.arousal) : '—'],
        ];
        return [
            '<table style="width:100%;border-collapse:collapse;font-size:13px">',
                '<tbody>',
                    rows.map(function (r) {
                        return '<tr style="border-bottom:1px solid rgba(255,255,255,.06)">' +
                            '<td style="padding:7px 6px 7px 0;color:var(--text-secondary);white-space:nowrap">' + r[0] + '</td>' +
                            '<td style="padding:7px 0;color:#fff;font-weight:600;text-align:right">' + r[1] + '</td>' +
                        '</tr>';
                    }).join(''),
                '</tbody>',
            '</table>'
        ].join('');
    }

    /* ── "왜 이 곡들을 추천했는지" 분석 상세 블록 (표 + 그래프) ── */
    function _renderAnalysisDetail(em) {
        var tags = _parseTags(em.tags);
        var conf = em.confidence ? Math.round(em.confidence * 100) : 0;
        var hasVA = em.valence != null && em.arousal != null;

        var tagsHtml = tags.length ? [
            '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">',
                '이 태그로 Last.fm에서 곡을 검색했어요',
            '</div>',
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">',
                tags.map(function (tag) {
                    return '<span style="background:rgba(255,255,255,.08);padding:3px 10px;' +
                        'border-radius:var(--radius-full);font-size:12px;color:#fff">#' + tag + '</span>';
                }).join(''),
            '</div>'
        ].join('') : '';

        return [
            '<div style="margin-top:16px;padding:16px;background:rgba(255,255,255,.04);',
                    'border-radius:var(--radius-md);border:1px solid rgba(255,255,255,.07)">',
                '<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:14px">',
                    '🔍 이 곡들을 추천한 이유',
                '</div>',
                '<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:16px">',
                    '<div style="flex:1;min-width:180px">', _renderAnalysisTable(em, conf), '</div>',
                    '<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:6px">',
                        _renderConfidenceGauge(conf),
                        '<span style="font-size:10px;color:var(--text-secondary);white-space:nowrap">분석 신뢰도</span>',
                    '</div>',
                '</div>',
                hasVA ? [
                    '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;text-align:center">',
                        '감정 좌표 (긍정도 · 활성도)',
                    '</div>',
                    _renderVAPlot(em.valence, em.arousal),
                    '<div style="height:14px"></div>',
                ].join('') : '',
                tagsHtml,
                '<div style="font-size:11px;color:var(--text-muted);line-height:1.6">',
                    '입력하신 내용을 CLIP으로 분석해 위 감정·태그를 추출하고, 그 태그로 Last.fm에서',
                    '인기 트랙을 찾은 뒤 Spotify에서 앨범아트·미리듣기를 매칭해 추천했어요.',
                '</div>',
            '</div>'
        ].join('');
    }

    /* ── 결과 렌더링 ─────────────────────────── */
    function _renderResults(data) {
        var c = document.getElementById('sync-results');
        if (!c) return;

        var em = data.emotion || {};
        var tr = data.tracks  || [];
        _currentTracks = tr;

        var labels = {
            happy:'😊 행복', sad:'😢 슬픔', calm:'😌 차분',
            energetic:'⚡ 활기', romantic:'💕 로맨틱',
            melancholy:'🌧 감성', angry:'🔥 강렬', dreamy:'🌙 몽환'
        };
        var conf = em.confidence ? Math.round(em.confidence * 100) : 0;
        var grads = ['grad-1','grad-2','grad-3','grad-4',
                     'grad-5','grad-6','grad-7','grad-8'];

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
                    '<span style="background:var(--accent);color:#000;padding:4px 14px;',
                            'border-radius:var(--radius-full);font-size:13px;font-weight:700">',
                        labels[em.primary] || em.primary || '-',
                    '</span>',
                    em.secondary
                        ? '<span style="background:rgba(255,255,255,.1);padding:4px 14px;' +
                          'border-radius:var(--radius-full);font-size:13px">' +
                          (labels[em.secondary] || em.secondary) + '</span>'
                        : '',
                    '<span style="font-size:12px;color:var(--text-secondary);align-self:center">',
                        '신뢰도 ' + conf + '%',
                    '</span>',
                '</div>',
                '<p class="ai-text">',
                    '감정 분석 결과를 바탕으로 ' + tr.length + '곡을 추천해드려요! 🎵',
                '</p>',
            '</div>'
        ].join('');

        if (tr.length === 0) {
            html += [
                '<div style="padding:32px;text-align:center;color:var(--text-secondary)">',
                    '<div style="font-size:32px;margin-bottom:12px">🔍</div>',
                    '<div>추천할 트랙을 찾지 못했어요.<br>',
                    'Last.fm / Spotify API Key를 확인하거나<br>',
                    '다른 감정으로 다시 시도해보세요.</div>',
                '</div>'
            ].join('');
        } else {
            tr.forEach(function (t, i) {
                var dur = _fmt(t.durationMs);
                var g   = grads[i % grads.length];
                var art = t.albumArt
                    ? '<img src="' + t.albumArt + '" onerror="this.style.display=\'none\'" ' +
                      'style="width:44px;height:44px;border-radius:6px;' +
                      'object-fit:cover;flex-shrink:0">'
                    : '<div class="track-art ' + g + '" style="width:44px;height:44px;' +
                      'border-radius:6px;display:flex;align-items:center;' +
                      'justify-content:center;font-size:18px;flex-shrink:0">🎵</div>';

                var btn = t.previewUrl
                    ? '<button id="spb-' + i + '" class="ctrl-btn" ' +
                      'onclick="event.stopPropagation();SyncPage.playPreview(' + i + ')" ' +
                      'style="color:var(--accent)" title="미리듣기">' +
                      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
                      '<path id="spi-' + i + '" d="M8 5v14l11-7z"/></svg></button>'
                    : '<span style="font-size:11px;color:var(--text-muted)">미리듣기 없음</span>';

                html += [
                    '<div class="sync-track-rec" id="spt-' + i + '" ',
                        'onclick="SyncPage.playPreview(' + i + ')">',
                        art,
                        '<div style="flex:1;overflow:hidden">',
                            '<div style="font-size:14px;font-weight:700;overflow:hidden;',
                                    'text-overflow:ellipsis;white-space:nowrap">',
                                t.name || '알 수 없음',
                            '</div>',
                            '<div style="font-size:12px;color:var(--text-secondary)">',
                                (t.artist || '') + (t.album ? ' · ' + t.album : ''),
                            '</div>',
                        '</div>',
                        '<div style="display:flex;align-items:center;gap:8px">',
                            '<span style="font-size:12px;color:var(--text-muted)">' + dur + '</span>',
                            btn,
                        '</div>',
                    '</div>'
                ].join('');
            });

            if (data.historyId) {
                html += [
                    '<div style="display:flex;gap:8px;justify-content:center;',
                            'margin-top:16px;padding-top:16px;',
                            'border-top:1px solid rgba(255,255,255,.07)">',
                        '<span style="font-size:13px;color:var(--text-secondary);align-self:center">',
                            '이 추천이 마음에 드셨나요?',
                        '</span>',
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

            // 왜 이 곡들을 추천했는지 — 감정 분석 상세 (분석/태그 근거)
            html += _renderAnalysisDetail(em);
        }

        c.innerHTML = html;
    }

    /* ── 미리듣기 재생 ───────────────────────── */
    function _playPreview(idx) {
        var t = _currentTracks[idx];
        if (!t) return;

        if (!t.previewUrl) {
            alert('이 트랙은 미리듣기가 제공되지 않습니다.');
            return;
        }

        if (_playingIndex === idx && _audio && !_audio.paused) {
            _audio.pause();
            _setPlayingState(-1);
            return;
        }

        if (_audio) {
            _audio.pause();
            _audio.src = t.previewUrl;
            _audio.play().catch(function (e) {
                console.warn('재생 실패:', e);
            });
        }

        _setPlayingState(idx);
        _updateBar(t);

        fetch('/api/play-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                spotifyTrackId: t.spotifyTrackId || '',
                trackName:      t.name   || '',
                artistName:     t.artist || '',
                source:         'sync_rec',
                emotionVectorId: null
            })
        }).catch(function () {});
    }

    /* ── 피드백 ──────────────────────────────── */
    function _feedback(historyId, val) {
        fetch('/api/sync/feedback/' + historyId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ feedback: val })
        }).then(function () {
            alert(val === 1 ? '👍 피드백 감사합니다!' : '👎 더 좋은 추천을 위해 노력할게요!');
        }).catch(function () {});
    }

    /* ── 이미지 제거 ─────────────────────────── */
    function _removeImage(i) {
        imgs.splice(i, 1);
        _renderPreviews();
    }

    /* ── 메시지 전송 (핵심) ─────────────────── */
    function _sendMessage() {
        var ta   = document.getElementById('sync-textarea');
        var text = ta ? ta.value.trim() : '';

        if (!text && imgs.length === 0) {
            alert('텍스트나 이미지를 입력해주세요.');
            return;
        }

        _showLoading();

        var inputType = 'text';
        if (text && imgs.length > 0) inputType = 'both';
        else if (imgs.length > 0)    inputType = 'image';

        var req = {
            inputType: inputType,
            inputText: text || null,
            imageUrl:  imgs.length > 0 ? imgs[0].src : null
        };

        if (ta) ta.value = '';
        imgs = [];
        _renderPreviews();

        fetch('/api/sync/full-recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(req)
        })
        .then(function (res) {
            if (res.status === 401) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');
            if (!res.ok) return res.json().then(function (e) {
                throw new Error(e.error || '추천 실패 (status: ' + res.status + ')');
            });
            return res.json();
        })
        .then(function (data) {
            _renderResults(data);
        })
        .catch(function (e) {
            _showError(e.message);
        });
    }

    /* ── 초기화 (DOMContentLoaded 후 실행) ──── */
    document.addEventListener('DOMContentLoaded', function () {
        _audio = new Audio();

        // 이미지 첨부 이벤트
        var ab = document.getElementById('sync-attach-btn');
        var fi = document.getElementById('sync-file-input');
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

        // 오디오 종료 이벤트
        _audio.addEventListener('ended', function () { _setPlayingState(-1); });

        // ✅ SyncPage 메서드 오버라이드 (navigation.js const 선언 이후 프로퍼티만 변경)
        if (typeof SyncPage !== 'undefined') {
            SyncPage.sendMessage = _sendMessage;
            SyncPage.playPreview = _playPreview;
            SyncPage.removeImage = _removeImage;
            SyncPage.feedback    = _feedback;
        }
    });

})();
