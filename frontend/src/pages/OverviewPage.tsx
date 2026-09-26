import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../lib/api/documents';
import { getCases } from '../lib/api/cases';
import { getReviews } from '../lib/api/reviews';
import { getReconciliation } from '../lib/api/reconciliation';
import { Document, CaseSummary, ReviewCase, ReconciliationResult } from '../lib/api/types';
import { Skeleton } from '../components/common/Skeleton';

export function OverviewPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [reviews, setReviews] = useState<ReviewCase[]>([]);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([getDocuments(), getCases(), getReviews()]).then(
      ([d, c, r]) => {
        if (d.status === 'fulfilled') setDocuments(d.value);
        if (c.status === 'fulfilled') setCases(c.value);
        if (r.status === 'fulfilled') setReviews(r.value);
        setLoading(false);
      }
    );
  }, []);

  const pendingReviews = reviews.filter((r) => r.status === 'PENDING').length;
  const isMismatch = reconciliation?.status === 'MISMATCH';

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-2xl font-bold font-mono text-on-surface">
            TruDoc Intelligence Command
          </h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            Deterministic document verification, financial reconciliation &amp; policy enforcement cockpit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/documents/new')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-bold rounded transition-colors shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>+ Process Documents</span>
          </button>

          <button
            onClick={() => navigate('/reconciliation')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-mono font-bold rounded transition-colors border border-outline-variant/30 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
            <span>Open Reconciliation Diff</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Cases */}
        <div
          onClick={() => navigate('/cases')}
          className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2 hover:border-primary/40 cursor-pointer transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-[10px] font-mono uppercase tracking-wider">Monitored Cases</span>
            <span className="material-symbols-outlined text-[18px] text-primary">
              folder_supervised
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-on-surface">
            {loading ? <Skeleton className="h-8 w-16" /> : cases.length}
          </div>
          <div className="text-[10px] font-mono text-on-surface-variant">
            {documents.length} ingested streams active
          </div>
        </div>

        {/* KPI 2: Review Queue */}
        <div
          onClick={() => navigate('/reviews')}
          className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2 hover:border-tertiary/40 cursor-pointer transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-[10px] font-mono uppercase tracking-wider">Review Queue</span>
            <span className="material-symbols-outlined text-[18px] text-tertiary">
              assignment_turned_in
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-tertiary">
            {loading ? <Skeleton className="h-8 w-16" /> : pendingReviews}
          </div>
          <div className="text-[10px] font-mono text-on-surface-variant">
            Pending operator clearance
          </div>
        </div>

        {/* KPI 3: Financial Variance */}
        <div
          onClick={() => navigate('/reconciliation')}
          className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2 hover:border-error/40 cursor-pointer transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-[10px] font-mono uppercase tracking-wider">Reconciliation Overrun</span>
            <span className="material-symbols-outlined text-[18px] text-error">trending_up</span>
          </div>
          <div className="text-2xl font-bold font-mono text-error">
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : reconciliation && reconciliation.has_reconciliation ? (
              <span className="text-sm">{reconciliation.reason}</span>
            ) : (
              '₹0.00'
            )}
          </div>
          <div className="text-[10px] font-mono text-error">
            {isMismatch ? '1 unapproved rate overrun' : 'Nominal'}
          </div>
        </div>

        {/* KPI 4: Trust Score */}
        <div
          onClick={() => navigate('/reconciliation')}
          className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2 hover:border-primary/40 cursor-pointer transition-all shadow-xs"
        >
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-[10px] font-mono uppercase tracking-wider">System Trust Index</span>
            <span className="material-symbols-outlined text-[18px] text-secondary">
              verified
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-secondary">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : reconciliation ? (
              reconciliation.trustScore.toFixed(2)
            ) : (
              '0.99'
            )}
          </div>
          <div className="text-[10px] font-mono text-on-surface-variant">
            / 1.00 Deterministic Attestation
          </div>
        </div>
      </div>

      {/* Main Grid: Cases & Active Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Cases Table (2 cols) */}
        <div className="lg:col-span-2 rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">
                folder_supervised
              </span>
              <h2 className="text-sm font-semibold font-mono text-on-surface">
                Active Cross-Document Reconciliation Cases
              </h2>
            </div>
            <button
              onClick={() => navigate('/cases')}
              className="text-xs font-mono text-primary hover:underline"
            >
              View All Cases →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-medium">Case Reference</th>
                  <th className="py-2.5 px-3 font-medium">Supplier Entity</th>
                  <th className="py-2.5 px-3 font-medium text-right">Committed PO</th>
                  <th className="py-2.5 px-3 font-medium text-right">Billed Invoice</th>
                  <th className="py-2.5 px-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono text-[11px]">
                {cases.map((c) => (
                  <tr
                    key={c.case_id}
                    onClick={() => navigate(`/cases/${c.case_id}`)}
                    className="hover:bg-surface-container-low/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-3 font-bold text-primary">{c.case_id}</td>
                    <td className="py-3 px-3 text-on-surface">—</td>
                    <td className="py-3 px-3 text-right text-on-surface">
                      —
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-bold text-on-surface`}
                    >
                      —
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          c.status === 'CLEARED' || c.status === 'MATCH'
                            ? 'bg-secondary/10 text-secondary'
                            : 'bg-error-container/30 text-error font-bold'
                        }`}
                      >
                        {c.status || 'PENDING'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Priority Action Card (1 col) */}
        <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-error">
              <span className="material-symbols-outlined text-[20px]">warning</span>
              <h3 className="font-semibold text-sm font-mono">Immediate Action Required</h3>
            </div>

            <div className="p-3 rounded bg-error-container/10 border border-error/30 text-xs font-mono text-on-surface space-y-2">
              <div className="font-bold text-error">Case #REC-8821 Surcharge Detected</div>
              <p className="text-[11px] text-on-surface-variant font-sans">
                Vendor ABC Technologies billed ₹5,500/u on Gateway Module Pro (+₹1,180 total overrun). Automated payment gate locked.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-outline-variant/20 font-mono text-xs">
            <button
              onClick={() => navigate('/reconciliation')}
              className="w-full py-2 px-3 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold transition-colors text-center cursor-pointer shadow-xs block"
            >
              Inspect Reconciliation Diff Tree
            </button>

            <button
              onClick={() => navigate('/reviews/rev-001')}
              className="w-full py-2 px-3 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface transition-colors text-center cursor-pointer border border-outline-variant/30 block"
            >
              Open Review Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
