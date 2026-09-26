import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../lib/api/documents';
import { DocumentSummary } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Skeleton } from '../components/common/Skeleton';

export function DocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const fetchDocs = async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Document directory service unavailable.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const filtered = documents.filter((doc) => {
    const matchesSearch =
      doc.filename.toLowerCase().includes(search.toLowerCase()) ||
      doc.case_id.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'ALL' || doc.document_type.toUpperCase() === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="p-6 space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold font-mono text-on-surface">Document Directory</h1>
          <p className="text-xs text-on-surface-variant font-mono">
            Repository of ingested purchase orders, invoices, and customs documents.
          </p>
        </div>

        <button
          onClick={() => navigate('/documents/new')}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-bold rounded transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>+ Ingest Document</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file name, case ID, or document reference..."
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded pl-8 pr-4 py-1.5 text-xs font-mono text-on-surface placeholder:text-outline-variant focus:outline-hidden focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'PURCHASE_ORDER', 'TAX_INVOICE'].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded text-[11px] font-mono transition-colors cursor-pointer border ${
                typeFilter === type
                  ? 'bg-primary/10 border-primary text-primary font-bold'
                  : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <ErrorMessage
          title="Document Store Offline"
          message={error}
          onRetry={fetchDocs}
        />
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {/* Documents Table */}
      {!loading && !error && (
        <div className="rounded bg-surface-container-lowest border border-outline-variant/20 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant text-[10px] font-mono uppercase tracking-wider">
                  <th className="py-2.5 px-4 font-medium">Document Name</th>
                  <th className="py-2.5 px-4 font-medium">Case Reference</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium text-center">Reliability</th>
                  <th className="py-2.5 px-4 font-medium text-center">Quality</th>
                  <th className="py-2.5 px-4 font-medium text-center">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 font-mono text-[11px]">
                {filtered.map((doc) => (
                  <tr
                    key={doc.document_id}
                    className="hover:bg-surface-container-low/60 transition-colors"
                  >
                    <td className="py-3 px-4 font-semibold text-on-surface">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-primary">
                          description
                        </span>
                        <span
                          onClick={() => navigate(`/documents/${doc.document_id}`)}
                          className="hover:underline cursor-pointer"
                        >
                          {doc.filename}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-on-surface-variant">
                      <span
                        onClick={() => navigate(`/cases/${doc.case_id}`)}
                        className="hover:text-primary cursor-pointer"
                      >
                        Case #{doc.case_id}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-on-surface-variant">
                      {doc.document_type}
                    </td>

                    <td className="py-3 px-4 text-center font-mono">
                      <span
                        className={
                          (doc.quality_score || 0) >= 0.9
                            ? 'text-secondary font-bold'
                            : 'text-tertiary font-bold'
                        }
                      >
                        {((doc.quality_score || 0) * 100).toFixed(0)}%
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          doc.quality_status !== 'GOOD'
                            ? 'bg-tertiary-container/20 text-tertiary border border-tertiary/30'
                            : 'bg-secondary/10 text-secondary'
                        }`}
                      >
                        {doc.quality_status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          doc.overall_status === 'VERIFIED'
                            ? 'bg-secondary/10 text-secondary border border-secondary/30'
                            : 'bg-error-container/30 text-error border border-error/40 font-bold'
                        }`}
                      >
                        {doc.overall_status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => navigate(`/documents/${doc.document_id}`)}
                        className="px-3 py-1 rounded bg-surface-container-high hover:bg-surface-bright text-primary text-[11px] font-mono transition-colors cursor-pointer border border-outline-variant/30"
                      >
                        Open Workspace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="p-8 text-center text-xs font-mono text-on-surface-variant">
              No documents matched search criteria.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
