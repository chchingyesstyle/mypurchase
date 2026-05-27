import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', icon, children, className = '', type = 'button', ...props }: ButtonProps) {
  const classes = ['button', `button-${variant}`, className].filter(Boolean).join(' ');
  return (
    <button className={classes} type={type} {...props}>
      {icon}
      <span>{children}</span>
    </button>
  );
}
