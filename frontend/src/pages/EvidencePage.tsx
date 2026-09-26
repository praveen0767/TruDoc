import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllEvidence } from '../lib/api/evidence';
import { EvidenceSource } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function EvidencePage() {
  const navigate = useNavigate();
  const [evidenceList, setEvidenceList] = useState<EvidenceSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllEvidence();
      setEvidenceList(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Evidence browser service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence();
  }, []);

  const filtered = evidenceList.filter(
    (e) =>
      e.rawOcrText.toLowerCase().includes(search.toLowerCase()) ||
      e.fieldKey.toLowerCase().includes(search.toLowerCase()) ||
      e.documentId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 pb-12 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div>
          <h1 className="text-xl font-bold font-mono text-on-surface">Evidence Browser</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-0.5">
            OCR token bounding boxes, cryptographic hashes, and provenance anchors.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search OCR snippets, tokens..."
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded pl-8 pr-3 py-1.5 text-xs font-mono text-on-surface placeholder:text-outline-variant focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {error && (
        <ErrorMessage
          title="Evidence Store Unavailable"
          message={error}
          onRetry={fetchEvidence}
        />
      )}

      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
          {filtered.map((ev) => (
            <div
              key={ev.id}
              className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 hover:border-primary/40 transition-all shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    find_in_page
                  </span>
                  <span className="font-bold text-on-surface">{ev.fieldKey}</span>
                </div>
                <span className="text-[10px] text-secondary font-bold">
                  {(ev.confidence * 100).toFixed(1)}% CONF
                </span>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] text-on-surface-variant uppercase block">
                  Raw OCR Snippet:
                </span>
                <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/20 text-on-surface text-[11px]">
                  {ev.rawOcrText}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 bg-surface-container-low rounded border border-outline-variant/15">
                  <span className="text-on-surface-variant block uppercase">Coordinates</span>
                  <span className="text-primary font-bold">
                    [x:{ev.boundingBox.x}, y:{ev.boundingBox.y}, w:{ev.boundingBox.w}, h:
                    {ev.boundingBox.h}]
                  </span>
                </div>
                <div className="p-2 bg-surface-container-low rounded border border-outline-variant/15">
                  <span className="text-on-surface-variant block uppercase">Document Context</span>
                  <span
                    onClick={() => navigate(`/documents/${ev.documentId}?tab=evidence`)}
                    className="text-primary hover:underline cursor-pointer truncate block"
                  >
                    {ev.documentId}
                  </span>
                </div>
              </div>

              {ev.sha256Hash && (
                <div className="text-[10px] text-on-surface-variant truncate">
                  <span className="font-bold text-outline">HASH: </span>
                  {ev.sha256Hash}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
