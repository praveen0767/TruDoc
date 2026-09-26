import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getReview, submitReviewAction } from '../lib/api/reviews';
import { ReviewCase } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function ReviewWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [review, setReview] = useState<ReviewCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Correction Form State
  const [correctedValue, setCorrectedValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchReview = async () => {
    if (!id || id === 'undefined' || id === 'null') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getReview(id);
      setReview(data);
      setCorrectedValue(data.extracted_value || data.current_value);
      setCorrectionReason(`Adjusted unit rate to match authorized Purchase Order rate`);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Review item could not be retrieved from backend.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReview();
  }, [id]);

  const handleAction = async (action: 'ACCEPT' | 'CORRECT' | 'REJECT') => {
    if (!review) return;
    setSubmitting(true);
    setError(null);
    setActionSuccessMessage(null);

    try {
      const res = await submitReviewAction(review.review_id, action, {
        fieldKey: review.field_name,
        correctedValue: action === 'CORRECT' ? correctedValue : review.current_value,
        reason: action === 'CORRECT' ? correctionReason : `Review action ${action} confirmed by operator`,
        reviewerId: 'Lead ML Verification Officer',
      });

      setActionSuccessMessage(res.message);
      // Reload review state to reflect backend determination
      await fetchReview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !review) {
    return (
      <div className="p-8">
        <ErrorMessage
          title="Review Item Unavailable"
          message={error}
          onRetry={fetchReview}
        />
      </div>
    );
  }

  if (!review) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-mono text-on-surface-variant">
          <span
            onClick={() => navigate('/reviews')}
            className="hover:text-primary cursor-pointer transition-colors"
          >
            Review Queue
          </span>
          <span className="text-outline-variant">/</span>
          <span className="font-semibold text-primary">{review.review_id}</span>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface">Case #{review.case_id}</span>
        </div>

        <button
          onClick={() => navigate('/reviews')}
          className="text-xs font-mono text-on-surface-variant hover:text-on-surface flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Back to Queue</span>
        </button>
      </div>

      {/* Action Success Alert */}
      {actionSuccessMessage && (
        <div className="p-3.5 rounded bg-secondary/15 border border-secondary/30 text-secondary text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">verified</span>
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => navigate('/reconciliation')}
            className="underline hover:text-on-surface cursor-pointer"
          >
            Return to Reconciliation Diff →
          </button>
        </div>
      )}

      {/* Main Review Card */}
      <div className="rounded bg-surface-container-lowest border border-outline-variant/30 p-6 space-y-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-primary font-bold">{review.review_id}</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  'bg-tertiary-container/30 text-tertiary'
                }`}
              >
                NORMAL
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
                STATUS: {review.status}
              </span>
            </div>
            <h1 className="text-lg font-bold text-on-surface font-sans mt-1">
              {review.field_name}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div>
              <span className="text-on-surface-variant block text-[10px] uppercase">Document</span>
              <span
                onClick={() => navigate(`/documents/${review.document_id}`)}
                className="text-primary hover:underline cursor-pointer font-bold"
              >
                {review.document_id}
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant block text-[10px] uppercase">Confidence</span>
              <span className="text-tertiary font-bold">
                {(review.reliability * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Reason / Context */}
        <div className="p-3.5 rounded bg-surface-container-low border border-outline-variant/20 space-y-1">
          <span className="text-[10px] font-mono uppercase text-on-surface-variant block font-semibold">
            Trigger Reason / Policy Vector:
          </span>
          <p className="text-xs text-on-surface font-sans leading-relaxed">{review.reasons?.[0] || 'Manual review required.'}</p>
        </div>

        {/* Evidence Snippet Inspector */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-semibold block">
            Extracted OCR Telemetry &amp; Document Anchor
          </span>
          <div className="p-4 rounded bg-surface-container-low border border-outline-variant/20 font-mono text-xs space-y-3">
            <div className="flex items-center justify-between text-on-surface-variant text-[11px]">
              <span>Snippet Text:</span>
              {review.evidence_bbox && (
                <span className="text-primary">
                  Anchor: [x:{review.evidence_bbox[0]}, y:{review.evidence_bbox[1]}, x2:
                  {review.evidence_bbox[2]}, y2:{review.evidence_bbox[3]}]
                </span>
              )}
            </div>

            <div className="p-3 bg-surface-container-lowest rounded border border-outline-variant/30 text-on-surface">
              {review.evidence_text || 'No OCR snippet available.'}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-2.5 bg-surface-container-lowest rounded border border-error/30">
                <span className="text-[10px] text-on-surface-variant block uppercase">
                  Current Extracted Value:
                </span>
                <span className="text-error font-bold text-sm">{review.current_value}</span>
              </div>

              {review.extracted_value && (
                <div className="p-2.5 bg-surface-container-lowest rounded border border-secondary/30">
                  <span className="text-[10px] text-on-surface-variant block uppercase">
                    Suggested PO Rate:
                  </span>
                  <span className="text-secondary font-bold text-sm">
                    {review.extracted_value}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions Form */}
        <div className="space-y-4 pt-4 border-t border-outline-variant/20">
          <h3 className="text-sm font-semibold font-mono text-on-surface">
            Operator Verification &amp; Correction Form
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 font-mono text-xs">
              <label className="text-on-surface-variant block uppercase text-[10px]">
                Correct Value (for downstream reconciliation):
              </label>
              <input
                type="text"
                value={correctedValue}
                onChange={(e) => setCorrectedValue(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded p-2.5 text-on-surface focus:outline-hidden focus:border-primary text-xs font-bold"
              />
            </div>

            <div className="space-y-1 font-mono text-xs">
              <label className="text-on-surface-variant block uppercase text-[10px]">
                Audit Reason / Justification:
              </label>
              <input
                type="text"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Reason for correction..."
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded p-2.5 text-on-surface focus:outline-hidden focus:border-primary text-xs"
              />
            </div>
          </div>

          {/* Action Button Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleAction('REJECT')}
                disabled={submitting}
                className="px-3.5 py-2 rounded bg-error-container/20 hover:bg-error-container/40 text-error text-xs font-mono font-semibold transition-colors cursor-pointer border border-error/30 disabled:opacity-50"
              >
                Reject Extraction
              </button>

              <button
                type="button"
                onClick={() => handleAction('ACCEPT')}
                disabled={submitting}
                className="px-3.5 py-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono font-medium transition-colors cursor-pointer border border-outline-variant/30 disabled:opacity-50"
              >
                Accept As-Is
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleAction('CORRECT')}
              disabled={submitting || !correctedValue.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-bold transition-colors shadow-md cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>{submitting ? 'Submitting to Backend...' : 'Submit Correction to Backend'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
