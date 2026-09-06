import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PlayerProvider } from './context/PlayerContext'
import { LyricsProvider } from './context/LyricsContext'
import { ToastProvider } from './context/ToastContext'
import { AuthModalProvider } from './context/AuthModalContext'
import { PlaylistPickerProvider } from './context/PlaylistPickerContext'
import { FriendsProvider } from './context/FriendsContext'
import { LibraryProvider } from './context/LibraryContext'
import Splash from './components/Splash'
import AuthModal from './components/AuthModal'
import Layout from './components/Layout'
import Home from './pages/Home'
import Search from './pages/Search'
import GenreDetail from './pages/GenreDetail'
import ArtistDetail from './pages/ArtistDetail'
import AlbumDetail from './pages/AlbumDetail'
import Friends from './pages/Friends'
import Sync from './pages/Sync'
import Playlists from './pages/Playlists'
import PlaylistDetail from './pages/PlaylistDetail'
import Profile from './pages/Profile'
import Login from './pages/Login'
import Signup from './pages/Signup'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <PlayerProvider>
          <LyricsProvider>
            <LibraryProvider>
              <AuthModalProvider>
                <PlaylistPickerProvider>
                  <FriendsProvider>
                    <Splash />
                    <AuthModal />
                    <Routes>
                      <Route path="/login" element={<Login />} />
                      <Route path="/signup" element={<Signup />} />

                      <Route element={<Layout />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/genre/:name" element={<GenreDetail />} />
                        <Route path="/artist/:name" element={<ArtistDetail />} />
                        <Route path="/album/:externalId" element={<AlbumDetail />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/sync" element={<Sync />} />
                        <Route path="/playlists" element={<Playlists />} />
                        <Route path="/playlists/:id" element={<PlaylistDetail />} />
                        <Route path="/profile" element={<Profile />} />
                      </Route>
                    </Routes>
                  </FriendsProvider>
                </PlaylistPickerProvider>
              </AuthModalProvider>
            </LibraryProvider>
          </LyricsProvider>
        </PlayerProvider>
      </ToastProvider>
    </AuthProvider>
  )
}
