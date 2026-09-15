import { api } from './client';

export function fetchSavedArtists() { return api.get('/api/library/artists'); }
export function fetchSavedAlbums() { return api.get('/api/library/albums'); }

export function saveArtist({ artistName, artistExternalId, artistImageUrl }) {
  return api.post('/api/library/artists', { artistName, artistExternalId, artistImageUrl });
}
export function unsaveArtist(id) { return api.delete(`/api/library/artists/${id}`); }

export function saveAlbum({ albumExternalId, albumName, artistName, albumArtUrl, releaseYear }) {
  return api.post('/api/library/albums', { albumExternalId, albumName, artistName, albumArtUrl, releaseYear });
}
export function unsaveAlbum(id) { return api.delete(`/api/library/albums/${id}`); }
