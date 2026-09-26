import React, { useEffect, useState } from 'react';
import { getSystemHealth, pingService } from '../lib/api/system';
import { SystemHealth, ServiceHealthStatus } from '../lib/api/types';
import { API_BASE_URL, isMockModeEnabled } from '../lib/api/client';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function SystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pingingService, setPingingService] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ service: string; latencyMs: number } | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSystemHealth();
      setHealth(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'System health telemetry service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handlePing = async (key: string) => {
    setPingingService(key);
    try {
      const res = await pingService(key);
      setPingResult({ service: key, latencyMs: res.latencyMs });
      setTimeout(() => setPingResult(null), 4000);
    } catch {
      // Degraded
    } finally {
      setPingingService(null);
    }
  };

  const getStatusBadge = (status: ServiceHealthStatus) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/30 text-[10px] font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
            <span>CONNECTED</span>
          </span>
        );
      case 'DEGRADED':
        return (
          <span className="px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary border border-tertiary/40 text-[10px] font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
            <span>DEGRADED</span>
          </span>
        );
      case 'UNAVAILABLE':
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-error-container/40 text-error border border-error/50 text-[10px] font-mono font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-error"></span>
            <span>UNAVAILABLE</span>
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-xl font-bold font-mono text-on-surface">Infrastructure Status</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Operational status of Python runtime, OCR pipeline, Redis cache, Qdrant vectors, and MCP control plane.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono rounded border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">refresh</span>
            <span>Poll Health</span>
          </button>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Infrastructure Health Offline"
          message={error}
          onRetry={fetchHealth}
        />
      )}

      {/* Ping Notification */}
      {pingResult && (
        <div className="p-3 bg-secondary/15 border border-secondary/30 rounded text-secondary text-xs font-mono">
          Ping to {pingResult.service} successful: {pingResult.latencyMs}ms roundtrip latency.
        </div>
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && health && (
        <div className="space-y-6">
          {/* Top Engine Telemetry Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-1">
              <span className="text-[10px] text-on-surface-variant block uppercase">
                Overall Infrastructure
              </span>
              <div className="flex items-center gap-2">
                {getStatusBadge(health.overall_status)}
              </div>
            </div>

            <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-1">
              <span className="text-[10px] text-on-surface-variant block uppercase">
                OCR Engine
              </span>
              <span className="text-sm font-bold text-on-surface">
                {health.ocr_engine} {health.ocr_engine_version}
              </span>
            </div>

            <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-1">
              <span className="text-[10px] text-on-surface-variant block uppercase">
                MCP Tool Count
              </span>
              <span className="text-sm font-bold text-secondary">
                {health.mcp_tool_count} available
              </span>
            </div>

            <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-1">
              <span className="text-[10px] text-on-surface-variant block uppercase">
                Configured Backend URL
              </span>
              <span className="text-[11px] text-primary truncate block font-bold">
                {API_BASE_URL} ({isMockModeEnabled() ? 'Mock Mode' : 'Live'})
              </span>
            </div>
          </div>

          {/* 8 Authoritative Services List */}
          <div className="space-y-3 font-mono text-xs">
            <span className="text-xs font-semibold uppercase text-on-surface-variant tracking-wider block">
              Core Microservices &amp; Infrastructure Daemons
            </span>

            {Object.entries(health.services).map(([key, svc]) => (
              <div
                key={key}
                className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-outline-variant/40 transition-colors shadow-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface">{svc.service_name}</span>
                    {svc.version && (
                      <span className="text-[10px] text-on-surface-variant">({svc.version})</span>
                    )}
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-sans">{svc.details}</p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant block">Latency</span>
                    <span className="text-primary font-bold">{svc.latency_ms}ms</span>
                  </div>

                  {getStatusBadge(svc.status)}

                  <button
                    onClick={() => handlePing(key)}
                    disabled={pingingService === key}
                    className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[10px] font-mono transition-colors border border-outline-variant/30 cursor-pointer disabled:opacity-50"
                  >
                    {pingingService === key ? 'Pinging...' : 'Ping'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
