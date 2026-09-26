import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getRuns } from '../lib/api/runs';
import { RunSummary } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function RunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRuns();
      setRuns(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Agent runs service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-xl font-bold font-mono text-on-surface">Agent Execution Runs</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Audit logs of Python backend agent executions, MCP tool dispatches, and reasoning passes.
          </p>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Agent Run Repository Offline"
          message={error}
          onRetry={fetchRuns}
        />
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4 font-mono text-xs">
          {runs.map((r) => (
            <div
              key={r.run_id}
              onClick={() => navigate(`/runs/${r.run_id}`)}
              className="p-5 rounded bg-surface-container-lowest border border-outline-variant/20 hover:border-primary/40 cursor-pointer transition-all shadow-xs space-y-3"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">
                    memory
                  </span>
                  <span className="font-bold text-sm text-on-surface">{r.run_id}</span>
                  <span className="text-[10px] text-on-surface-variant">
                    Case #{r.case_id}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      r.overall_status === 'VERIFIED'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-error-container/30 text-error font-bold'
                    }`}
                  >
                    STATUS: {r.overall_status}
                  </span>
                  <span className="text-on-surface-variant text-[11px]">
                    Type: {r.document_type}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] pt-2 border-t border-outline-variant/15 text-on-surface-variant">
                <div>
                  <span className="block uppercase text-[10px]">Pipeline Stages</span>
                  <span className="text-on-surface font-semibold">{r.stage_count} executed</span>
                </div>
                <div>
                  <span className="block uppercase text-[10px]">Document ID</span>
                  <span className="text-on-surface font-semibold">{r.document_id}</span>
                </div>
                <div>
                  <span className="block uppercase text-[10px]">Started Timestamp</span>
                  <span className="text-on-surface">
                    {r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-primary hover:underline font-bold">
                    Inspect Execution Detail →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
