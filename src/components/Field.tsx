import { forwardRef } from 'react';
import { cx } from '../lib/cx';

const inputClass =
  'w-full h-11 px-3 rounded-xl bg-surface-2 border border-line text-ink ' +
  'placeholder:text-ink-dim/70 focus:outline-none focus:border-accent ' +
  'focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, className, id, ...rest }, ref) => (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="block mb-1.5 text-sm font-medium text-ink-dim">{label}</span>
      )}
      <input ref={ref} id={id} className={cx(inputClass, className)} {...rest} />
      {hint && <span className="block mt-1 text-xs text-ink-dim">{hint}</span>}
    </label>
  )
);
Field.displayName = 'Field';

interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, className, id, ...rest }, ref) => (
    <label className="block" htmlFor={id}>
      {label && (
        <span className="block mb-1.5 text-sm font-medium text-ink-dim">{label}</span>
      )}
      <textarea
        ref={ref}
        id={id}
        className={cx(
          'w-full min-h-28 p-3 rounded-xl bg-surface-2 border border-line text-ink',
          'placeholder:text-ink-dim/70 focus:outline-none focus:border-accent',
          'focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors resize-y',
          className
        )}
        {...rest}
      />
    </label>
  )
);
TextArea.displayName = 'TextArea';
