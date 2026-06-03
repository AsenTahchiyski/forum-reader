import { useState } from 'react';
import { cx } from '../lib/cx';
import { Button } from './Button';
import { Field } from './Field';
import { Modal } from './Modal';

interface Props {
  /** 0-based current page. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  /** Pin to the bottom of the viewport (above the tab bar) instead of inline. */
  dock?: boolean;
}

/** First / Prev / "X of Y" (tap to jump) / Next / Last page navigation. */
export function Pager({ page, pageCount, onChange, disabled, dock }: Props) {
  const [jumpOpen, setJumpOpen] = useState(false);
  const [value, setValue] = useState('');

  if (pageCount <= 1) return null;

  const go = (p: number) => onChange(Math.max(0, Math.min(pageCount - 1, p)));
  const atStart = page <= 0;
  const atEnd = page >= pageCount - 1;

  const submitJump = () => {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n)) go(n - 1);
    setJumpOpen(false);
    setValue('');
  };

  const controls = (
    <div className="flex items-center justify-center gap-1.5">
      <PagerBtn label="First page" onClick={() => go(0)} disabled={disabled || atStart}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 18l-6-6 6-6M19 18l-6-6 6-6" /></svg>
      </PagerBtn>
      <PagerBtn label="Previous page" onClick={() => go(page - 1)} disabled={disabled || atStart}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </PagerBtn>

      <button
        onClick={() => {
          setValue(String(page + 1));
          setJumpOpen(true);
        }}
        disabled={disabled}
        className="px-3 h-9 rounded-lg border border-line bg-surface-2 text-sm font-medium tabular-nums hover:border-accent/50"
      >
        {page + 1} <span className="text-ink-dim">/ {pageCount}</span>
      </button>

      <PagerBtn label="Next page" onClick={() => go(page + 1)} disabled={disabled || atEnd}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </PagerBtn>
      <PagerBtn label="Last page" onClick={() => go(pageCount - 1)} disabled={disabled || atEnd}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 18l6-6-6-6M5 18l6-6-6-6" /></svg>
      </PagerBtn>
    </div>
  );

  const jumpModal = (
    <Modal open={jumpOpen} onClose={() => setJumpOpen(false)} title="Jump to page">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitJump();
          }}
          className="space-y-3"
        >
          <Field
            type="number"
            min={1}
            max={pageCount}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            hint={`1 – ${pageCount}`}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" type="button" onClick={() => setJumpOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Go
            </Button>
          </div>
        </form>
    </Modal>
  );

  if (dock) {
    return (
      <>
        <div className="pager-dock fixed inset-x-0 z-20 px-3 pointer-events-none">
          <div className="mx-auto max-w-2xl pointer-events-auto">
            <div className="glass border border-line rounded-2xl px-2 py-1.5 shadow-[0_-2px_30px_-10px_rgb(0_0_0/0.2)]">
              {controls}
            </div>
          </div>
        </div>
        {jumpModal}
      </>
    );
  }

  return (
    <div className="py-1">
      {controls}
      {jumpModal}
    </div>
  );
}

function PagerBtn({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'h-9 w-9 grid place-items-center rounded-lg border border-line bg-surface-2',
        'hover:border-accent/50 disabled:opacity-40 disabled:pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}
