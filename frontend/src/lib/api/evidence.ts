/**
 * Evidence API Service — real route: /api/documents/{id}/evidence
 */

import { apiClient } from './client';
import type { EvidenceResponse } from './types';

export async function getEvidenceForDocument(documentId: string): Promise<EvidenceResponse> {
  return apiClient<EvidenceResponse>(`/api/documents/${encodeURIComponent(documentId)}/evidence`);
}

export async function getAllEvidence(): Promise<any[]> {
  return apiClient<any[]>('/api/evidence');
}
