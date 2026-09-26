import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getReviews } from '../lib/api/reviews';
import { ReviewCase } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function ReviewsPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReviews();
      setReviews(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Human review queue service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const pendingCount = reviews.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="p-6 space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold font-mono text-on-surface">Human Review Queue</h1>
            <span className="px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary font-mono text-xs border border-tertiary/40">
              {pendingCount} PENDING ACTION
            </span>
          </div>
          <p className="text-xs text-on-surface-variant font-mono">
            Low-confidence extractions, unapproved rate markups, and OCR ambiguities halted from clearing.
          </p>
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Review Queue Offline"
          message={error}
          onRetry={fetchReviews}
        />
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {reviews.map((rev) => (
            <div
              key={rev.review_id}
              className={`p-5 rounded border transition-all ${
                rev.status === 'PENDING'
                  ? 'bg-surface-container-lowest border-outline-variant/30 hover:border-primary/40 shadow-xs'
                  : 'bg-surface-container-low/50 border-outline-variant/15 opacity-70'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                    <span className="text-primary font-bold">{rev.review_id}</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-on-surface">{rev.document_id}</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-on-surface-variant">Case #{rev.case_id}</span>
                    <span className="text-outline-variant">•</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        'bg-tertiary-container/30 text-tertiary'
                      }`}
                    >
                      NORMAL PRIORITY
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        rev.status === 'PENDING'
                          ? 'bg-tertiary/10 text-tertiary'
                          : 'bg-secondary/10 text-secondary'
                      }`}
                    >
                      STATUS: {rev.status}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-on-surface font-sans">
                    {rev.field_name}
                  </h3>

                  <p className="text-xs text-on-surface-variant font-sans">{rev.reasons?.[0] || 'Manual review required'}</p>

                  <div className="flex items-center gap-4 text-xs font-mono pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant text-[11px]">Current OCR:</span>
                      <span className="text-error font-bold">{rev.current_value}</span>
                    </div>

                    {rev.extracted_value && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-on-surface-variant text-[11px]">Suggested:</span>
                        <span className="text-secondary font-bold">{rev.extracted_value}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <span className="text-on-surface-variant text-[11px]">Confidence:</span>
                      <span className="text-tertiary font-bold">
                        {((rev.reliability || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Open Review Workspace Button */}
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/reviews/${rev.review_id}`)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary text-on-primary hover:bg-primary-fixed text-xs font-mono font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    <span>{rev.status === 'PENDING' ? 'Open Review Workspace' : 'Inspect Audit'}</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {reviews.length === 0 && (
            <div className="p-12 text-center text-xs font-mono text-on-surface-variant">
              No items currently pending human review.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
