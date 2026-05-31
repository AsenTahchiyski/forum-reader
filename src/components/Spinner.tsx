import { cx } from '../lib/cx';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-5 w-5 rounded-full border-2 border-current border-t-transparent animate-spin',
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-dim">
      <Spinner className="text-accent h-7 w-7" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
