import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: React.ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:opacity-95 shadow-[0_8px_24px_-8px_rgb(var(--accent)/0.6)]',
  ghost: 'bg-surface-2 text-ink hover:bg-[rgb(var(--line)/0.6)] border border-line',
  outline:
    'bg-transparent text-ink border border-line hover:border-accent hover:text-accent',
  danger:
    'bg-[rgb(255_107_107/0.12)] text-[rgb(255,107,107)] border border-[rgb(255_107_107/0.3)] hover:bg-[rgb(255_107_107/0.18)]'
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-base rounded-xl',
  lg: 'h-14 px-6 text-lg rounded-2xl'
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', full, className, children, ...rest }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-medium tracking-tight transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        full && 'w-full',
        className
      )}
      {...rest}
    >
      {children}
    </motion.button>
  )
);

Button.displayName = 'Button';
