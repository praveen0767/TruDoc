import React, { useState } from 'react';
import { requestCreditNote } from '../../lib/api/reconciliation';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  amount: number;
  onSuccess: (message: string) => void;
}

export function CreditNoteModal({
  isOpen,
  onClose,
  caseId,
  amount,
  onSuccess,
}: CreditNoteModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [noteAmount, setNoteAmount] = useState(amount);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await requestCreditNote(caseId, noteAmount);
      onSuccess(res.message);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to request credit note');
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
        className="w-full max-w-md bg-surface-container-low border border-primary/40 rounded-lg p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-[20px]">outgoing_mail</span>
            <h3 className="font-semibold text-sm">Request Vendor Credit Note</h3>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <p className="text-xs text-on-surface-variant leading-relaxed">
          Transmit automated debit note / credit note requisition to vendor <strong className="text-on-surface">ABC Technologies Pvt Ltd</strong> for unauthorized line item markup and GST delta.
        </p>

        {error && (
          <div className="p-2.5 rounded bg-error-container/20 border border-error/40 text-error text-xs font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
          <div>
            <label className="block text-[11px] uppercase text-on-surface-variant mb-1">
              Credit Amount Demanded (INR):
            </label>
            <input
              type="number"
              value={noteAmount}
              onChange={(e) => setNoteAmount(Number(e.target.value))}
              required
              className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded p-2 text-on-surface focus:outline-hidden focus:border-primary font-bold text-sm"
            />
          </div>

          <div className="p-3 bg-surface-container-lowest rounded border border-outline-variant/20 text-[11px] text-on-surface-variant space-y-1">
            <div className="flex justify-between">
              <span>Unapproved Base Markup:</span>
              <span className="text-error font-semibold">+₹1,000.00</span>
            </div>
            <div className="flex justify-between">
              <span>IGST (18%) Delta:</span>
              <span className="text-error font-semibold">+₹180.00</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-on-surface">
              <span>Total Requisition:</span>
              <span className="text-primary">₹{noteAmount.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface text-xs font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-primary text-on-primary font-semibold text-xs hover:bg-primary-fixed transition-colors disabled:opacity-50 font-sans"
            >
              {submitting ? 'Transmitting...' : 'Dispatch Requisition'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
