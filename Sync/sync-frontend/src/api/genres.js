export const GENRES = [
  { name: 'K-Pop', emoji: '🎤', grad: 'grad-4', query: 'kpop' },
  { name: '힙합', emoji: '🎧', grad: 'grad-6', query: 'hip hop' },
  { name: '인디', emoji: '🎸', grad: 'grad-1', query: 'indie alternative rock' },
  { name: 'R&B', emoji: '🎵', grad: 'grad-3', query: 'rnb soul' },
  { name: '팝', emoji: '⭐', grad: 'grad-5', query: 'pop hits' },
  { name: 'Lo-Fi', emoji: '🌙', grad: 'grad-2', query: 'lofi chill beats' },
  { name: '클래식', emoji: '🎻', grad: 'grad-7', query: 'classical music' },
  { name: '재즈', emoji: '🎺', grad: 'grad-8', query: 'jazz' },
  { name: '발라드', emoji: '💔', grad: 'grad-7', query: 'ballad korean', bg: 'linear-gradient(135deg,#ff9a9e,#fecfef)' },
  { name: '전자음악', emoji: '🎛️', grad: 'grad-2', query: 'electronic dance music', bg: 'linear-gradient(135deg,#a1c4fd,#c2e9fb)' },
  { name: '어쿠스틱', emoji: '🪗', grad: 'grad-1', query: 'acoustic guitar', bg: 'linear-gradient(135deg,#fddb92,#d1fdff)', darkLabel: true },
  { name: '트로트', emoji: '🌺', grad: 'grad-7', query: 'trot korean', bg: 'linear-gradient(135deg,#e0c3fc,#8ec5fc)' },
];

// iTunes primaryGenreName과 대조해 실제로 그 장르가 맞는 곡만 걸러낼 때 쓰는 기준 문자열
export const GENRE_FILTERS = {
  'K-Pop': ['k-pop'],
  '힙합': ['hip-hop', 'rap'],
  '인디': ['alternative', 'indie'],
  'R&B': ['r&b', 'soul'],
  '팝': ['pop'],
  '클래식': ['classical'],
  '재즈': ['jazz'],
  '전자음악': ['electronic', 'dance'],
};
