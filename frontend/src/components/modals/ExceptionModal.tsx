import React, { useState } from 'react';
import { approveWithException } from '../../lib/api/reconciliation';

interface ExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  onSuccess: (message: string) => void;
}

export function ExceptionModal({ isOpen, onClose, caseId, onSuccess }: ExceptionModalProps) {
  const [reason, setReason] = useState('Procurement approved temporary expedited shipment surcharge');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide an override justification.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await approveWithException(caseId, reason);
      onSuccess(res.message);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve exception');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface-container-low border border-tertiary/40 rounded-lg p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
          <div className="flex items-center gap-2 text-tertiary">
            <span className="material-symbols-outlined text-[20px]">verified</span>
            <h3 className="font-semibold text-sm">Approve with Exception</h3>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface-variant leading-relaxed">
          Approving with exception will override policy <strong className="text-on-surface font-mono">POL-FIN-04</strong> for Case #{caseId} and sign the audit payload with your Lead ML Verification Officer credentials.
        </p>

        {error && (
          <div className="p-2.5 rounded bg-error-container/20 border border-error/40 text-error text-xs font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-mono uppercase text-on-surface-variant mb-1">
              Justification / Addendum Sign-Off:
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-2.5 text-xs text-on-surface focus:outline-hidden focus:border-tertiary font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-tertiary text-on-tertiary font-semibold text-xs hover:bg-tertiary-fixed transition-colors disabled:opacity-50"
            >
              {submitting ? 'Signing Exception...' : 'Confirm Exception Sign-off'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
