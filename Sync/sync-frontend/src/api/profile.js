import { api } from './client';

export function updateProfile({ displayName, username, email }) {
  return api.put('/api/users/me/profile', { displayName, username, email });
}

export function changePassword(currentPassword, newPassword) {
  return api.put('/api/users/me/password', { currentPassword, newPassword });
}

export function deactivateAccount() { return api.post('/api/users/me/deactivate'); }
export function deleteAccount() { return api.delete('/api/users/me'); }

export function fetchSpotifyStatus() { return api.get('/api/spotify/status'); }
export function disconnectSpotify() { return api.delete('/api/spotify/disconnect'); }
export function connectSpotifyUrl() { return '/api/spotify/connect'; }
