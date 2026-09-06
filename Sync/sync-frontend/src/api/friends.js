import { api } from './client';

const GRADS = ['grad-1', 'grad-2', 'grad-3', 'grad-4', 'grad-5', 'grad-6', 'grad-7', 'grad-8'];

export function friendGradient(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return GRADS[h % GRADS.length];
}
export function friendInitials(name) {
  const s = String(name || '?').trim();
  return s.slice(0, 2) || '?';
}

export function fetchFriends() { return api.get('/api/friends'); }
export function fetchFriendRequests() { return api.get('/api/friends/requests'); }
export function sendFriendRequest(target) { return api.post('/api/friends/request', { target }); }
export function acceptFriendRequest(id) { return api.post(`/api/friends/accept/${id}`); }
export function rejectFriendRequest(id) { return api.post(`/api/friends/reject/${id}`); }
export function fetchFriendPlaylists(friendUserId) { return api.get(`/api/friends/${friendUserId}/playlists`); }
