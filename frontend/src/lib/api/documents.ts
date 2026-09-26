/**
 * Documents API Service
 *
 * Endpoints are the real FastAPI routes exposed by `backend/app/api.py`
 * (verified against /openapi.json). No /api/v1 prefix exists on the backend.
 */

import { apiClient } from './client';
import type { Document, DocumentSummary } from './types';

export async function getDocuments(): Promise<DocumentSummary[]> {
  return apiClient<DocumentSummary[]>('/api/documents');
}

export async function getDocument(id: string): Promise<Document> {
  return apiClient<Document>(`/api/documents/${encodeURIComponent(id)}`);
}

export interface ProcessDocumentParams {
  file: File;
  documentType?: string;
  caseId?: string;
}

/**
 * Real upload → real pipeline → real DocumentResult.
 * POST /api/documents/process (multipart/form-data)
 */
export async function processDocument(params: ProcessDocumentParams): Promise<Document> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('document_type', params.documentType ?? 'unknown');
  if (params.caseId) {
    formData.append('case_id', params.caseId);
  }
  return apiClient<Document>('/api/documents/process', {
    method: 'POST',
    body: formData,
  });
}

/** Backend revalidation after a human correction. */
export async function revalidateDocument(id: string): Promise<Document> {
  return apiClient<Document>(`/api/documents/${encodeURIComponent(id)}/revalidate`, {
    method: 'POST',
  });
}

/** URL of the original uploaded page image, for drawing the real bbox overlay. */
export function pageImageUrl(documentId: string, page: number): string {
  const base = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
    'http://localhost:8000'
  ).replace(/\/$/, '');
  return `${base}/api/documents/${encodeURIComponent(documentId)}/pages/${page}`;
}
