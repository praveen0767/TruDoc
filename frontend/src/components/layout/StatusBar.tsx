import React, { useEffect, useState } from 'react';
import { getSystemHealth } from '../../lib/api/system';
import { ApiError } from '../../lib/api/client';
import { ServiceHealthStatus, SystemHealth } from '../../lib/api/types';

export function StatusBar() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  // 'network' => genuinely unreachable. 'http' => API answered with an error status.
  const [fault, setFault] = useState<'network' | 'http' | null>(null);
  const [status, setStatus] = useState<'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE' | null>(null);

  useEffect(() => {
    let active = true;
    async function fetchHealth() {
      try {
        const h = await getSystemHealth();
        if (active) {
          setHealth(h);
          setFault(null);
          setStatus(h.overall_status);
        }
      } catch (e) {
        if (!active) return;
        // A 404/422/500 means the API IS reachable. Only a transport failure is "network".
        setFault(e instanceof ApiError && e.isNetworkError ? 'network' : 'http');
      }
    }

    fetchHealth();
    const timer = setInterval(fetchHealth, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const svc = (key: string): ServiceHealthStatus | null => {
    if (fault) return fault === 'network' ? 'UNAVAILABLE' : null;
    return health?.services?.[key]?.status ?? null;
  };

  const dot = (s: ServiceHealthStatus | null) =>
    s === 'CONNECTED' ? 'bg-secondary' : s === 'DEGRADED' ? 'bg-tertiary' : 'bg-error';

  const label = (s: ServiceHealthStatus | null, healthy: string) =>
    s === null ? 'UNKNOWN' : s === 'CONNECTED' ? healthy : s;

  const ocr = svc('ocr_engine');
  const redis = svc('redis_cache');
  const qdrant = svc('qdrant_vector_db');
  const apiSvc = health?.services?.['python_api'];

  const apiText =
    fault === 'network'
      ? 'UNREACHABLE'
      : fault === 'http'
      ? `HTTP ERROR (${status ?? 'DEGRADED'})`
      : apiSvc
      ? `200 OK (${apiSvc.latency_ms}ms)`
      : 'UNKNOWN';

  return (
    <footer className="h-8 bg-surface-container-lowest border-t border-outline-variant/30 px-4 flex items-center justify-between font-mono text-[10px] text-on-surface-variant select-none shrink-0 z-30">
      <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
        {/* OCR */}
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dot(ocr)}`} />
          <span>OCR: {label(ocr, health?.ocr_engine || 'Operational')}</span>
        </span>

        <span className="text-outline-variant">•</span>

        {/* API — UNREACHABLE only on transport failure */}
        <span className={fault ? 'text-error' : ''}>API: {apiText}</span>

        <span className="text-outline-variant">•</span>

        {/* Redis */}
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${dot(redis)}`} />
          <span>Redis: {label(redis, 'Healthy')}</span>
        </span>

        <span className="text-outline-variant">•</span>

        {/* Qdrant */}
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${dot(qdrant)}`} />
          <span>Qdrant: {label(qdrant, 'Healthy')}</span>
        </span>

        <span className="text-outline-variant">•</span>

        {/* Decision Provider — real registry value */}
        <span>Decision Provider: {health?.services?.['decision_provider']?.details ?? 'UNKNOWN'}</span>

        <span className="text-outline-variant">•</span>

        {/* MCP Registry — real tool count */}
        <span>MCP Registry: {health ? `${health.mcp_tool_count} Tools` : 'UNKNOWN'}</span>
      </div>

      <div className="flex items-center gap-2 text-outline shrink-0 pl-2">
        <span>TruDoc Engine v4.12.0-core</span>
      </div>
    </footer>
  );
}
