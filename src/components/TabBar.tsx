import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { getActiveForumId } from '../lib/activeForum';
import { cx } from '../lib/cx';
import { t } from '../lib/i18n';

type TabId = 'forums' | 'messages' | 'settings';

const ICONS: Record<TabId, React.ReactNode> = {
  forums: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <path d="M7 21l3-3h7" />
      <path d="M7 9h10M7 13h6" />
    </svg>
  ),
  messages: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 20l1-4.5a8.38 8.38 0 0 1-1-4A8.5 8.5 0 0 1 21 11.5z" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4 16.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.1l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
};

const TABS: TabId[] = ['forums', 'messages', 'settings'];
const TAB_LABELS = {
  forums: 'tabs.forums',
  messages: 'tabs.messages',
  settings: 'tabs.settings'
} as const;

export function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const active: TabId = pathname.startsWith('/settings')
    ? 'settings'
    : pathname.includes('/pm') || pathname.startsWith('/messages')
      ? 'messages'
      : 'forums';

  const go = (id: TabId) => {
    if (id === 'settings') return navigate('/settings');
    if (id === 'forums') return navigate('/forums');
    const forumId = getActiveForumId();
    navigate(forumId != null ? `/f/${forumId}/pm` : '/messages');
  };

  return (
    <nav aria-label="Primary" className="tab-bar fixed bottom-0 inset-x-0 z-30">
      <div className="mx-auto max-w-md px-3 pb-3">
        <div className="glass border border-line rounded-2xl shadow-[0_-2px_30px_-10px_rgb(0_0_0/0.2)] flex">
          {TABS.map((tab) => {
            const isActive = active === tab;
            return (
              <button
                key={tab}
                onClick={() => go(tab)}
                className={cx(
                  'relative flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-accent' : 'text-ink-dim'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-1 rounded-xl bg-[rgb(var(--accent)/0.12)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{ICONS[tab]}</span>
                <span className="relative">{t(TAB_LABELS[tab])}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
