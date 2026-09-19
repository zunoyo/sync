/**
 * SYNC Sync AI — API 연동
 * navigation.js의 SyncPage.sendMessage를 서버 API 버전으로 오버라이드
 */
(function () {

    var imgs          = [];
    var _currentTracks = [];

    var EMOTION_EMOJI_LABELS = {
        happy:'😊 행복', sad:'😢 슬픔', calm:'😌 차분',
        energetic:'⚡ 활기', romantic:'💕 로맨틱',
        melancholy:'🌧 감성', angry:'🔥 강렬', dreamy:'🌙 몽환'
    };

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
        });
    }

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

    /* ── 오브(sync-flare-hero) 상태 + 캡션 전환 ── */
    function _setOrbState(state, caption) {
        var orb = document.getElementById('sync-flare-hero');
        var cap = document.getElementById('sync-orb-caption');
        if (orb) orb.className = 'sync-flare-hero' + (state ? ' state-' + state : '');
        if (cap) {
            cap.textContent = caption;
            cap.classList.toggle('active', state === 'loading' || state === 'done');
        }
    }

    /* ── 로딩 표시 ───────────────────────────── */
    function _showLoading() {
        _setOrbState('loading', '감정을 분석하고 있어요');
        var c = document.getElementById('sync-results');
        if (!c) return;
        c.innerHTML = [
            '<div class="result-area">',
                '<div class="sync-loading-stage">',
                    '<div class="sync-loading-visual">',
                        '<div class="sync-loading-orb">',
                            '<div class="sync-loading-orb-ring"></div>',
                            '<div class="sync-loading-orb-ring ring2"></div>',
                            '<div class="sync-loading-orb-core">🎧</div>',
                        '</div>',
                        '<div class="sync-analyzing">',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                            '<div class="eq-bar"></div>',
                        '</div>',
                    '</div>',
                    '<span class="sync-loading-text">',
                        '감정을 분석하고 있어요',
                        '<span class="sync-dots"><span></span><span></span><span></span></span>',
                    '</span>',
                '</div>',
            '</div>'
        ].join('');
    }

    /* ── 분석 완료 전환 표시 (애니메이션이 끊기지 않도록 결과 렌더 직전에 잠깐 표시) ── */
    function _showFinishing() {
        _setOrbState('done', '분석 완료');
    }

    /* ── 오류 표시 ───────────────────────────── */
    function _showError(msg) {
        _setOrbState('', msg);
        var c = document.getElementById('sync-results');
        if (!c) return;
        c.innerHTML = '<div class="result-area" style="text-align:center;color:var(--negative);padding:20px 0">' + msg + '</div>';
    }

    /* ── idle 상태의 #sync-results 렌더 (로그인 안내 / 감정 통계 / 빈 안내) ──
       개별 과거 입력을 다시 보여주는 게 아니라, "요즘 나는 어떤 감정으로 음악을
       찾았나"를 한눈에 보여주는 집계 통계로 채운다. */
    function _computeStats(list) {
        if (!list || list.length === 0) return null;
        var counts = {};
        var confSum = 0, confN = 0;
        var vSum = 0, aSum = 0, vaN = 0;
        list.forEach(function (h) {
            if (h.primaryEmotion) counts[h.primaryEmotion] = (counts[h.primaryEmotion] || 0) + 1;
            if (h.confidence != null) { confSum += h.confidence; confN++; }
            if (h.valence != null && h.arousal != null) { vSum += h.valence; aSum += h.arousal; vaN++; }
        });
        var breakdown = Object.keys(counts)
            .map(function (k) { return [k, counts[k]]; })
            .sort(function (a, b) { return b[1] - a[1]; });
        return {
            total: list.length,
            breakdown: breakdown,
            avgConfidence: confN ? confSum / confN : null,
            avgValence: vaN ? vSum / vaN : null,
            avgArousal: vaN ? aSum / vaN : null
        };
    }

    function _renderStats(stats) {
        var c = document.getElementById('sync-results');
        if (!c) return;

        if (!stats || stats.breakdown.length === 0) {
            c.innerHTML = '<div class="result-area" style="text-align:center;color:var(--text-secondary);' +
                'padding:20px 0;font-size:13px">' +
                '기분이나 상황을 적거나 사진을 올려보세요 — Sync AI가 어울리는 음악을 찾아드려요.' +
            '</div>';
            return;
        }

        var top = stats.breakdown[0];
        var topLabel = EMOTION_EMOJI_LABELS[top[0]] || top[0];
        var confPct = stats.avgConfidence != null ? Math.round(stats.avgConfidence * 100) : null;

        var summary = '최근 <b>' + stats.total + '번</b> 분석했고, 그중 <b>' + _esc(topLabel) +
            '</b>이(가) <b>' + top[1] + '번</b>으로 가장 많았어요.';
        if (stats.avgValence != null) {
            summary += ' 전반적으로 <b>' + _vaLabel(stats.avgValence) + '</b>이고 <b>' +
                _arLabel(stats.avgArousal) + '</b>인 감정이 많았어요.';
        }

        var bars = stats.breakdown.map(function (entry) {
            var emotion = entry[0], count = entry[1];
            var pct = Math.round((count / stats.total) * 100);
            var label = EMOTION_EMOJI_LABELS[emotion] || emotion;
            var emoji = label.slice(0, 2);
            var subLabel = label.replace(/^[^\s]+\s/, '');
            return '<div class="sync-stats-row">' +
                '<span class="sync-stats-emoji">' + emoji + '</span>' +
                '<span class="sync-stats-label">' + _esc(subLabel) + '</span>' +
                '<span class="sync-stats-bar-track"><span class="sync-stats-bar-fill" style="width:' + pct + '%"></span></span>' +
                '<span class="sync-stats-count">' + count + '</span>' +
            '</div>';
        }).join('');

        c.innerHTML = '<div class="result-area sync-stats">' +
            '<div class="sync-stats-title">최근 감정 분석 통계</div>' +
            '<div class="sync-stats-summary">' + summary + '</div>' +
            '<div class="sync-stats-bars">' + bars + '</div>' +
            (confPct != null ? '<div class="sync-stats-conf">평균 분석 신뢰도 ' + confPct + '%</div>' : '') +
        '</div>';
    }

    function _renderIdle() {
        _setOrbState('', '지금 기분이나 상황을 알려주세요');
        if (typeof Auth === 'undefined' || !Auth.isLoggedIn()) {
            var c = document.getElementById('sync-results');
            if (c) c.innerHTML = '<div class="result-area" style="text-align:center;color:var(--text-secondary);' +
                'padding:20px 0">로그인하면 AI 음악 추천을 받아볼 수 있어요.</div>';
            return;
        }
        fetch('/api/sync/emotion-history', { credentials: 'include' })
            .then(function (res) { return res.ok ? res.json() : []; })
            .then(function (list) { _renderStats(_computeStats(list)); })
            .catch(function () {});
    }

    /* ── 시간 포맷 ───────────────────────────── */
    function _fmt(ms) {
        if (!ms) return '--:--';
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
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
                    'fill="rgba(245,238,240,.03)" stroke="rgba(245,238,240,.12)" stroke-width="1" rx="6"/>',
                '<line x1="' + PAD + '" y1="' + (PAD + ph / 2) + '" x2="' + (PAD + pw) + '" y2="' + (PAD + ph / 2) + '" ' +
                    'stroke="rgba(245,238,240,.15)" stroke-width="1"/>',
                '<line x1="' + (PAD + pw / 2) + '" y1="' + PAD + '" x2="' + (PAD + pw / 2) + '" y2="' + (PAD + ph) + '" ' +
                    'stroke="rgba(245,238,240,.15)" stroke-width="1"/>',
                '<text x="' + (PAD + 8) + '" y="' + (PAD + 16) + '" font-size="9" fill="rgba(245,238,240,.38)">화남·불안</text>',
                '<text x="' + (PAD + pw - 8) + '" y="' + (PAD + 16) + '" font-size="9" fill="rgba(245,238,240,.38)" text-anchor="end">신남·기쁨</text>',
                '<text x="' + (PAD + 8) + '" y="' + (PAD + ph - 8) + '" font-size="9" fill="rgba(245,238,240,.38)">우울·슬픔</text>',
                '<text x="' + (PAD + pw - 8) + '" y="' + (PAD + ph - 8) + '" font-size="9" fill="rgba(245,238,240,.38)" text-anchor="end">평온·만족</text>',
                '<text x="' + (PAD - 6) + '" y="' + (PAD + ph / 2 + 3) + '" font-size="10" fill="rgba(245,238,240,.55)" text-anchor="end">부정</text>',
                '<text x="' + (PAD + pw + 6) + '" y="' + (PAD + ph / 2 + 3) + '" font-size="10" fill="rgba(245,238,240,.55)">긍정</text>',
                '<text x="' + (PAD + pw / 2) + '" y="' + (PAD - 10) + '" font-size="10" fill="rgba(245,238,240,.55)" text-anchor="middle">활발</text>',
                '<text x="' + (PAD + pw / 2) + '" y="' + (PAD + ph + 20) + '" font-size="10" fill="rgba(245,238,240,.55)" text-anchor="middle">차분</text>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="11" style="fill:var(--accent)" opacity="0.22"/>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="5" style="fill:var(--accent)" stroke="#0a0a0a" stroke-width="1.5"/>',
            '</svg>'
        ].join('');
    }

    /* ── 분석 신뢰도 원형 게이지 ── */
    function _renderConfidenceGauge(pct, color) {
        color = color || 'var(--accent)';
        var r = 30, cx = 36, cy = 36;
        var circ = 2 * Math.PI * r;
        var offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
        return [
            '<svg viewBox="0 0 72 72" style="width:64px;height:64px;flex-shrink:0">',
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
                    'stroke="rgba(245,238,240,.1)" stroke-width="7"/>',
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" style="stroke:' + color + '" ' +
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
                        return '<tr style="border-bottom:1px solid rgba(245,238,240,.06)">' +
                            '<td style="padding:7px 6px 7px 0;color:var(--text-secondary);white-space:nowrap">' + r[0] + '</td>' +
                            '<td style="padding:7px 0;color:var(--text-base);font-weight:600;text-align:right">' + r[1] + '</td>' +
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
        var acc = em.modelValAccuracy != null ? Math.round(em.modelValAccuracy * 100) : null;
        var hasVA = em.valence != null && em.arousal != null;

        var tagsHtml = tags.length ? [
            '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">',
                '이 태그로 Last.fm에서 곡을 검색했어요',
            '</div>',
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">',
                tags.map(function (tag) {
                    return '<span style="background:rgba(245,238,240,.08);padding:3px 10px;' +
                        'border-radius:var(--radius-full);font-size:12px;color:var(--text-base)">#' + tag + '</span>';
                }).join(''),
            '</div>'
        ].join('') : '';

        return [
            '<div style="margin-top:16px;padding:16px;background:rgba(245,238,240,.04);',
                    'border-radius:var(--radius-md);border:1px solid rgba(245,238,240,.07)">',
                '<div style="font-size:14px;font-weight:700;color:var(--text-base);margin-bottom:14px">',
                    '🔍 이 곡들을 추천한 이유',
                '</div>',
                '<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:16px">',
                    '<div style="flex:1;min-width:180px">', _renderAnalysisTable(em, conf), '</div>',
                    '<div style="flex-shrink:0;display:flex;gap:14px">',
                        '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">',
                            _renderConfidenceGauge(conf),
                            '<span style="font-size:10px;color:var(--text-secondary);white-space:nowrap">분석 신뢰도</span>',
                        '</div>',
                        acc != null ? [
                            '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">',
                                _renderConfidenceGauge(acc, 'var(--info)'),
                                '<span style="font-size:10px;color:var(--text-secondary);white-space:nowrap">모델 정확도</span>',
                            '</div>'
                        ].join('') : '',
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
                    em.modelValAccuracy != null
                        ? ' "분석 신뢰도"는 이번 한 번의 결과가 얼마나 확실한지고, "모델 정확도"는 학습된 모델이 평소에 얼마나 잘 맞히는지를 나타내는 서로 다른 값이에요.'
                        : '',
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
            happy:'행복', sad:'슬픔', calm:'차분',
            energetic:'활기', romantic:'로맨틱',
            melancholy:'감성', angry:'강렬', dreamy:'몽환'
        };
        var conf = em.confidence ? Math.round(em.confidence * 100) : 0;

        var html = '';

        if (tr.length === 0) {
            html += [
                '<div style="padding:32px;text-align:center;color:var(--text-secondary)">',
                    '<div style="font-size:32px;margin-bottom:12px">🔍</div>',
                    '<div>추천할 트랙을 찾지 못했어요.<br>다른 감정으로 다시 시도해보세요.</div>',
                '</div>'
            ].join('');
        } else {
            html += [
                '<div class="result-meta">',
                    '<div class="result-emotion">' + (labels[em.primary] || em.primary || '-') + '</div>',
                    em.secondary
                        ? '<div class="result-secondary">' + (labels[em.secondary] || em.secondary) + '</div>'
                        : '',
                    '<div class="result-conf">' + conf + '% 신뢰도</div>',
                '</div>'
            ].join('');

            tr.forEach(function (t, i) {
                var dur = _fmt(t.durationMs);
                var art = t.albumArt
                    ? '<img src="' + t.albumArt + '" onerror="this.style.display=\'none\'" style="width:100%;height:100%;object-fit:cover;border-radius:5px">'
                    : '🎵';

                html += [
                    '<div class="track-rec" id="spt-' + i + '" onclick="SyncPage.playPreview(' + i + ')">',
                        '<div class="art">' + art + '</div>',
                        '<div class="main">',
                            '<div class="name">' + (t.name || '알 수 없음') + '</div>',
                            '<div class="artist">' + (t.artist || '') + (t.album ? ' · ' + t.album : '') + '</div>',
                        '</div>',
                        '<div class="play">',
                            '<span>' + dur + '</span>',
                            '<svg id="spi-' + i + '" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
                        '</div>',
                    '</div>'
                ].join('');
            });

            if (data.historyId) {
                html += [
                    '<div style="display:flex;gap:8px;justify-content:center;',
                            'margin-top:16px;padding-top:16px;',
                            'border-top:1px solid rgba(245,238,240,.1)">',
                        '<span style="font-size:13px;color:var(--text-secondary);align-self:center">',
                            '이 추천이 마음에 드셨나요?',
                        '</span>',
                        '<button onclick="SyncPage.feedback(' + data.historyId + ',1)" ',
                            'style="background:rgba(217,192,143,.15);border:1px solid var(--accent);',
                            'color:var(--accent);padding:6px 16px;border-radius:var(--radius-full);',
                            'font-size:13px;cursor:pointer;font-family:var(--font)">',
                            '👍 좋아요',
                        '</button>',
                        '<button onclick="SyncPage.feedback(' + data.historyId + ',0)" ',
                            'style="background:rgba(245,238,240,.06);border:1px solid rgba(245,238,240,.15);',
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

        c.innerHTML = '<div class="result-area sync-results-enter">' + html + '</div>';
    }

    /* ── 추천 트랙 재생 — 실제 메인 플레이어로 재생(큐/플레이어바와 자연스럽게 연동) ── */
    function _playPreview(idx) {
        var t = _currentTracks[idx];
        if (!t || typeof Player === 'undefined') return;
        Player.playTrack(t, _currentTracks, idx);
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
            // 분석 중 애니메이션이 뚝 끊기지 않도록, 완료 표시를 잠깐 보여준 뒤에 리스트를 띄움
            _showFinishing();
            setTimeout(function () { _renderResults(data); }, 700);
        })
        .catch(function (e) {
            _showError(e.message);
        });
    }

    /* ── 초기화 (DOMContentLoaded 후 실행) ──── */
    document.addEventListener('DOMContentLoaded', function () {
        // 이미지 첨부 이벤트
        var ab = document.getElementById('sync-attach-btn');
        var fi = document.getElementById('sync-file-input');
        var ta = document.getElementById('sync-textarea');
        if (ta) {
            ta.addEventListener('keydown', function (e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); _sendMessage(); }
            });
        }
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

        // ✅ SyncPage 메서드 오버라이드 (navigation.js const 선언 이후 프로퍼티만 변경)
        if (typeof SyncPage !== 'undefined') {
            SyncPage.sendMessage     = _sendMessage;
            SyncPage.playPreview     = _playPreview;
            SyncPage.removeImage     = _removeImage;
            SyncPage.feedback        = _feedback;
            SyncPage.renderIdle      = _renderIdle;
            // 이미 sync 페이지가 열려있는 상태로 스크립트가 붙는 경우(초기 로드)를 대비해 한 번 즉시 실행
            if (document.getElementById('page-sync')?.classList.contains('active')) _renderIdle();
        }
    });

})();
