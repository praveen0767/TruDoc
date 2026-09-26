import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { processDocument } from '../lib/api/documents';
import { ApiError } from '../lib/api/client';
import { DocumentType } from '../lib/api/types';
import { ErrorMessage } from '../components/common/ErrorMessage';

type Phase = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export function DocumentIntakePage() {
  const navigate = useNavigate();

  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState<DocumentType>('purchase_order');
  const [caseId, setCaseId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError('Please select or drop at least one document to ingest.');
      setPhase('error');
      return;
    }

    setSubmitting(true);
    setError(null);
    setPhase('uploading');

    try {
      // The backend processes one file per request. Send them in order and keep
      // the LAST returned DocumentResult — its document_id is what we navigate to.
      let lastId = '';
      for (let i = 0; i < files.length; i++) {
        setPhase(i === 0 ? 'uploading' : 'processing');
        setProgress(
          files.length > 1
            ? `Processing ${i + 1} of ${files.length}: ${files[i].name}`
            : `Processing ${files[i].name}`
        );
        const doc = await processDocument({
          file: files[i],
          documentType,
          caseId: caseId.trim() || undefined,
        });
        lastId = doc.provenance.document_id;
      }
      setPhase('success');
      setProgress('Backend returned a verified DocumentResult.');
      // Navigate to the document the backend actually created.
      navigate(`/documents/${lastId}`);
    } catch (err: unknown) {
      setPhase('error');
      if (err instanceof ApiError && err.isNetworkError) {
        setError(
          `Document intelligence service unreachable at the API base URL. ${err.message}`
        );
      } else {
        setError(err instanceof Error ? err.message : 'Document intake failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-xl font-bold font-mono text-on-surface">
          Document Intake &amp; Stream Ingestion
        </h1>
        <p className="text-xs text-on-surface-variant font-mono">
          Upload documents for real backend OCR, deterministic field extraction, and
          cross-document reconciliation. Every value shown after processing comes from the
          Python engine.
        </p>
      </div>

      {error && (
        <ErrorMessage
          title="Document Ingestion Failed"
          message={error}
          onRetry={() => {
            setError(null);
            setPhase('idle');
          }}
        />
      )}

      {submitting && (
        <div className="p-3 rounded bg-surface-container-lowest border border-primary/30 font-mono text-xs flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          <span>
            {phase === 'uploading' ? 'Uploading to backend' : 'Backend running OCR + extraction'} — {progress}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 font-sans">
        {/* Upload Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center transition-all ${
            dragOver
              ? 'border-primary bg-primary/10'
              : 'border-outline-variant/40 bg-surface-container-low hover:border-outline-variant/60'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-surface-container-high border border-outline-variant/40 flex items-center justify-center text-primary mb-3">
            <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
          </div>

          <div className="space-y-1">
            <span className="text-sm font-semibold text-on-surface block">
              Drag &amp; drop document files here, or browse
            </span>
            <span className="text-xs text-on-surface-variant font-mono block">
              Supports PDF, TIFF, PNG (Single or Multi-Page Batch)
            </span>
          </div>

          <label className="mt-4 px-4 py-2 bg-surface-container-high hover:bg-surface-bright text-primary border border-primary/30 rounded text-xs font-mono font-medium cursor-pointer transition-colors shadow-xs">
            <span>Browse Files</span>
            <input
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.tiff"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="p-4 rounded bg-surface-container-lowest border border-outline-variant/20 space-y-2 font-mono text-xs">
            <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">
              Staged Files ({files.length}):
            </span>
            <div className="space-y-1.5">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded bg-surface-container-low"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      description
                    </span>
                    <span className="text-on-surface font-semibold truncate">{f.name}</span>
                    <span className="text-on-surface-variant text-[10px]">
                      ({(f.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                    className="text-on-surface-variant hover:text-error"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 font-mono text-xs">
            <label className="text-on-surface-variant block uppercase text-[10px]">
              Document Type:
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded p-2.5 text-on-surface focus:outline-hidden focus:border-primary text-xs"
            >
              <option value="purchase_order">PURCHASE ORDER (PO)</option>
              <option value="invoice">INVOICE (INV)</option>
              <option value="unknown">UNKNOWN (backend decides)</option>
            </select>
          </div>

          <div className="space-y-1.5 font-mono text-xs">
            <label className="text-on-surface-variant block uppercase text-[10px]">
              Associate with Case ID:
            </label>
            <input
              type="text"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="leave blank for auto-generated case"
              className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded p-2.5 text-on-surface focus:outline-hidden focus:border-primary text-xs"
            />
            <span className="text-[10px] text-on-surface-variant">
              Documents sharing a case ID are reconciled against each other by the backend.
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={() => navigate('/documents')}
            className="px-4 py-2 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-mono transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || files.length === 0}
            className="flex items-center gap-2 px-5 py-2 rounded bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container text-xs font-mono font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>{submitting ? 'Ingesting & Running OCR...' : 'Process Document Stream'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
