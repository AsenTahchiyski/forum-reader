import { useNavigate } from 'react-router-dom';
import { t } from '../lib/i18n';
import { Spinner } from './Spinner';

interface Props {
  title: string;
  subtitle?: string;
  /** When true, show a back chevron that pops the history stack. */
  back?: boolean;
  /** Override the default back behavior. */
  onBack?: () => void;
  right?: React.ReactNode;
  busy?: boolean;
}

export function Header({ title, subtitle, back, onBack, right, busy }: Props) {
  const navigate = useNavigate();
  return (
    <header className="glass sticky top-0 z-20 border-b border-line">
      <div className="mx-auto max-w-4xl flex items-center gap-1 h-14 px-2">
        {back && (
          <button
            aria-label={t('common.back')}
            onClick={() => (onBack ? onBack() : navigate(-1))}
            className="h-10 w-10 grid place-items-center rounded-full text-ink hover:bg-[rgb(var(--line)/0.6)]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="text-base font-semibold leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-ink-dim leading-tight truncate">{subtitle}</p>
          )}
        </div>
        {busy && <Spinner className="text-accent mr-1" />}
        {right}
      </div>
    </header>
  );
}
