/**
 * Cases API Service — real routes: /api/cases, /api/cases/{case_id}
 * A case groups the documents that the backend reconciles against each other.
 */

import { apiClient } from './client';
import type { CaseDetail, CaseSummary } from './types';

export async function getCases(): Promise<CaseSummary[]> {
  return apiClient<CaseSummary[]>('/api/cases');
}

export async function getCase(id: string): Promise<CaseDetail> {
  return apiClient<CaseDetail>(`/api/cases/${encodeURIComponent(id)}`);
}
