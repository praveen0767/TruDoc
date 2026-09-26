import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getCase } from '../lib/api/cases';
import { CaseDetail } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [caseRecord, setCaseRecord] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || id === 'undefined' || id === 'null') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getCase(id)
      .then((c) => {
        setCaseRecord(c);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load case');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !caseRecord) {
    return (
      <div className="p-8">
        <ErrorMessage
          title="Case Detail Offline"
          message={error || `Case #${id} could not be retrieved from backend.`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 pb-12 max-w-5xl mx-auto font-sans">
      <div className="flex items-center justify-between font-mono text-xs text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span onClick={() => navigate('/cases')} className="hover:text-primary cursor-pointer">
            Cases
          </span>
          <span className="text-outline-variant">/</span>
          <span className="font-bold text-primary">{caseRecord.case_id}</span>
        </div>
        <button
          onClick={() => navigate('/cases')}
          className="hover:text-on-surface flex items-center gap-1 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Cases</span>
        </button>
      </div>

      {/* Case Header Card */}
      <div className="p-6 rounded bg-surface-container-lowest border border-outline-variant/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-xl font-bold text-on-surface">{caseRecord.case_id}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded ${
                  'bg-secondary/10 text-secondary'
                }`}
              >
                {'ACTIVE'}
              </span>
            </div>
            <div className="text-xs text-on-surface-variant mt-1 font-mono">
              —
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/reconciliation')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
              <span>Open Reconciliation Cockpit</span>
            </button>
          </div>
        </div>

        {/* Financial Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-outline-variant/20 font-mono text-xs">
          <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant uppercase block">
              Committed Total
            </span>
            <span className="text-base font-bold text-on-surface">
              —
            </span>
          </div>
          <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant uppercase block">
              Billed Total
            </span>
            <span className="text-base font-bold text-on-surface">
              —
            </span>
          </div>
          <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant uppercase block">
              Variance Delta
            </span>
            <span
              className={`text-base font-bold text-secondary`}
            >
              —
            </span>
          </div>
        </div>
      </div>

      {/* Linked Documents in this Case */}
      <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-3 font-mono">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Linked Documents ({caseRecord.documents.length})
        </h2>
        <div className="space-y-2">
          {caseRecord.documents.map((d) => (
            <div
              key={d.document_id}
              onClick={() => navigate(`/documents/${d.document_id}`)}
              className="p-3 rounded bg-surface-container-low hover:bg-surface-container-high transition-colors flex items-center justify-between cursor-pointer text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  description
                </span>
                <span className="text-on-surface font-semibold">{d.document_id}</span>
                <span className="text-[10px] text-on-surface-variant">({d.document_type})</span>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded ${
                  d.overall_status === 'VERIFIED'
                    ? 'bg-secondary/10 text-secondary'
                    : 'bg-error-container/30 text-error'
                }`}
              >
                {d.overall_status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
