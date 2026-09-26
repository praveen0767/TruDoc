import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getReviews } from '../../lib/api/reviews';
import { getCases } from '../../lib/api/cases';
import { getSystemHealth } from '../../lib/api/system';
import { ServiceHealthStatus, SystemHealth } from '../../lib/api/types';

interface SidebarProps {
  onCloseMobile?: () => void;
}

export function Sidebar({ onCloseMobile }: SidebarProps) {
  const location = useLocation();
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [mismatchCount, setMismatchCount] = useState<number | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCounts() {
      const [reviews, cases, health] = await Promise.allSettled([
        getReviews(),
        getCases(),
        getSystemHealth(),
      ]);
      if (!isMounted) return;
      // Counts come from the backend only. null => unavailable, shown as no badge.
      if (reviews.status === 'fulfilled') {
        setReviewCount(reviews.value.filter((r) => r.status === 'PENDING').length);
      } else {
        setReviewCount(null);
      }
      if (cases.status === 'fulfilled') {
        setMismatchCount(cases.value.filter((c) => c.status === 'MISMATCH').length);
      } else {
        setMismatchCount(null);
      }
      if (health.status === 'fulfilled') {
        setSystemHealth(health.value);
      } else {
        setSystemHealth(null);
      }
    }

    loadCounts();
    const interval = setInterval(loadCounts, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [location.pathname]);

  const navItems = [
    { label: 'Overview', path: '/', icon: 'dashboard', shortcut: 'CTRL' },
    { label: 'Documents', path: '/documents', icon: 'description' },
    { label: 'Cases', path: '/cases', icon: 'folder_supervised' },
    {
      label: 'Review Queue',
      path: '/reviews',
      icon: 'assignment_turned_in',
      badge: reviewCount && reviewCount > 0 ? reviewCount : null,
      badgeVariant: 'warning',
    },
    {
      label: 'Reconciliation',
      path: '/reconciliation',
      icon: 'compare_arrows',
      badge: mismatchCount && mismatchCount > 0 ? mismatchCount : null,
      badgeVariant: 'error',
    },
    { label: 'Evidence', path: '/evidence', icon: 'find_in_page' },
    { label: 'Agent Runs', path: '/runs', icon: 'memory' },
    { label: 'Policies', path: '/policies', icon: 'shield' },
    { label: 'System', path: '/system', icon: 'dns' },
  ];

  return (
    <aside className="h-full w-64 bg-surface-container-lowest border-r border-outline-variant/30 flex flex-col justify-between select-none">
      <div className="flex flex-col h-full min-h-0">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low shrink-0">
          <NavLink to="/" className="flex items-center gap-3 min-w-0" onClick={onCloseMobile}>
            <div className="w-7 h-7 rounded bg-primary-container/20 border border-primary-container/40 flex items-center justify-center text-primary shrink-0">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[15px] font-bold tracking-tight leading-none text-on-surface">TruDoc</span>
              <span className="text-[10px] text-on-surface-variant truncate uppercase tracking-wider font-mono mt-0.5">
                Trusted Doc Intelligence
              </span>
            </div>
          </NavLink>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1 text-on-surface-variant hover:text-on-surface"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Environment Tag */}
        <div className="px-3 py-2 border-b border-outline-variant/15 shrink-0">
          <div className="bg-surface-container-low/70 border border-outline-variant/30 rounded px-2.5 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0"></span>
              <span className="text-[10px] font-mono text-on-surface truncate">
                Production / Defense &amp; FinTech Ops
              </span>
            </div>
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-1 py-0.5 rounded shrink-0">
              v2.4
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onCloseMobile}
                className={`flex items-center justify-between px-2.5 py-2 rounded text-[12px] transition-colors ${
                  isActive
                    ? 'bg-surface-container-high text-primary border-l-2 border-primary font-medium'
                    : 'text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                      item.badgeVariant === 'error'
                        ? 'bg-error-container/30 text-error border-error/40'
                        : 'bg-tertiary-container/30 text-tertiary border-tertiary/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {item.shortcut && (
                  <span className="text-[10px] font-mono text-outline">{item.shortcut}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Telemetry Bottom Card — real backend values only */}
        <div className="p-3 border-t border-outline-variant/20 bg-surface-container-lowest shrink-0">
          <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/20 space-y-1.5 font-mono text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Python Agent Runtime</span>
              <span className="text-primary font-mono">
                {systemHealth ? systemHealth.services['python_api']?.version ?? 'unknown' : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Engine Latency</span>
              <span className="text-secondary font-mono">
                {systemHealth ? `${systemHealth.services['python_api']?.latency_ms ?? 0}ms` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-on-surface-variant">Documents Indexed</span>
              <span className="text-secondary font-mono">
                {systemHealth ? systemHealth.document_count : '—'}
              </span>
            </div>
            <div className="pt-1 border-t border-outline-variant/15 flex items-center justify-between text-on-surface-variant">
              {(['ocr_engine', 'redis_cache', 'qdrant_vector_db'] as const).map((k) => {
                const st: ServiceHealthStatus | undefined = systemHealth?.services?.[k]?.status;
                const color =
                  st === 'CONNECTED'
                    ? 'bg-secondary'
                    : st === 'DEGRADED'
                      ? 'bg-tertiary'
                      : 'bg-error';
                const name = k === 'ocr_engine' ? 'OCR' : k === 'redis_cache' ? 'Redis' : 'Qdrant';
                return (
                  <span key={k} className="flex items-center gap-1" title={st ?? 'UNKNOWN'}>
                    <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                    {name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
