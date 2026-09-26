import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-surface-container-high/60 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

export function DocumentDetailSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <Skeleton className="h-96 w-full" />
    </div>
  );
}
