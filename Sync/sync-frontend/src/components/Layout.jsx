import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import PlayerBar from './PlayerBar';
import RightPanel from './RightPanel';
import PlaylistPickerPopover from './PlaylistPickerPopover';

export default function Layout() {
  return (
    <div className="app-wrapper">
      <div className="app-shell">
        <Sidebar />
        <div className="app-main-area">
          <main className="main">
            <Topbar />
            <div className="content">
              <Outlet />
            </div>
          </main>
          <RightPanel />
        </div>
      </div>
      <PlayerBar />
      <PlaylistPickerPopover />
    </div>
  );
}
