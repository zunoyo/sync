import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './styles/variables.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components/sidebar.css'
import './styles/components/topbar.css'
import './styles/components/player.css'
import './styles/components/cards.css'
import './styles/components/playlist-picker.css'
import './styles/components/right-panel.css'
import './styles/pages/home.css'
import './styles/pages/search.css'
import './styles/pages/friends.css'
import './styles/pages/sync.css'
import './styles/pages/playlist.css'
import './styles/pages/profile.css'
import './styles/pages/detail.css'
import './styles/pages/auth.css'
import './styles/pages/auth-standalone.css'
import './styles/pages/splash.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
