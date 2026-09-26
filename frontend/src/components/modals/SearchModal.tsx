import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDocuments } from '../../lib/api/documents';
import { getCases } from '../../lib/api/cases';
import { getPolicies } from '../../lib/api/policies';
import { DocumentSummary, CaseSummary, PolicyEntry } from '../../lib/api/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [policies, setPolicies] = useState<PolicyEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      Promise.allSettled([getDocuments(), getCases(), getPolicies()]).then(([d, c, p]) => {
        if (d.status === 'fulfilled') setDocuments(d.value);
        if (c.status === 'fulfilled') setCases(c.value);
        if (p.status === 'fulfilled') setPolicies(p.value);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const filteredDocs = q
    ? documents.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          d.document_id.toLowerCase().includes(q) ||
          d.document_type.toLowerCase().includes(q)
      )
    : documents.slice(0, 3);

  const filteredCases = q
    ? cases.filter(
        (c) => c.case_id.toLowerCase().includes(q)
      )
    : cases.slice(0, 2);

  const filteredPolicies = q
    ? policies.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    : policies.slice(0, 2);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface-container-low border border-outline-variant/40 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input Bar */}
        <div className="p-3 border-b border-outline-variant/25 flex items-center gap-2.5 bg-surface-container-lowest">
          <span className="material-symbols-outlined text-[20px] text-primary">search</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type document name, case ID, field, or policy..."
            className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-outline-variant focus:outline-hidden font-mono"
          />
          <kbd className="text-[10px] font-mono text-on-surface-variant bg-surface-container-high px-1.5 py-0.5 rounded border border-outline-variant/30">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto p-3 space-y-4 font-sans text-xs">
          {/* Quick Links */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-outline-variant px-2 block mb-1">
              Documents
            </span>
            <div className="space-y-1">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.document_id}
                  onClick={() => {
                    navigate(`/documents/${doc.document_id}`);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      description
                    </span>
                    <span className="font-mono text-on-surface">{doc.filename}</span>
                    <span className="text-[10px] text-on-surface-variant font-mono">
                      ({doc.document_type})
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      doc.overall_status === 'VERIFIED'
                        ? 'text-secondary bg-secondary/10'
                        : 'text-error bg-error/10'
                    }`}
                  >
                    {doc.overall_status}
                  </span>
                </div>
              ))}
              {filteredDocs.length === 0 && (
                <div className="text-[11px] text-on-surface-variant px-2 py-1 font-mono">
                  No documents matched.
                </div>
              )}
            </div>
          </div>

          {/* Cases */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-outline-variant px-2 block mb-1">
              Cases
            </span>
            <div className="space-y-1">
              {filteredCases.map((c) => (
                <div
                  key={c.case_id}
                  onClick={() => {
                    navigate(`/cases/${c.case_id}`);
                    onClose();
                  }}
                  className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-tertiary">
                      folder_supervised
                    </span>
                    <span className="font-mono text-on-surface font-semibold">{c.case_id}</span>
                    <span className="text-[10px] text-on-surface-variant font-sans">
                      —
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-on-surface-variant">
                    —
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Policies */}
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-outline-variant px-2 block mb-1">
              Policies
            </span>
            <div className="space-y-1">
              {filteredPolicies.map((p) => (
                <div
                  key={p.code}
                  onClick={() => {
                    navigate('/policies');
                    onClose();
                  }}
                  className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">shield</span>
                    <span className="font-mono text-on-surface font-medium">{p.code}</span>
                    <span className="text-[10px] text-on-surface-variant truncate max-w-xs">
                      {p.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-secondary bg-secondary/10 px-1 rounded">
                    ACTIVE
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
