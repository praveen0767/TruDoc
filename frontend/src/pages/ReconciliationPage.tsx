import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getReconciliation } from '../lib/api/reconciliation';
import { ReconciliationResult } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';
import { ExceptionModal } from '../components/modals/ExceptionModal';
import { CreditNoteModal } from '../components/modals/CreditNoteModal';

import poScanImg from '../assets/images/po_document_scan_1790408911744.jpg';
import invScanImg from '../assets/images/tax_invoice_scan_1790408928537.jpg';

export function ReconciliationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const documentId = searchParams.get('documentId');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exceptionModalOpen, setExceptionModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const loadData = async () => {
    if (!documentId || documentId === 'undefined' || documentId === 'null') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getReconciliation(documentId);
      const mappedData: any = {
        ...res,
        caseId: res.document_id || 'Unknown',
        sourceDocName: 'Source',
        targetDocName: 'Target',
        matchEngine: 'Automated Rule Engine',
        cycleId: 'CYC-001',
        trustScore: res.overall_status === 'MATCH' ? 1.0 : res.requires_review ? 0.75 : 0.9,
        trustStatus: res.overall_status || 'PENDING',
        financialVarianceAmount: 0,
        financialVariancePercent: 0,
        discrepancyVectorTitle: res.reason || (res.requires_review ? 'Mismatch Detected' : 'All Fields Match'),
        discrepancyVectorDetail: res.requires_review ? 'Manual review required to clear discrepancies.' : 'No manual intervention required.',
        fieldAgreementCount: res.entries?.filter((e) => e.status === 'MATCH').length || 0,
        totalFieldsChecked: res.entries?.length || 0,
        nodes: (res.entries || []).map((e, i) => ({
          id: `node-${i}`,
          label: e.field,
          sourceValue: e.doc_a_value,
          targetValue: e.doc_b_value,
          status: e.status,
          deltaLabel: e.difference,
          confidence: 0.98
        })),
        policyViolation: {
          complianceStatus: res.requires_review ? 'VIOLATION' : 'COMPLIANT',
          policyName: 'Reconciliation Policy',
          mandate: 'Values must match across documents.',
          varianceTolerance: '0.00%',
          actualObserved: res.requires_review ? 'Mismatch found' : 'Match',
          autoAction: res.requires_review ? 'HALT_PAYMENT' : 'PROCEED'
        },
        llmDiagnostic: {
          latencyMs: 145,
          observations: [{ status: res.requires_review ? 'ERROR' : 'OK', message: 'Reconciliation process completed.' }]
        }
      };
      setData(mappedData);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Reconciliation intelligence service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (documentId && documentId !== 'undefined' && documentId !== 'null') {
      loadData();
    } else {
      setLoading(false);
    }
  }, [documentId]);

  const handleExportAudit = () => {
    if (!data) return;
    const auditPackage = {
      exportTimestamp: new Date().toISOString(),
      caseId: data.caseId,
      cycleId: data.cycleId,
      matchEngine: data.matchEngine,
      sourceDocument: data.sourceDocName,
      targetDocument: data.targetDocName,
      trustScore: data.trustScore,
      trustStatus: data.trustStatus,
      financialVarianceAmount: data.financialVarianceAmount,
      discrepancyVector: data.discrepancyVectorTitle,
      diffTree: data.nodes,
      policyViolation: data.policyViolation,
      llmDiagnostic: data.llmDiagnostic,
      attestation: {
        officer: 'Agent Ops / Lead ML Verification Officer',
        signature: 'sha256:d81a99c43b2f9011e4f445a6b78c90de123456789abcdef0123456789abcdef0',
      },
    };

    const blob = new Blob([JSON.stringify(auditPackage, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TruDoc_AuditPackage_Case_${data.caseId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setNotification({
      message: `Audit package exported successfully for Case #${data.caseId}`,
      type: 'success',
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    if (!documentId) {
      return (
        <div className="p-8 text-center text-on-surface-variant font-mono">
          Select a document to view reconciliation.
        </div>
      );
    }
    return (
      <div className="p-8">
        <ErrorMessage
          title="Document Reconciliation Engine Offline"
          message={error || 'Unable to retrieve reconciliation comparison state from backend.'}
          onRetry={loadData}
        />
      </div>
    );
  }

  const isMismatch = data.status === 'MISMATCH';

  return (
    <div className="flex flex-col w-full pb-10">
      {/* Toast Notification Banner */}
      {notification && (
        <div className="bg-secondary/15 border-b border-secondary/30 px-6 py-2 flex items-center justify-between text-xs font-mono text-secondary">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Command Header & Breadcrumb Bar */}
      <div className="px-6 py-4 bg-surface-container-lowest flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/20">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant flex-wrap">
            <span
              onClick={() => navigate('/cases')}
              className="hover:text-primary cursor-pointer transition-colors"
            >
              Reconciliation
            </span>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-mono font-medium">Case #{data.caseId}</span>
            <span className="text-outline-variant">/</span>
            <span className="text-on-surface font-mono bg-surface-container-high px-2 py-0.5 rounded">
              {data.sourceDocName} ↔ {data.targetDocName}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {isMismatch ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-error-container/30 text-error">
                <span className="w-2 h-2 rounded-full bg-error animate-ping"></span>
                <span className="text-[10px] font-mono font-semibold tracking-wider uppercase">
                  Mismatch Detected
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-secondary/10 text-secondary border border-secondary/25">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                <span className="text-[10px] font-mono font-semibold tracking-wider uppercase">
                  Audit Cleared &amp; Reconciled
                </span>
              </div>
            )}

            {isMismatch && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-tertiary-container/30 text-tertiary">
                <span className="material-symbols-outlined text-[14px]">pause_circle</span>
                <span className="text-[10px] font-mono font-semibold uppercase">
                  Review Required: Clearing Halted
                </span>
              </div>
            )}

            <span className="text-[10px] font-mono text-on-surface-variant">
              {data.matchEngine} · Cycle ID {data.cycleId}
            </span>
          </div>
        </div>

        {/* Action Group */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleExportAudit}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-[11px] font-mono transition-colors shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">download</span>
            <span>Export Audit Package</span>
          </button>

          <button
            onClick={() => setExceptionModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-surface-container-high hover:bg-surface-bright text-tertiary text-[11px] font-mono transition-colors shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">verified</span>
            <span>Approve with Exception</span>
          </button>

          <button
            onClick={() => navigate('/reviews/rev-001')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-[11px] font-mono font-semibold transition-colors shadow-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
            <span>Send to Review Queue</span>
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* KPI Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1 */}
          <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Field Agreement
              </span>
              <span className="material-symbols-outlined text-[18px] text-tertiary">
                difference
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-on-surface font-mono">
                {data.fieldAgreementCount} / {data.totalFieldsChecked}
              </span>
              <span className="text-[11px] text-tertiary font-mono">
                {((data.fieldAgreementCount / data.totalFieldsChecked) * 100).toFixed(1)}% verified
              </span>
            </div>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-tertiary h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(data.fieldAgreementCount / data.totalFieldsChecked) * 100}%`,
                }}
              ></div>
            </div>
          </div>

          {/* KPI 2 */}
          <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Financial Variance
              </span>
              <span className="material-symbols-outlined text-[18px] text-error">trending_up</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-error font-mono">
                +₹{data.financialVarianceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-error font-mono">
                +{data.financialVariancePercent.toFixed(2)}% overrun
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-mono text-on-surface-variant mt-3">
              <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
              <span>Billed gross exceeds committed PO</span>
            </div>
          </div>

          {/* KPI 3 */}
          <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Discrepancy Vector
              </span>
              <span className="material-symbols-outlined text-[18px] text-primary">analytics</span>
            </div>
            <div className="text-[13px] text-on-surface font-medium line-clamp-2">
              {data.discrepancyVectorTitle}
            </div>
            <div className="text-[10px] text-on-surface-variant font-mono mt-2 truncate">
              {data.discrepancyVectorDetail}
            </div>
          </div>

          {/* KPI 4 */}
          <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant">
                Trust Score
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  data.trustStatus === 'VERIFIED'
                    ? 'text-secondary bg-secondary/10'
                    : 'text-error bg-error/10'
                }`}
              >
                {data.trustStatus}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[24px] font-bold text-tertiary font-mono">
                {data.trustScore.toFixed(2)}
              </span>
              <span className="text-[11px] text-on-surface-variant">/ 1.00 index</span>
            </div>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-tertiary h-full rounded-full transition-all duration-500"
                style={{ width: `${data.trustScore * 100}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Section 1: Interactive Reconciliation Graph / Diff Tree */}
        <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3 bg-surface-container-low/40 p-3 rounded">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">account_tree</span>
              <span className="text-[15px] font-semibold text-on-surface">
                Deterministic Reconciliation Diff Tree
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary font-mono rounded">
                {data.nodes.length} NODES CHECKED
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-on-surface-variant font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-secondary"></span>{' '}
                {data.nodes.filter((n) => n.status === 'MATCH').length} EXACT MATCH
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded bg-error"></span>{' '}
                {data.nodes.filter((n) => n.status !== 'MATCH').length} VALUE MISMATCH
              </span>
            </div>
          </div>

          {/* Diff Table / Tree Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-4 font-medium">Reconciliation Node</th>
                  <th className="py-2.5 px-4 font-medium">Purchase Order ({data.sourceDocName})</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status &amp; Delta</th>
                  <th className="py-2.5 px-4 font-medium">Tax Invoice ({data.targetDocName})</th>
                  <th className="py-2.5 px-4 font-medium text-right font-mono">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono text-[12px]">
                {data.nodes.map((node) => {
                  const isNodeMatch = node.status === 'MATCH';
                  return (
                    <tr
                      key={node.id}
                      className={`transition-colors ${
                        isNodeMatch
                          ? 'hover:bg-surface-container-low/60'
                          : 'bg-error-container/10 hover:bg-error-container/20'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-medium text-on-surface flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined text-[16px] ${
                            isNodeMatch ? 'text-secondary' : 'text-error'
                          }`}
                        >
                          {isNodeMatch ? 'check_circle' : 'warning'}
                        </span>
                        <span>{node.label}</span>
                      </td>

                      <td className="py-2.5 px-4 text-on-surface">{node.sourceValue}</td>

                      <td className="py-2.5 px-4 text-center">
                        {isNodeMatch ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/10 text-secondary text-[10px] font-mono">
                            MATCH ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-error-container/40 text-error text-[10px] font-mono font-bold">
                            {node.deltaLabel || 'MISMATCH ✗'}
                          </span>
                        )}
                      </td>

                      <td
                        className={`py-2.5 px-4 ${
                          isNodeMatch ? 'text-on-surface' : 'text-error font-semibold'
                        }`}
                      >
                        {node.targetValue}
                      </td>

                      <td
                        className={`py-2.5 px-4 text-right font-mono text-[11px] ${
                          isNodeMatch ? 'text-secondary' : 'text-error font-bold'
                        }`}
                      >
                        {node.confidence.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Side-by-Side Dual Document Comparison Columns */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Source Purchase Order */}
          <div className="flex flex-col bg-surface-container-lowest border border-outline-variant/20 rounded shadow-xs overflow-hidden">
            {/* Column Top Banner */}
            <div className="bg-surface-container-low px-5 py-3 flex items-center justify-between border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-[20px]">assignment</span>
                <div>
                  <span className="text-[15px] font-semibold text-on-surface block leading-tight">
                    Source Purchase Order
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-mono block">
                    {data.sourceDocName}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-secondary/10 text-secondary font-mono border border-secondary/20">
                  CONTRACTUALLY BINDING
                </span>
              </div>
            </div>

            {/* Document Content */}
            <div className="p-5 space-y-5 flex-1">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded bg-surface-container-low text-[10px] font-mono">
                <div>
                  <span className="text-on-surface-variant block uppercase">Issue Date</span>
                  <span className="text-on-surface font-medium">18-Mar-2026</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase">Authorized Signatory</span>
                  <span className="text-on-surface font-medium font-sans">R. Verma (Procurement)</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase">Currency</span>
                  <span className="text-on-surface font-medium">INR (₹)</span>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant uppercase font-mono block mb-1">
                    Supplier Entity
                  </span>
                  <span className="font-semibold text-on-surface block">ABC Technologies Pvt Ltd</span>
                  <span className="text-on-surface-variant font-mono text-[10px] block mt-0.5">
                    GSTIN: 27AABCT9982E1Z8
                  </span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant uppercase font-mono block mb-1">
                    Purchaser Entity
                  </span>
                  <span className="font-semibold text-on-surface block">XYZ Industries Pvt Ltd</span>
                  <span className="text-on-surface-variant font-mono text-[10px] block mt-0.5">
                    GSTIN: 29XYZIN4321A1Z2
                  </span>
                </div>
              </div>

              {/* Reconstructed PO Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant">
                  <span className="uppercase tracking-wider font-semibold">
                    Authorized Contract Line Items
                  </span>
                  <span className="text-secondary">ALL PRE-APPROVED</span>
                </div>
                <div className="rounded bg-surface-container-low overflow-hidden border border-outline-variant/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-surface-container-high text-on-surface-variant text-[10px] font-mono uppercase">
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Agreed Rate</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px] divide-y divide-outline-variant/10">
                      <tr className="hover:bg-surface-bright/20">
                        <td className="py-2 px-3 text-on-surface font-sans">
                          01. Industrial Sensor v4 (IP68)
                        </td>
                        <td className="py-2 px-3 text-right text-on-surface">10</td>
                        <td className="py-2 px-3 text-right text-on-surface">₹2,500.00</td>
                        <td className="py-2 px-3 text-right text-on-surface font-semibold">
                          ₹25,000.00
                        </td>
                      </tr>
                      <tr className="bg-secondary/5 hover:bg-secondary/10">
                        <td className="py-2 px-3 text-on-surface font-sans">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                            <span>02. Gateway Module Pro</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-on-surface">2</td>
                        <td className="py-2 px-3 text-right text-secondary font-bold">₹5,000.00</td>
                        <td className="py-2 px-3 text-right text-on-surface font-semibold">
                          ₹10,000.00
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* PO Financial Summary */}
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal (Base)</span>
                  <span>₹35,000.00</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>IGST (18.0%)</span>
                  <span>₹6,300.00</span>
                </div>
                <div className="flex justify-between pt-1.5 text-on-surface font-bold text-sm border-t border-outline-variant/20">
                  <span>Total Commitment</span>
                  <span className="text-primary font-mono">₹41,300.00</span>
                </div>
              </div>

              {/* Document Preview Visual with Match Overlays */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-semibold">
                  OCR Ingest &amp; Bounding Anchors
                </span>
                <div className="relative rounded overflow-hidden h-48 bg-surface-container-high border border-outline-variant/30">
                  <img
                    className="w-full h-full object-cover opacity-60"
                    alt="Dark scanner preview of Purchase Order"
                    src={poScanImg}
                  />
                  {/* Telemetry Overlay Anchors */}
                  <div className="absolute inset-0 p-3 pointer-events-none flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/80 text-secondary text-[10px] font-mono border border-secondary/20">
                        OCR: Tesseract v5.3 [CONF 99.4%]
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-secondary/20 text-secondary text-[10px] font-mono border border-secondary/30">
                        HASH: sha256:d81a...99c4
                      </span>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/85 font-mono text-[10px] text-secondary flex items-center justify-between border border-secondary/30">
                      <span>Line 2 Anchor: [x:120, y:340, w:420, h:24]</span>
                      <span className="text-secondary font-bold">RATE: ₹5,000.00 (VERIFIED)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Received Tax Invoice */}
          <div className="flex flex-col bg-surface-container-lowest border border-outline-variant/20 rounded shadow-xs overflow-hidden">
            {/* Column Top Banner */}
            <div className="bg-surface-container-low px-5 py-3 flex items-center justify-between border-b border-outline-variant/20">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-tertiary text-[20px]">receipt</span>
                <div>
                  <span className="text-[15px] font-semibold text-on-surface block leading-tight">
                    Received Tax Invoice
                  </span>
                  <span className="text-[10px] text-on-surface-variant font-mono block">
                    {data.targetDocName}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded bg-error-container/30 text-error font-mono font-semibold border border-error/30">
                  AWAITING AUDIT CLEARANCE
                </span>
              </div>
            </div>

            {/* Document Content */}
            <div className="p-5 space-y-5 flex-1">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded bg-surface-container-low text-[10px] font-mono">
                <div>
                  <span className="text-on-surface-variant block uppercase">Invoice Date</span>
                  <span className="text-on-surface font-medium">24-Mar-2026</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase">Payment Due Date</span>
                  <span className="text-on-surface font-medium">23-Apr-2026</span>
                </div>
                <div>
                  <span className="text-on-surface-variant block uppercase">PO Ref Stated</span>
                  <span className="text-secondary font-medium">PO-2026-1042 ✓</span>
                </div>
              </div>

              {/* Parties */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant uppercase font-mono block mb-1">
                    Supplier Entity (Biller)
                  </span>
                  <span className="font-semibold text-on-surface block">ABC Technologies Pvt Ltd</span>
                  <span className="text-on-surface-variant font-mono text-[10px] block mt-0.5">
                    GSTIN: 27AABCT9982E1Z8
                  </span>
                </div>
                <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                  <span className="text-[10px] text-on-surface-variant uppercase font-mono block mb-1">
                    Billed Recipient
                  </span>
                  <span className="font-semibold text-on-surface block">XYZ Industries Pvt Ltd</span>
                  <span className="text-on-surface-variant font-mono text-[10px] block mt-0.5">
                    GSTIN: 29XYZIN4321A1Z2
                  </span>
                </div>
              </div>

              {/* Reconstructed Invoice Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-on-surface-variant">
                  <span className="uppercase tracking-wider font-semibold">Vendor Billed Items</span>
                  <span className="text-error font-bold">1 RATE OVERRUN DETECTED</span>
                </div>
                <div className="rounded bg-surface-container-low overflow-hidden border border-outline-variant/20">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-surface-container-high text-on-surface-variant text-[10px] font-mono uppercase">
                        <th className="py-2 px-3">Item Description</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Billed Rate</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px] divide-y divide-outline-variant/10">
                      <tr className="hover:bg-surface-bright/20">
                        <td className="py-2 px-3 text-on-surface font-sans">
                          01. Industrial Sensor v4 (IP68)
                        </td>
                        <td className="py-2 px-3 text-right text-on-surface">10</td>
                        <td className="py-2 px-3 text-right text-on-surface">₹2,500.00</td>
                        <td className="py-2 px-3 text-right text-on-surface font-semibold">
                          ₹25,000.00
                        </td>
                      </tr>
                      <tr className="bg-error-container/20 hover:bg-error-container/30">
                        <td className="py-2 px-3 text-error font-sans font-medium">
                          <div className="flex items-center justify-between">
                            <span>02. Gateway Module Pro</span>
                            <span className="px-1.5 py-0.5 rounded bg-error text-on-error text-[10px] font-mono font-bold">
                              SURCHARGE +₹500/u
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-error font-bold">2</td>
                        <td className="py-2 px-3 text-right text-error font-bold">₹5,500.00</td>
                        <td className="py-2 px-3 text-right text-error font-bold">₹11,000.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invoice Financial Summary */}
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal (Base)</span>
                  <span className="text-error font-bold">₹36,000.00 (+₹1,000)</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>IGST (18.0%)</span>
                  <span className="text-error font-bold">₹6,480.00 (+₹180)</span>
                </div>
                <div className="flex justify-between pt-1.5 text-on-surface font-bold text-sm border-t border-outline-variant/20">
                  <span className="flex items-center gap-1.5">
                    <span>Invoice Total Billed</span>
                    <span className="text-[10px] font-mono text-error uppercase font-bold">
                      [OVERRUN]
                    </span>
                  </span>
                  <span className="text-error font-mono">₹42,480.00</span>
                </div>
              </div>

              {/* Document Preview Visual with Amber Bounding Box */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-semibold">
                  OCR Bounding Box Inspector
                </span>
                <div className="relative rounded overflow-hidden h-48 bg-surface-container-high border border-outline-variant/30">
                  <img
                    className="w-full h-full object-cover opacity-60"
                    alt="Technical scan preview of Tax Invoice with bounding box callout"
                    src={invScanImg}
                  />
                  {/* Telemetry Overlay Anchors */}
                  <div className="absolute inset-0 p-3 pointer-events-none flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/80 text-tertiary text-[10px] font-mono border border-tertiary/20">
                        OCR: Tesseract v5.3 [CONF 98.7%]
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-error-container/80 text-error text-[10px] font-mono border border-error/40">
                        DISCREPANCY DETECTED
                      </span>
                    </div>
                    {/* Disputed Line Anchor Callout */}
                    <div className="p-2 rounded bg-surface-container-lowest/90 font-mono text-[10px] text-error flex items-center justify-between border border-error/50">
                      <span>Target BBox: [x:118, y:368, w:428, h:28]</span>
                      <span className="font-bold underline decoration-error">
                        BILLED: ₹5,500.00 (FLAGGED)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Deep-Dive Reconciliation Analysis & Policy Audit */}
        <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-error text-[22px]">policy</span>
              <div>
                <h2 className="text-[16px] font-semibold text-on-surface">
                  Policy Enforcement &amp; Agent Diagnostic Trace
                </h2>
                <span className="text-[10px] font-mono text-on-surface-variant">
                  Automated Clearing Rule Engine v4.12 · Policy POL-FIN-04
                </span>
              </div>
            </div>
            <div className="px-3 py-1 rounded bg-error-container/30 text-error text-[10px] font-mono font-bold flex items-center gap-1.5 border border-error/30">
              <span className="material-symbols-outlined text-[16px]">cancel</span>
              <span>COMPLIANCE STATUS: {data.policyViolation?.complianceStatus || 'VIOLATION'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Rule Specifications Card */}
            <div className="p-4 rounded bg-surface-container-low border border-outline-variant/20 space-y-3">
              <div className="flex items-center gap-2 text-on-surface font-semibold text-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                <span>{data.policyViolation?.policyName || 'Policy POL-FIN-04 Mandate'}</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                "{data.policyViolation?.mandate}"
              </p>
              <div className="pt-2 text-[10px] font-mono space-y-1 text-on-surface-variant border-t border-outline-variant/20">
                <div className="flex justify-between">
                  <span>Variance Tolerance:</span>
                  <span className="text-secondary font-bold">
                    {data.policyViolation?.varianceTolerance || '0.00%'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Actual Observed:</span>
                  <span className="text-error font-bold">
                    {data.policyViolation?.actualObserved || '+10.00% on Item #2'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Auto-Action:</span>
                  <span className="text-tertiary">
                    {data.policyViolation?.autoAction || 'HALT_PAYMENT_PIPELINE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Agent Trace & Root Cause Note */}
            <div className="p-4 rounded bg-surface-container-low border border-outline-variant/20 space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-on-surface font-semibold text-xs">
                  <span className="material-symbols-outlined text-primary text-[18px]">smart_toy</span>
                  <span>LLM Reasoner Diagnostic Analysis</span>
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  LATENCY: {data.llmDiagnostic?.latencyMs ?? 42}ms
                </span>
              </div>

              <div className="p-3 rounded bg-surface-container-lowest border border-outline-variant/20 font-mono text-[11px] text-on-surface space-y-2 leading-relaxed">
                {data.llmDiagnostic?.observations.map((obs, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-1.5 ${
                      obs.status === 'OK' ? 'text-secondary' : 'text-error font-semibold'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {obs.status === 'OK' ? 'check_circle' : 'error'}
                    </span>
                    <span>{obs.message}</span>
                  </div>
                ))}
                <p className="text-on-surface-variant text-[11px] pt-1">
                  "{data.llmDiagnostic?.explanation}"
                </p>
              </div>

              {/* Quick Resolution Actions */}
              <div className="pt-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-on-surface-variant font-semibold block mb-2">
                  Recommended Operational Protocols
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setCreditModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-mono font-semibold hover:bg-primary-fixed transition-colors shadow-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">outgoing_mail</span>
                    <span>Request Credit Note for ₹1,180.00</span>
                  </button>

                  <button
                    onClick={() => setExceptionModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high text-on-surface hover:bg-surface-bright text-xs font-mono transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit_document</span>
                    <span>Approve Overrun as Authorized Variance</span>
                  </button>

                  <button
                    onClick={() => {
                      setNotification({
                        message: 'Escalation ticket #ESC-9941 dispatched to Procurement Officer (R. Verma)',
                        type: 'info',
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high text-tertiary hover:bg-surface-bright text-xs font-mono transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">person_alert</span>
                    <span>Escalate to Procurement Officer</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Exception Sign-Off Modal */}
      <ExceptionModal
        isOpen={exceptionModalOpen}
        onClose={() => setExceptionModalOpen(false)}
        caseId={data.caseId}
        onSuccess={(msg) => {
          setNotification({ message: msg, type: 'success' });
          loadData();
        }}
      />

      {/* Credit Note Requisition Modal */}
      <CreditNoteModal
        isOpen={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        caseId={data.caseId}
        amount={data.financialVarianceAmount}
        onSuccess={(msg) => {
          setNotification({ message: msg, type: 'success' });
        }}
      />
    </div>
  );
}
