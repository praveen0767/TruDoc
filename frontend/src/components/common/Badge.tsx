import React from 'react';

export interface BadgeProps {
  variant?: 'verified' | 'success' | 'warning' | 'error' | 'primary' | 'neutral';
  children: React.ReactNode;
  className?: string;
  pulse?: boolean;
}

export function Badge({ variant = 'neutral', children, className = '', pulse }: BadgeProps) {
  const variantStyles = {
    verified: 'bg-secondary/10 text-secondary border border-secondary/25',
    success: 'bg-secondary/10 text-secondary border border-secondary/25',
    warning: 'bg-tertiary-container/30 text-tertiary border border-tertiary/40',
    error: 'bg-error-container/30 text-error border border-error/40',
    primary: 'bg-primary/10 text-primary border border-primary/25',
    neutral: 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30',
  };

  const dotStyles = {
    verified: 'bg-secondary',
    success: 'bg-secondary',
    warning: 'bg-tertiary',
    error: 'bg-error',
    primary: 'bg-primary',
    neutral: 'bg-outline',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono leading-tight ${variantStyles[variant]} ${className}`}
    >
      {pulse && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]} animate-pulse`} />}
      {children}
    </span>
  );
}
