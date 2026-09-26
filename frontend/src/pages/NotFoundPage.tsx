import React from 'react';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[32px]">search_off</span>
      </div>

      <div className="space-y-1">
        <h1 className="text-3xl font-bold font-mono text-on-surface">404</h1>
        <h2 className="text-base font-semibold text-on-surface">Page or Resource Not Found</h2>
        <p className="text-xs text-on-surface-variant font-mono max-w-sm">
          The requested document intelligence route does not exist in this TruDoc instance.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-primary-container text-on-primary-container font-mono text-xs font-bold rounded shadow-xs cursor-pointer hover:bg-primary-fixed-dim transition-colors"
        >
          Return to Overview
        </button>
        <button
          onClick={() => navigate('/documents')}
          className="px-4 py-2 bg-surface-container-high text-on-surface font-mono text-xs rounded border border-outline-variant/30 cursor-pointer hover:bg-surface-bright transition-colors"
        >
          View Documents
        </button>
      </div>
    </div>
  );
}
