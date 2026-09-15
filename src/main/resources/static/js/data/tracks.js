/**
 * SOUNDWAVE — Global Data
 *
 * 확장 방법
 *   트랙 추가   : TRACKS 배열에 항목 추가 (id 는 순차)
 *   플레이리스트: PLAYLISTS 에 항목 추가 + trackIds 지정
 *   아티스트    : ARTISTS 에 항목 추가  + trackIds 지정
 *   앨범        : ALBUMS 에 항목 추가   + trackIds 지정
 */

/* ── 트랙 ── */
const TRACKS = [
  { id:1,  emoji:'🎤', gradient:'grad-4', name:'Supernova',         artist:'aespa',           album:'Armageddon',      duration:'3:13', durationSec:193 },
  { id:2,  emoji:'💜', gradient:'grad-5', name:'Dynamite',          artist:'BTS',             album:'BE',              duration:'3:19', durationSec:199 },
  { id:3,  emoji:'🌸', gradient:'grad-7', name:'Celebrity',         artist:'IU',              album:'LILAC',           duration:'3:16', durationSec:196 },
  { id:4,  emoji:'🔥', gradient:'grad-3', name:'PINK VENOM',        artist:'BLACKPINK',       album:'BORN PINK',       duration:'3:06', durationSec:186 },
  { id:5,  emoji:'💎', gradient:'grad-6', name:'Butter',            artist:'BTS',             album:'Butter',          duration:'2:44', durationSec:164 },
  { id:6,  emoji:'🌙', gradient:'grad-2', name:'Next Level',        artist:'aespa',           album:'Savage',          duration:'3:55', durationSec:235 },
  { id:7,  emoji:'❄️', gradient:'grad-1', name:'Eight',             artist:'IU (feat. SUGA)', album:'Eight',           duration:'3:07', durationSec:187 },
  { id:8,  emoji:'👑', gradient:'grad-8', name:'How You Like That', artist:'BLACKPINK',       album:'THE ALBUM',       duration:'3:00', durationSec:180 },
  { id:9,  emoji:'🎵', gradient:'grad-5', name:'Love Dive',         artist:'IVE',             album:'LOVE DIVE',       duration:'2:59', durationSec:179 },
  { id:10, emoji:'⭐', gradient:'grad-3', name:'Hype Boy',          artist:'NewJeans',        album:'NewJeans 1st EP', duration:'3:04', durationSec:184 },
];

/* ── 플레이리스트 (trackIds 포함) ── */
const PLAYLISTS = [
  { id:1, emoji:'💚', gradient:'grad-1', name:'좋아요 표시한 곡',      type:'플레이리스트', count:10, trackIds:[1,2,3,4,5,6,7,8,9,10] },
  { id:2, emoji:'🎸', gradient:'grad-3', name:'인디 Mix',             type:'플레이리스트', count:6,  trackIds:[2,3,5,7,9,10] },
  { id:3, emoji:'🚗', gradient:'grad-3', name:'드라이브 플레이리스트', type:'플레이리스트', count:6,  trackIds:[1,4,5,8,9,10] },
  { id:4, emoji:'🌊', gradient:'grad-2', name:'Lo-Fi Beats',          type:'플레이리스트', count:3,  trackIds:[3,6,7] },
  { id:5, emoji:'❤️', gradient:'grad-4', name:'K-Pop 인기 차트',      type:'플레이리스트', count:10, trackIds:[1,2,3,4,5,6,7,8,9,10] },
  { id:6, emoji:'🌅', gradient:'grad-7', name:'아침 루틴',            type:'플레이리스트', count:5,  trackIds:[5,9,10,1,2] },
  { id:7, emoji:'🎹', gradient:'grad-6', name:'클래식 집중',          type:'플레이리스트', count:2,  trackIds:[3,7] },
  { id:8, emoji:'🏃', gradient:'grad-8', name:'운동 플레이리스트',    type:'플레이리스트', count:4,  trackIds:[1,4,5,8] },
];

/* ── 아티스트 (trackIds + genre 포함) ── */
const ARTISTS = [
  { id:1, emoji:'👩', gradient:'grad-4', name:'aespa',     genre:'K-Pop / 일렉트로닉', trackIds:[1,6],    description:'SM 엔터테인먼트 소속 4인조 걸그룹' },
  { id:2, emoji:'🎤', gradient:'grad-6', name:'BTS',       genre:'K-Pop / 힙합',       trackIds:[2,5],    description:'빅히트 뮤직 소속 7인조 보이그룹' },
  { id:3, emoji:'🌸', gradient:'grad-7', name:'IU',        genre:'K-Pop / 발라드',     trackIds:[3,7],    description:'카카오 엔터테인먼트 소속 솔로 가수' },
  { id:4, emoji:'💜', gradient:'grad-5', name:'BLACKPINK', genre:'K-Pop / 팝',         trackIds:[4,8],    description:'YG 엔터테인먼트 소속 4인조 걸그룹' },
  { id:5, emoji:'🔥', gradient:'grad-3', name:'G-Dragon',  genre:'힙합 / K-Pop',       trackIds:[4,5,10], description:'YG 엔터테인먼트 소속 솔로 아티스트' },
  { id:6, emoji:'🌿', gradient:'grad-8', name:'NewJeans',  genre:'K-Pop / 하이틴 팝',  trackIds:[9,10],   description:'어도어 소속 5인조 걸그룹' },
];

/* ── 앨범 ── */
const ALBUMS = [
  { id:1, emoji:'🎤', gradient:'grad-4', name:'Armageddon',      artist:'aespa',     year:'2024', type:'앨범', trackIds:[1,6]  },
  { id:2, emoji:'💜', gradient:'grad-5', name:'BE',              artist:'BTS',       year:'2020', type:'앨범', trackIds:[2,5]  },
  { id:3, emoji:'🌸', gradient:'grad-7', name:'LILAC',           artist:'IU',        year:'2021', type:'앨범', trackIds:[3,7]  },
  { id:4, emoji:'🔥', gradient:'grad-3', name:'BORN PINK',       artist:'BLACKPINK', year:'2022', type:'앨범', trackIds:[4,8]  },
  { id:5, emoji:'🎵', gradient:'grad-5', name:'LOVE DIVE',       artist:'IVE',       year:'2022', type:'앨범', trackIds:[9]    },
  { id:6, emoji:'⭐', gradient:'grad-3', name:'NewJeans 1st EP', artist:'NewJeans',  year:'2022', type:'앨범', trackIds:[10]   },
];

/* ── 친구 목록 ── */
const FRIENDS = [
  { id:1, name:'김지수', initials:'JK', gradient:'grad-4', online:true  },
  { id:2, name:'박민준', initials:'MJ', gradient:'grad-2', online:true  },
  { id:3, name:'이서연', initials:'SY', gradient:'grad-5', online:true  },
  { id:4, name:'최현우', initials:'HW', gradient:'grad-3', online:false },
  { id:5, name:'강나연', initials:'NY', gradient:'grad-1', online:true  },
  { id:6, name:'윤도현', initials:'DH', gradient:'grad-8', online:false },
];

/* ── 친구별 공유 플레이리스트 ── */
const FRIEND_PLAYLISTS = {
  1: [
    { id:'jk1', name:'aespa 완전판',    emoji:'🎤', gradient:'grad-4', trackIds:[1,6,7]   },
    { id:'jk2', name:'새벽 드라이브',   emoji:'🚗', gradient:'grad-3', trackIds:[4,8,10]  },
  ],
  2: [
    { id:'mj1', name:'BTS 노래방 모음', emoji:'💜', gradient:'grad-5', trackIds:[2,5,7]   },
    { id:'mj2', name:'K-Pop 파티',      emoji:'🎉', gradient:'grad-7', trackIds:[1,4,8,9] },
  ],
  3: [
    { id:'sy1', name:'IU 감성 모음',    emoji:'🌸', gradient:'grad-7', trackIds:[3,7]     },
    { id:'sy2', name:'Lo-Fi 공부',      emoji:'📚', gradient:'grad-2', trackIds:[6,5,3]   },
  ],
  4: [
    { id:'hw1', name:'운동할 때',       emoji:'💪', gradient:'grad-8', trackIds:[2,4,10]  },
  ],
  5: [
    { id:'ny1', name:'IVE 최애',        emoji:'⭐', gradient:'grad-5', trackIds:[9,8]     },
    { id:'ny2', name:'K-Pop 히트 2024', emoji:'🔥', gradient:'grad-3', trackIds:[1,2,3,4] },
  ],
  6: [
    { id:'dh1', name:'어쿠스틱 감성',   emoji:'🎸', gradient:'grad-1', trackIds:[3,6,7]   },
  ],
};

/* ── 친구 요청 ── */
const FRIEND_REQUESTS = [
  { id:101, name:'정유진', initials:'YJ', gradient:'grad-7', username:'yujin_music', since:'2시간 전' },
  { id:102, name:'임채원', initials:'CW', gradient:'grad-3', username:'chaewon_99',  since:'어제'    },
];

/* ── Sync 무드 ── */
const SYNC_MOODS = [
  '😊 기분 좋을 때', '😢 감성 충전', '💪 운동할 때', '🌙 밤에 혼자',
  '🚗 드라이브',     '📚 집중할 때', '🎉 파티 분위기', '☕ 여유로운 아침',
];

/* ── right-panel.js 에서 사용 (삭제 금지) ── */
const LYRICS_LINES = [
  '내가 바라던 세상은', '너로 가득 찬 곳이었어',
  "But now I'm reaching for the stars", '전부 다 걸고 뛰어올라',
  'Supernova, 눈부신 빛', '넌 나의 전부야',
  '어둠 속에서도 빛나는', '너만의 universe',
];
const QUEUE_TRACKS = [TRACKS[1], TRACKS[2], TRACKS[3], TRACKS[4]];
