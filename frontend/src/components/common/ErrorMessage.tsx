import React from 'react';

export interface ErrorMessageProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({
  title = 'Service Unavailable',
  message,
  onRetry,
  className = '',
}: ErrorMessageProps) {
  return (
    <div
      className={`p-6 rounded border border-error/30 bg-error-container/10 flex flex-col items-center justify-center text-center space-y-4 max-w-xl mx-auto my-8 ${className}`}
    >
      <div className="w-12 h-12 rounded-full bg-error-container/30 border border-error/40 flex items-center justify-center text-error">
        <span className="material-symbols-outlined text-[24px]">error_outline</span>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold text-on-surface text-base">{title}</h3>
        <p className="text-on-surface-variant text-sm font-mono max-w-md">{message}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/40 rounded text-xs font-mono font-medium transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}
