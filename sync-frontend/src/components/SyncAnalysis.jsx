import { arLabel, parseTags, vaLabel } from '../api/sync';

export function ConfidenceGauge({ pct }) {
  const r = 30, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg viewBox="0 0 72 72" style={{ width: 64, height: 64, flexShrink: 0 }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="7" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" style={{ stroke: 'var(--accent)' }}
        strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} fontSize="15" fontWeight="700" fill="#fff" textAnchor="middle">{pct}%</text>
    </svg>
  );
}

export function VAPlot({ valence, arousal }) {
  const v = Math.max(-1, Math.min(1, valence));
  const a = Math.max(-1, Math.min(1, arousal));
  const W = 240, H = 240, PAD = 30;
  const pw = W - PAD * 2, ph = H - PAD * 2;
  const cx = PAD + (v + 1) / 2 * pw;
  const cy = PAD + (1 - a) / 2 * ph;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 230, height: 'auto', display: 'block', margin: '0 auto' }}>
      <rect x={PAD} y={PAD} width={pw} height={ph} fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.12)" strokeWidth="1" rx="6" />
      <line x1={PAD} y1={PAD + ph / 2} x2={PAD + pw} y2={PAD + ph / 2} stroke="rgba(255,255,255,.15)" strokeWidth="1" />
      <line x1={PAD + pw / 2} y1={PAD} x2={PAD + pw / 2} y2={PAD + ph} stroke="rgba(255,255,255,.15)" strokeWidth="1" />
      <text x={PAD + 8} y={PAD + 16} fontSize="9" fill="rgba(255,255,255,.38)">화남·불안</text>
      <text x={PAD + pw - 8} y={PAD + 16} fontSize="9" fill="rgba(255,255,255,.38)" textAnchor="end">신남·기쁨</text>
      <text x={PAD + 8} y={PAD + ph - 8} fontSize="9" fill="rgba(255,255,255,.38)">우울·슬픔</text>
      <text x={PAD + pw - 8} y={PAD + ph - 8} fontSize="9" fill="rgba(255,255,255,.38)" textAnchor="end">평온·만족</text>
      <text x={PAD - 6} y={PAD + ph / 2 + 3} fontSize="10" fill="rgba(255,255,255,.55)" textAnchor="end">부정</text>
      <text x={PAD + pw + 6} y={PAD + ph / 2 + 3} fontSize="10" fill="rgba(255,255,255,.55)">긍정</text>
      <text x={PAD + pw / 2} y={PAD - 10} fontSize="10" fill="rgba(255,255,255,.55)" textAnchor="middle">활발</text>
      <text x={PAD + pw / 2} y={PAD + ph + 20} fontSize="10" fill="rgba(255,255,255,.55)" textAnchor="middle">차분</text>
      <circle cx={cx} cy={cy} r="11" style={{ fill: 'var(--accent)' }} opacity="0.22" />
      <circle cx={cx} cy={cy} r="5" style={{ fill: 'var(--accent)' }} stroke="#0a0a0a" strokeWidth="1.5" />
    </svg>
  );
}

function AnalysisTable({ em, conf }) {
  const rows = [
    ['1차 감정', em.primary || '—'],
    ['2차 감정', em.secondary || '—'],
    ['긍정도 (valence)', em.valence != null ? `${em.valence.toFixed(2)} · ${vaLabel(em.valence)}` : '—'],
    ['활성도 (arousal)', em.arousal != null ? `${em.arousal.toFixed(2)} · ${arLabel(em.arousal)}` : '—'],
  ];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <td style={{ padding: '7px 6px 7px 0', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{label}</td>
            <td style={{ padding: '7px 0', color: '#fff', fontWeight: 600, textAlign: 'right' }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AnalysisDetail({ emotion }) {
  const tags = parseTags(emotion.tags);
  const conf = emotion.confidence ? Math.round(emotion.confidence * 100) : 0;
  const hasVA = emotion.valence != null && emotion.arousal != null;

  return (
    <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,.04)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,.07)' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 14 }}>🔍 이 곡들을 추천한 이유</div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 180 }}><AnalysisTable em={emotion} conf={conf} /></div>
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <ConfidenceGauge pct={conf} />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>분석 신뢰도</span>
        </div>
      </div>

      {hasVA && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, textAlign: 'center' }}>감정 좌표 (긍정도 · 활성도)</div>
          <VAPlot valence={emotion.valence} arousal={emotion.arousal} />
          <div style={{ height: 14 }} />
        </>
      )}

      {tags.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>이 태그로 Last.fm에서 곡을 검색했어요</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {tags.map((tag) => (
              <span key={tag} style={{ background: 'rgba(255,255,255,.08)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: 12, color: '#fff' }}>#{tag}</span>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        입력하신 내용을 CLIP으로 분석해 위 감정·태그를 추출하고, 그 태그로 Last.fm에서 인기 트랙을 찾은 뒤 Spotify에서 앨범아트·미리듣기를 매칭해 추천했어요.
      </div>
    </div>
  );
}
