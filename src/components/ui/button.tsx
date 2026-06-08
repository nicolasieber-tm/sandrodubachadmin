import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant,
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const variantClass = variant === 'primary'
    ? 'btn-primary'
    : variant === 'ghost'
      ? 'btn-ghost'
      : variant === 'danger'
        ? 'btn-danger'
        : '';

  const sizeClass = size === 'sm' ? 'btn-sm' : '';

  const classes = ['btn', variantClass, sizeClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}
