import { useState } from 'react';
import { cx } from '../lib/cx';

interface Props {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

/** Avatar image with a tinted initial fallback when missing or broken. */
export function Avatar({ name, src, size = 36, className }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
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
      className={cx(
        'rounded-full shrink-0 grid place-items-center font-semibold',
        'bg-[rgb(var(--accent)/0.18)] text-accent',
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
