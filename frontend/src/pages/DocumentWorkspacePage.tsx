import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getDocument, revalidateDocument, pageImageUrl } from '../lib/api/documents';
import { getReconciliation } from '../lib/api/reconciliation';
import { getRun } from '../lib/api/runs';
import { ApiError } from '../lib/api/client';
import {
  AgentTrace,
  BBox,
  Document,
  DocumentField,
  ReconciliationResult,
} from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { DocumentDetailSkeleton } from '../components/common/Skeleton';

type WorkspaceTab = 'overview' | 'extraction' | 'evidence' | 'table' | 'validation' | 'reconciliation' | 'trace';

const ZERO: BBox = [0, 0, 0, 0];
const hasBox = (b: BBox | undefined | null): b is BBox =>
  !!b && b.length === 4 && b[2] > b[0] && b[3] > b[1];

function statusClass(s: string): string {
  if (s === 'VALID' || s === 'VERIFIED' || s === 'CLEAR' || s === 'MATCH' || s === 'GOOD')
    return 'bg-secondary/10 text-secondary border-secondary/30';
  if (s === 'REVIEW_REQUIRED' || s === 'DEGRADED' || s === 'SUSPICIOUS' || s === 'MISSING')
    return 'bg-tertiary-container/30 text-tertiary border-tertiary/40';
  return 'bg-error-container/30 text-error border-error/40';
}

export function DocumentWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState<Document | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [trace, setTrace] = useState<AgentTrace | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Real natural pixel size of the served page image. bbox coords are in these
  // pixels, so overlay geometry is derived — never hardcoded.
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [imgTimeout, setImgTimeout] = useState(false);

  const activeTab = (searchParams.get('tab') as WorkspaceTab) || 'overview';
  const setTab = (tab: WorkspaceTab) => setSearchParams({ tab });

  const currentPage = document && selectedKey && document.fields[selectedKey] ? document.fields[selectedKey].page : 1;

  useEffect(() => {
    setImgSize(null);
    setImgError(false);
    setImgTimeout(false);
    const timer = setTimeout(() => setImgTimeout(true), 3000);
    return () => clearTimeout(timer);
  }, [id, currentPage]);

  const loadDocumentData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await getDocument(id);
      setDocument(doc);

      const keys = Object.keys(doc.fields);
      if (keys.length > 0) {
        const flagged = keys.find((k) => doc.fields[k].status === 'REVIEW_REQUIRED');
        setSelectedKey(flagged ?? keys[0]);
      }

      try {
        setReconciliation(await getReconciliation(id));
      } catch {
        setReconciliation(null);
      }
      try {
        setTrace(await getRun(id));
      } catch {
        setTrace(null);
      }
    } catch (err: unknown) {
      setError(
        err instanceof ApiError && err.isNetworkError
          ? `Document intelligence service unreachable. ${err.message}`
          : err instanceof Error
          ? err.message
          : 'Document processing service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDocumentData();
  }, [loadDocumentData]);

  const handleRevalidate = async () => {
    if (!id) return;
    setRevalidating(true);
    try {
      const updated = await revalidateDocument(id);
      setDocument(updated);
      setToast(`Backend revalidated ${id} → ${updated.overall_status}`);
      setTimeout(() => setToast(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Revalidation request failed');
    } finally {
      setRevalidating(false);
    }
  };

  if (loading) return <DocumentDetailSkeleton />;

  if (error || !document) {
    return (
      <div className="p-8">
        <ErrorMessage
          title="Document Workspace Unavailable"
          message={error || `Document "${id}" could not be retrieved from the backend.`}
          onRetry={loadDocumentData}
        />
      </div>
    );
  }

  const p = document.provenance;
  const fieldEntries = Object.entries(document.fields);
  const selected: DocumentField | null = selectedKey ? document.fields[selectedKey] ?? null : null;
  const selectedEvidence = selected?.evidence?.[0] ?? null;
  const isReview = document.overall_status === 'REVIEW_REQUIRED' || document.review_required;

  // Mean reliability across extracted fields, from backend values only.
  const meanRel =
    fieldEntries.length > 0
      ? fieldEntries.reduce((a, [, f]) => a + f.reliability, 0) / fieldEntries.length
      : 0;
  const covered = fieldEntries.filter(([, f]) => f.status !== 'UNEXTRACTED').length;

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: 'info' },
    { id: 'extraction' as const, label: 'Extraction', icon: 'table_rows', count: fieldEntries.length },
    { id: 'evidence' as const, label: 'Evidence', icon: 'find_in_page' },
    { id: 'table' as const, label: 'Table', icon: 'receipt_long', count: document.table?.rows.length ?? 0 },
    { id: 'validation' as const, label: 'Validation', icon: 'rule' },
    { id: 'reconciliation' as const, label: 'Reconciliation', icon: 'compare_arrows' },
    { id: 'trace' as const, label: 'Trace', icon: 'account_tree' },
  ];

  return (
    <div className="flex flex-col w-full min-h-full pb-10">
      {toast && (
        <div className="bg-secondary/15 border-b border-secondary/30 px-6 py-2 flex items-center justify-between text-xs font-mono text-secondary">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast(null)} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 bg-surface-container-lowest border-b border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant">
            <span onClick={() => navigate('/documents')} className="hover:text-primary cursor-pointer">
              Documents
            </span>
            <span className="text-outline-variant">/</span>
            <span className="font-semibold text-primary">{p.document_id}</span>
            {document.case_id && (
              <>
                <span className="text-outline-variant">/</span>
                <span className="bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface">
                  Case {document.case_id}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-on-surface font-mono">{p.document_id}</h1>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusClass(document.overall_status)}`}>
              {document.overall_status}
            </span>
            {document.quality.status !== 'GOOD' && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-tertiary-container/30 text-tertiary border border-tertiary/40">
                QUALITY {document.quality.status}
              </span>
            )}
            <span className="text-[10px] font-mono text-on-surface-variant">
              Type: {p.document_type} · Reliability: {(meanRel * 100).toFixed(0)}% · OCR:{' '}
              {p.ocr_engine} {p.ocr_engine_version}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRevalidate}
            disabled={revalidating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono transition-colors border border-outline-variant/30 cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">autorenew</span>
            <span>{revalidating ? 'Revalidating…' : 'Revalidate'}</span>
          </button>
          {isReview && (
            <button
              onClick={() => navigate('/reviews')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">assignment_turned_in</span>
              <span>Open Human Review</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 bg-surface-container-low border-b border-outline-variant/20 flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-mono border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-primary text-primary font-bold bg-surface-container-high/40'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] px-1 bg-surface-container-high rounded text-on-surface-variant">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-6">
        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">Mean Field Reliability</span>
                <div className="text-2xl font-bold font-mono text-on-surface">{(meanRel * 100).toFixed(1)}%</div>
                <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${meanRel * 100}%` }} />
                </div>
              </div>
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">Field Coverage</span>
                <div className="text-2xl font-bold font-mono text-on-surface">
                  {fieldEntries.length === 0 ? 0 : Math.round((covered / fieldEntries.length) * 100)}%
                </div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  {covered} of {fieldEntries.length} extracted
                </span>
              </div>
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">Image Quality</span>
                <div className="text-2xl font-bold font-mono text-on-surface">{document.quality.status}</div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  score {document.quality.score} · contrast {document.quality.signals.contrast.toFixed(1)} ·
                  blur {document.quality.signals.blur.toFixed(1)}
                </span>
              </div>
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant">Integrity</span>
                <div className="text-2xl font-bold font-mono text-secondary">{document.tamper.status}</div>
                <span className="text-[10px] text-on-surface-variant font-mono">
                  duplicate: {document.duplicate.status}
                </span>
              </div>
            </div>

            <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4">
              <h3 className="text-sm font-semibold text-on-surface font-mono flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">fingerprint</span>
                <span>Cryptographic Provenance &amp; Ingestion Metadata</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
                {[
                  ['Document ID', p.document_id],
                  ['Document Type', `${p.document_type} (${p.classification_method})`],
                  ['Pages', String(p.page_count)],
                  ['OCR Engine', `${p.ocr_engine} ${p.ocr_engine_version}`],
                  ['MIME Type', p.mime_type ?? '—'],
                  ['Processed At', p.processed_at ? new Date(p.processed_at).toLocaleString() : '—'],
                  ['Schema / Pipeline', `${p.schema_version} / ${p.pipeline_version}`],
                  ['OCR Mean Confidence', String(document.ocr_results?.[0]?.mean_confidence ?? 0)],
                  ['Review Required', String(document.review_required)],
                ].map(([k, v]) => (
                  <div key={k} className="p-3 bg-surface-container-low rounded border border-outline-variant/20">
                    <span className="text-[10px] text-on-surface-variant block uppercase">{k}</span>
                    <span className="text-on-surface font-semibold break-all">{v}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-surface-container-low rounded border border-outline-variant/20 font-mono text-[11px] text-on-surface-variant break-all">
                <span className="text-on-surface font-bold">SHA-256 Content Hash: </span>
                {p.content_hash}
              </div>
            </div>
          </div>
        )}

        {/* EXTRACTION */}
        {activeTab === 'extraction' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-on-surface-variant">
                {fieldEntries.length} fields returned by the backend extractor
              </span>
              <button
                onClick={() => setTab('evidence')}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Document Evidence Viewer</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>

            <div className="rounded bg-surface-container-lowest border border-outline-variant/20 overflow-x-auto">
              <table className="w-full text-left font-sans text-xs">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-medium">Field</th>
                    <th className="py-2.5 px-4 font-medium">Value</th>
                    <th className="py-2.5 px-4 font-medium">Raw OCR</th>
                    <th className="py-2.5 px-4 font-medium text-center">OCR Conf</th>
                    <th className="py-2.5 px-4 font-medium text-center">Reliability</th>
                    <th className="py-2.5 px-4 font-medium text-center">Page / BBox</th>
                    <th className="py-2.5 px-4 font-medium text-center">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 font-mono text-[11px]">
                  {fieldEntries.map(([name, f]) => (
                    <tr
                      key={name}
                      className={`hover:bg-surface-container-low/60 transition-colors ${
                        f.status === 'REVIEW_REQUIRED' ? 'bg-tertiary-container/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-on-surface">{name}</td>
                      <td className="py-3 px-4 text-on-surface font-semibold">{f.value || '—'}</td>
                      <td className="py-3 px-4 text-on-surface-variant text-[10px] max-w-xs truncate">
                        {f.raw_text || '—'}
                      </td>
                      <td className="py-3 px-4 text-center">{f.ocr_confidence.toFixed(3)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={f.reliability >= 0.7 ? 'text-secondary font-bold' : 'text-tertiary font-bold'}>
                          {f.reliability.toFixed(3)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-[10px] text-on-surface-variant">
                        p{f.page} {hasBox(f.bbox) ? `[${f.bbox.join(',')}]` : 'no bbox'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusClass(f.status)}`}>
                          {f.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedKey(name);
                            setTab('evidence');
                          }}
                          disabled={f.evidence.length === 0}
                          className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-primary text-[10px] font-mono transition-colors cursor-pointer border border-outline-variant/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {f.evidence.length > 0 ? '[View Evidence]' : 'No evidence'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* EVIDENCE + BBOX OVERLAY */}
        {activeTab === 'evidence' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
                <span className="font-semibold text-on-surface uppercase tracking-wider">
                  Document Page &amp; Actual OCR Bounding Boxes
                </span>
                <span>
                  {imgSize ? `image ${imgSize.w}×${imgSize.h}px` : 'loading image…'}
                </span>
              </div>

              <div className="relative rounded overflow-hidden bg-surface-container-high border border-outline-variant/30">
                {imgError || imgTimeout ? (
                  <div className="p-12 text-center text-error font-mono text-xs">
                    Source image unavailable
                  </div>
                ) : (
                  <div className="relative inline-block w-full">
                    {!imgSize && (
                      <div className="p-12 text-center text-on-surface-variant font-mono text-xs">
                        Loading original page image from backend…
                      </div>
                    )}
                    <img
                      src={pageImageUrl(p.document_id, selected?.page ?? 1)}
                      alt={`Document page ${selected?.page ?? 1}`}
                      onLoad={(e) =>
                        setImgSize({
                          w: e.currentTarget.naturalWidth,
                          h: e.currentTarget.naturalHeight,
                        })
                      }
                      onError={() => setImgError(true)}
                      className={`block opacity-80 ${!imgSize ? 'w-0 h-0 absolute opacity-0' : 'w-full h-auto'}`}
                    />
                    {/* Overlays scaled by the REAL image pixel dimensions */}
                    {imgSize && (
                      <div className="absolute inset-0 pointer-events-none">
                        {fieldEntries
                          .filter(([, f]) => hasBox(f.bbox) && f.page === (selected?.page ?? 1))
                          .map(([name, f]) => {
                            const [x1, y1, x2, y2] = f.bbox;
                            const isSel = selectedKey === name;
                            return (
                              <div
                                key={name}
                                title={`${name}: ${f.value}`}
                                className={`absolute border transition-all ${
                                  isSel
                                    ? 'border-2 border-primary bg-primary/25 shadow-lg'
                                    : f.status === 'REVIEW_REQUIRED'
                                    ? 'border border-tertiary bg-tertiary/10'
                                    : 'border border-secondary/40 bg-secondary/5'
                                }`}
                                style={{
                                  left: `${(x1 / imgSize.w) * 100}%`,
                                  top: `${(y1 / imgSize.h) * 100}%`,
                                  width: `${((x2 - x1) / imgSize.w) * 100}%`,
                                  height: `${((y2 - y1) / imgSize.h) * 100}%`,
                                }}
                              />
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selected && hasBox(selected.bbox) && (
                <div className="p-3 rounded bg-surface-container-lowest border border-primary/30 font-mono text-[11px] text-primary">
                  Active bbox for <b>{selected.name}</b>: [{selected.bbox.join(', ')}] on page{' '}
                  {selected.page} — drawn from OCR, not synthesised.
                </div>
              )}
            </div>

            {/* Inspector */}
            <div className="space-y-4">
              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
                  <h3 className="font-semibold text-sm text-on-surface font-mono">Evidence Inspector</h3>
                  {selected && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusClass(selected.status)}`}>
                      {selected.status}
                    </span>
                  )}
                </div>

                {selected ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <span className="text-[10px] text-on-surface-variant block uppercase">Field</span>
                      <span className="font-bold text-on-surface text-sm">{selected.name}</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20 space-y-1">
                      <span className="text-[10px] text-on-surface-variant block uppercase">Normalized Value</span>
                      <span className="text-primary font-bold break-all">{selected.normalized_value || '—'}</span>
                    </div>
                    <div className="p-2.5 bg-surface-container-low rounded border border-outline-variant/20 space-y-1">
                      <span className="text-[10px] text-on-surface-variant block uppercase">Raw OCR Text</span>
                      <span className="text-on-surface text-[11px] break-all">
                        {selectedEvidence?.text ?? selected.raw_text ?? '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">OCR Confidence</span>
                        <span className="text-secondary font-bold">{selected.ocr_confidence.toFixed(3)}</span>
                      </div>
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">Page</span>
                        <span className="text-on-surface font-bold">{selected.page}</span>
                      </div>
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">Reliability</span>
                        <span className="text-on-surface font-bold">{selected.reliability.toFixed(3)}</span>
                      </div>
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20">
                        <span className="text-on-surface-variant block uppercase">Method</span>
                        <span className="text-on-surface font-bold break-all">{selected.extraction_method}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20 text-[10px]">
                      <span className="text-on-surface-variant block uppercase mb-0.5">Bounding Box [x1,y1,x2,y2]</span>
                      <span className="text-primary break-all">
                        {hasBox(selected.bbox) ? `[${selected.bbox.join(', ')}]` : 'no bbox reported by backend'}
                      </span>
                    </div>
                    {selected.reasons.length > 0 && (
                      <div className="p-2 bg-surface-container-low rounded border border-outline-variant/20 text-[10px]">
                        <span className="text-on-surface-variant block uppercase mb-1">Backend Reasons</span>
                        <ul className="list-disc list-inside space-y-0.5 text-on-surface-variant">
                          {selected.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-on-surface-variant font-mono">Select a field to inspect evidence.</div>
                )}
              </div>

              <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                <span className="text-[10px] font-mono uppercase text-on-surface-variant block">All Fields</span>
                <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
                  {fieldEntries.map(([name, f]) => (
                    <div
                      key={name}
                      onClick={() => setSelectedKey(name)}
                      className={`p-2 rounded cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                        selectedKey === name
                          ? 'bg-primary/10 border border-primary/40 text-primary'
                          : 'hover:bg-surface-container-low text-on-surface-variant'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      <span className="text-[10px] opacity-80 truncate max-w-[45%]">{f.value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TABLE */}
        {activeTab === 'table' && (
          <div className="space-y-4">
            {document.table && document.table.rows.length > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
                  <span>Columns from backend: {document.table.columns.join(', ')}</span>
                  <span>{document.table.rows.length} rows · page {document.table.page}</span>
                </div>
                <div className="rounded bg-surface-container-lowest border border-outline-variant/20 overflow-x-auto">
                  <table className="w-full text-left font-sans text-xs">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-medium">Item</th>
                        <th className="py-2.5 px-4 font-medium">Description</th>
                        <th className="py-2.5 px-4 font-medium text-right">Quantity</th>
                        <th className="py-2.5 px-4 font-medium text-right">Unit Price</th>
                        <th className="py-2.5 px-4 font-medium text-right">Line Total</th>
                        <th className="py-2.5 px-4 font-medium text-center">Arithmetic</th>
                        <th className="py-2.5 px-4 font-medium text-center">BBox</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-mono text-[11px]">
                      {document.table.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-surface-container-low/60">
                          <td className="py-3 px-4">{r.item?.value || '—'}</td>
                          <td className="py-3 px-4 text-on-surface">{r.description?.value || '—'}</td>
                          <td className="py-3 px-4 text-right">{r.quantity?.value || '—'}</td>
                          <td className="py-3 px-4 text-right">{r.unit_price?.value || '—'}</td>
                          <td className="py-3 px-4 text-right font-semibold text-on-surface">
                            {r.line_total?.value || '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${r.arithmetic_valid ? statusClass('VALID') : statusClass('REVIEW_REQUIRED')}`}>
                              {r.arithmetic_valid ? 'PASS' : 'FAIL'}
                            </span>
                            {r.arithmetic_note && (
                              <div className="text-[9px] text-tertiary mt-0.5">{r.arithmetic_note}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-[9px] text-on-surface-variant">
                            {hasBox(r.line_total?.bbox) ? `[${r.line_total!.bbox.join(',')}]` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-on-surface-variant font-mono text-xs">
                Backend returned no line-item table for this document.
              </div>
            )}
          </div>
        )}

        {/* VALIDATION */}
        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>
                Backend validation: {document.validation.rules_passed} of {document.validation.rules_checked} passed ·{' '}
                {document.validation.rules_failed} need attention
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] border ${statusClass(document.validation.overall_status)}`}>
                {document.validation.overall_status}
              </span>
            </div>
            <div className="space-y-3">
              {document.validation.rules.map((rule) => (
                <div key={rule.rule_id} className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          rule.state === 'PASS' ? 'text-secondary' : rule.state === 'REVIEW' ? 'text-tertiary' : 'text-error'
                        }`}
                      >
                        {rule.state === 'PASS' ? 'check_circle' : rule.state === 'REVIEW' ? 'warning' : 'cancel'}
                      </span>
                      <span className="font-semibold text-xs text-on-surface font-mono">{rule.rule_name}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${statusClass(rule.state === 'PASS' ? 'VALID' : 'REVIEW_REQUIRED')}`}>
                      {rule.state}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant font-sans">{rule.message}</p>
                  <div className="p-2.5 rounded bg-surface-container-low font-mono text-[11px] text-on-surface">
                    Reliability: {rule.reliability.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECONCILIATION */}
        {activeTab === 'reconciliation' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-on-surface-variant">
                Cross-document comparison reported by the backend
              </span>
              <button
                onClick={() => navigate('/reconciliation')}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Reconciliation Cockpit</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>

            {reconciliation?.has_reconciliation ? (
              <div className="rounded bg-surface-container-lowest border border-outline-variant/20 p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20 font-mono text-xs">
                  <span className="text-on-surface font-bold">Backend reconciliation result</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${statusClass(reconciliation.overall_status ?? '')}`}>
                    {reconciliation.overall_status}
                  </span>
                </div>
                {reconciliation.requires_review && (
                  <div className="p-3 rounded bg-error-container/20 border border-error/40 text-error text-xs font-mono flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">warning</span>
                    MISMATCH DETECTED — REVIEW REQUIRED
                  </div>
                )}
                <div className="space-y-2 font-mono text-xs">
                  {reconciliation.entries.map((e, i) => (
                    <div key={i} className="p-2.5 rounded bg-surface-container-low flex items-center justify-between gap-3">
                      <span className="text-on-surface font-medium">{e.field}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-on-surface-variant">{e.doc_a_value || '—'}</span>
                        <span className="text-outline-variant">↔</span>
                        <span className="text-on-surface-variant">{e.doc_b_value || '—'}</span>
                        {e.difference && <span className="text-tertiary">Δ {e.difference}</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusClass(e.status === 'MATCH' ? 'VALID' : 'REVIEW_REQUIRED')}`}>
                          {e.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-on-surface-variant font-mono text-xs">
                {reconciliation?.reason ??
                  'No reconciliation record. Upload a second document with the same case ID.'}
              </div>
            )}
          </div>
        )}

        {/* TRACE */}
        {activeTab === 'trace' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono text-on-surface-variant">
              <span>Agent execution pipeline stages (backend trace)</span>
              <span>{trace ? `${trace.stage_count} events` : 'no trace'}</span>
            </div>
            <div className="space-y-2 font-mono text-xs">
              {trace && trace.stages.length > 0 ? (
                trace.stages.map((st, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded bg-surface-container-lowest border border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-outline-variant font-mono w-6">{String(i + 1).padStart(2, '0')}</span>
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          st.status === 'REJECTED' || st.status === 'ERROR' || st.status === 'SCHEMA_INVALID' || st.status === 'POLICY_DENIED'
                            ? 'text-error'
                            : 'text-secondary'
                        }`}
                      >
                        {st.status === 'REJECTED' || st.status === 'ERROR' ? 'cancel' : 'check_circle'}
                      </span>
                      <div>
                        <span className="font-semibold text-on-surface block">{st.stage}</span>
                        <span className="text-[10px] text-on-surface-variant font-sans">
                          {st.component}
                          {st.details ? ` · ${JSON.stringify(st.details)}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-[10px]">
                      <span className="text-on-surface-variant">
                        {st.timestamp ? new Date(st.timestamp).toLocaleTimeString() : '—'}
                      </span>
                      <span className={`px-2 py-0.5 rounded border ${statusClass(st.status === 'completed' || st.status === 'ALLOWED' ? 'VALID' : 'REVIEW_REQUIRED')}`}>
                        {st.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-on-surface-variant">No trace recorded.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
