import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isMockModeEnabled, setMockMode, API_BASE_URL, ApiError } from '../../lib/api/client';
import { getSystemHealth } from '../../lib/api/system';

type LinkState = 'checking' | 'live' | 'http-error' | 'unreachable';

interface TopbarProps {
  onOpenSearch: () => void;
  onOpenMobileMenu: () => void;
}

export function Topbar({ onOpenSearch, onOpenMobileMenu }: TopbarProps) {
  const navigate = useNavigate();
  const [isDemoMode, setIsDemoMode] = useState<boolean>(isMockModeEnabled());
  const [showConfigPopover, setShowConfigPopover] = useState(false);
  const [link, setLink] = useState<LinkState>('checking');
  const [linkDetail, setLinkDetail] = useState('');

  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      setIsDemoMode(customEvent.detail);
    };
    window.addEventListener('trudoc_mock_mode_changed', handleModeChange);
    return () => {
      window.removeEventListener('trudoc_mock_mode_changed', handleModeChange);
    };
  }, []);

  // Probe the real backend. Never claim "CONNECTED" without a response.
  useEffect(() => {
    let active = true;
    async function probe() {
      try {
        const h = await getSystemHealth();
        if (!active) return;
        setLink('live');
        setLinkDetail(`overall ${h.overall_status} · OCR ${h.ocr_engine} · ${h.mcp_tool_count} tools`);
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.isNetworkError) {
          setLink('unreachable');
          setLinkDetail(e.message);
        } else {
          setLink('http-error');
          setLinkDetail(e instanceof Error ? e.message : 'Unknown error');
        }
      }
    }
    probe();
    const t = setInterval(probe, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const toggleMockMode = () => {
    const next = !isDemoMode;
    setIsDemoMode(next);
    setMockMode(next);
  };

  const linkBadge = () => {
    if (isDemoMode) {
      return {
        cls: 'bg-tertiary-container/20 border-tertiary/40 text-tertiary hover:bg-tertiary-container/30',
        dot: 'bg-tertiary',
        text: 'DEMO DATA',
      };
    }
    switch (link) {
      case 'live':
        return {
          cls: 'bg-secondary/10 border-secondary/30 text-secondary hover:bg-secondary/20',
          dot: 'bg-secondary animate-pulse',
          text: 'LIVE BACKEND',
        };
      case 'http-error':
        return {
          cls: 'bg-tertiary-container/20 border-tertiary/40 text-tertiary',
          dot: 'bg-tertiary',
          text: 'API ERROR',
        };
      case 'unreachable':
        return {
          cls: 'bg-error-container/20 border-error/40 text-error',
          dot: 'bg-error',
          text: 'API UNREACHABLE',
        };
      default:
        return {
          cls: 'bg-surface-container-high border-outline-variant/40 text-on-surface-variant',
          dot: 'bg-outline',
          text: 'CHECKING…',
        };
    }
  };
  const badge = linkBadge();

  return (
    <header className="h-14 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/25 px-4 flex items-center justify-between gap-4 z-40 shrink-0">
      {/* Mobile Hamburger & Search */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>

        <div
          onClick={onOpenSearch}
          className="relative w-full cursor-pointer group"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onOpenSearch();
          }}
        >
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline-variant text-[18px] group-hover:text-primary transition-colors">
            search
          </span>
          <div className="w-full bg-surface-container-low border border-outline-variant/30 rounded pl-8 pr-16 py-1.5 font-mono text-[11px] text-on-surface-variant group-hover:border-primary/50 transition-colors flex items-center justify-between">
            <span>Search documents, fields, cases...</span>
            <kbd className="font-mono text-[10px] text-on-surface-variant bg-surface-container-high border border-outline-variant/40 px-1.5 py-0.5 rounded shadow-xs">
              Cmd + K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Backend / Mock Mode Indicator */}
        <div className="relative">
          <button
            onClick={() => setShowConfigPopover(!showConfigPopover)}
            title={
              isDemoMode
                ? 'DEMO DATA is active — values are frontend fixtures, not backend truth'
                : linkDetail || 'Backend link state'
            }
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] border transition-colors ${badge.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            <span className="font-bold tracking-wider">{badge.text}</span>
            <span className="material-symbols-outlined text-[14px]">tune</span>
          </button>

          {/* Config Popover */}
          {showConfigPopover && (
            <div className="absolute right-0 top-10 w-72 p-3 bg-surface-container-high border border-outline-variant/40 rounded shadow-xl z-50 text-[12px] space-y-3 font-sans">
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                <span className="font-semibold text-on-surface">Data Source Mode</span>
                <button
                  onClick={() => setShowConfigPopover(false)}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Active Mode:</span>
                  <span className={isDemoMode ? 'text-tertiary font-bold' : 'text-secondary font-bold'}>
                    {isDemoMode ? 'ISOLATED DEMO' : 'LIVE FASTAPI'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-on-surface-variant">Link State:</span>
                  <span
                    className={
                      link === 'live'
                        ? 'text-secondary font-bold'
                        : link === 'unreachable'
                        ? 'text-error font-bold'
                        : 'text-tertiary font-bold'
                    }
                  >
                    {isDemoMode ? 'NOT USED (DEMO)' : link.toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] text-on-surface-variant break-all">
                  API URL: {API_BASE_URL}
                </div>
                {linkDetail && !isDemoMode && (
                  <div className="text-[10px] text-on-surface-variant break-all">
                    Detail: {linkDetail}
                  </div>
                )}
              </div>

              <div className="pt-1">
                <button
                  onClick={() => {
                    toggleMockMode();
                    setShowConfigPopover(false);
                  }}
                  className={`w-full py-1.5 px-3 rounded text-[11px] font-mono font-semibold transition-colors ${
                    isDemoMode
                      ? 'bg-secondary text-on-secondary hover:bg-secondary/90'
                      : 'bg-tertiary text-on-tertiary hover:bg-tertiary/90'
                  }`}
                >
                  Switch to {isDemoMode ? 'Live Python Backend' : 'Isolated Demo Fixtures'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Process Documents Button */}
        <button
          onClick={() => navigate('/documents/new')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-sans text-[12px] font-semibold rounded transition-colors shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Process Documents</span>
        </button>

        {/* Notifications */}
        <button
          onClick={() => navigate('/reviews')}
          className="relative p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
          title="Review Queue Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-tertiary"></span>
        </button>

        <div className="h-6 w-px bg-outline-variant/30"></div>

        {/* User Identity */}
        <div className="flex items-center gap-2.5 pl-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="font-mono text-[11px] text-on-surface font-medium leading-none">
              Agent Ops
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant leading-none mt-1">
              Lead ML Verification Officer
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
