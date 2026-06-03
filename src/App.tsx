import { useEffect, useState } from 'react';
import {
  HashRouter,
  Navigate,
  Route,
  Routes
} from 'react-router-dom';
import { LoadingScreen } from './components/Spinner';
import { TabBar } from './components/TabBar';
import { getActiveForumId } from './lib/activeForum';
import { hasVault, restoreSession } from './lib/vault';
import { ThemeProvider } from './theme/ThemeProvider';
import { useForums } from './hooks/useForums';
import { useSettings } from './hooks/useSettings';
import { useVaultUnlocked } from './hooks/useVault';
import { AddForum } from './screens/AddForum';
import { Categories } from './screens/Categories';
import { Compose } from './screens/Compose';
import { Forums } from './screens/Forums';
import { Lock } from './screens/Lock';
import { MessageView } from './screens/MessageView';
import { Messages } from './screens/Messages';
import { PmList } from './screens/PmList';
import { Settings } from './screens/Settings';
import { Thread } from './screens/Thread';
import { TopicList } from './screens/TopicList';

export function App() {
  const settings = useSettings();
  const unlocked = useVaultUnlocked();
  const [vaultExists, setVaultExists] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);

  // On boot, try to revive the key cached from before a page reload so the
  // user isn't re-prompted. A genuine cold start finds no match and stays
  // locked. Runs once; later lock/unlock transitions don't need it.
  useEffect(() => {
    restoreSession().finally(() => setRestored(true));
  }, []);

  // Re-check whether a vault exists whenever the lock state changes (covers
  // first-time setup and "reset vault").
  useEffect(() => {
    hasVault().then(setVaultExists);
  }, [unlocked]);

  if (!settings || vaultExists === null || !restored) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider accent={settings.accentColor} mode={settings.themeMode}>
      {unlocked ? (
        <HashRouter>
          <div className="app-shell">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/forums" element={<Forums />} />
              <Route path="/forums/add" element={<AddForum />} />
              <Route path="/f/:forumId" element={<Categories />} />
              <Route path="/f/:forumId/sub/:catId" element={<TopicList />} />
              <Route path="/f/:forumId/t/:topicId" element={<Thread />} />
              <Route path="/f/:forumId/pm" element={<Messages />} />
              <Route path="/f/:forumId/pm/:boxId" element={<PmList />} />
              <Route path="/f/:forumId/pm/:boxId/:msgId" element={<MessageView />} />
              <Route path="/f/:forumId/compose" element={<Compose />} />
              <Route path="/messages" element={<MessagesRedirect />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <TabBar />
          </div>
        </HashRouter>
      ) : (
        <Lock existing={vaultExists} />
      )}
    </ThemeProvider>
  );
}

/** Landing route: open the favorite forum if set, otherwise the forum list. */
function Home() {
  const settings = useSettings();
  const forums = useForums();
  if (!settings || !forums) return <LoadingScreen />;

  const fav = settings.favoriteForumId;
  if (fav != null && forums.some((f) => f.id === fav)) {
    return <Navigate to={`/f/${fav}`} replace />;
  }
  return <Navigate to="/forums" replace />;
}

/** Messages tab with no forum context: pick the most relevant forum. */
function MessagesRedirect() {
  const settings = useSettings();
  const forums = useForums();
  if (!settings || !forums) return <LoadingScreen />;

  const active = getActiveForumId();
  const target =
    active != null && forums.some((f) => f.id === active)
      ? active
      : settings.favoriteForumId != null &&
          forums.some((f) => f.id === settings.favoriteForumId)
        ? settings.favoriteForumId
        : (forums[0]?.id ?? null);

  return target != null ? (
    <Navigate to={`/f/${target}/pm`} replace />
  ) : (
    <Navigate to="/forums" replace />
  );
}
