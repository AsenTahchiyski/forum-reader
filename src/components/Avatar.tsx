import { useState } from 'react';
import { cx } from '../lib/cx';

interface Props {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

/** Avatar image with a generic user-icon fallback when missing or broken. */
export function Avatar({ name, src, size = 36, className }: Props) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        style={dim}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx('rounded-full object-cover bg-surface-2 shrink-0', className)}
      />
    );
  }
  return (
    <span
      style={dim}
      role="img"
      aria-label={name || 'User'}
      className={cx(
        'rounded-full shrink-0 grid place-items-center overflow-hidden',
        'bg-[rgb(var(--accent)/0.18)] text-accent',
        className
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        style={{ width: size * 0.62, height: size * 0.62 }}
      >
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6Z" />
      </svg>
    </span>
  );
}
