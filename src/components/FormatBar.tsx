import { cx } from '../lib/cx';
import { t } from '../lib/i18n';

interface Props {
  /** The textarea the buttons act on; selection is read from it directly. */
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (v: string) => void;
}

/**
 * BBCode formatting bar for the post composers: wraps the textarea's current
 * selection in a tag pair (or drops the caret between the tags when nothing
 * is selected). The textarea's value lives in React state, so changes go
 * through `onChange` and the selection is restored on the next frame.
 */
export function FormatBar({ textareaRef, value, onChange }: Props) {
  const wrap = (open: string, close: string, caretInAttr = false) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const next =
      value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      if (caretInAttr) {
        // e.g. [url=|]text[/url] — caret right before the closing bracket.
        el.setSelectionRange(start + open.length - 1, start + open.length - 1);
      } else {
        el.setSelectionRange(start + open.length, end + open.length);
      }
    });
  };

  const url = () => {
    const el = textareaRef.current;
    const sel = el ? value.slice(el.selectionStart, el.selectionEnd).trim() : '';
    // A selected link becomes the target itself; any other selection becomes
    // the link text, with the caret parked in the empty url= attribute.
    if (/^https?:\/\/\S+$/i.test(sel)) wrap('[url]', '[/url]');
    else wrap('[url=]', '[/url]', true);
  };

  const buttons: { label: string; title: string; className?: string; onClick: () => void }[] = [
    { label: 'B', title: t('format.bold'), className: 'font-bold', onClick: () => wrap('[b]', '[/b]') },
    { label: 'I', title: t('format.italic'), className: 'italic', onClick: () => wrap('[i]', '[/i]') },
    { label: 'U', title: t('format.underline'), className: 'underline', onClick: () => wrap('[u]', '[/u]') },
    { label: '❝', title: t('format.quote'), onClick: () => wrap('[quote]', '[/quote]') },
    { label: 'URL', title: t('format.link'), onClick: url },
    { label: t('format.spoiler'), title: t('format.spoiler'), onClick: () => wrap('[spoiler]', '[/spoiler]') }
  ];

  return (
    <div className="flex flex-wrap gap-1" role="toolbar" aria-label={t('format.aria')}>
      {buttons.map((b) => (
        <button
          key={b.title}
          type="button"
          title={b.title}
          // Keep the textarea's selection: a mousedown would move focus (and
          // collapse the selection on some browsers) before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.onClick}
          className={cx(
            'h-8 min-w-8 px-2 rounded-lg border border-line bg-surface-2 text-xs',
            'text-ink-dim hover:text-accent hover:border-accent/50 transition-colors',
            b.className
          )}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
