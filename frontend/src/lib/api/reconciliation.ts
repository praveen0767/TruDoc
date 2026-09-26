/**
 * Reconciliation API Service
 * Real routes: /api/documents/{id}/reconciliation, /api/cases/{id}/reconcile
 */

import { apiClient } from './client';
import type { CaseDetail, ReconciliationResult } from './types';

export async function getReconciliation(documentId: string): Promise<ReconciliationResult> {
  return apiClient<ReconciliationResult>(
    `/api/documents/${encodeURIComponent(documentId)}/reconciliation`
  );
}

export async function getCaseReconciliation(caseId: string): Promise<CaseDetail> {
  return apiClient<CaseDetail>(`/api/cases/${encodeURIComponent(caseId)}`);
}

export async function reconcileCase(caseId: string): Promise<CaseDetail> {
  return apiClient<CaseDetail>(`/api/cases/${encodeURIComponent(caseId)}/reconcile`, {
    method: 'POST',
  });
}

export async function approveWithException(caseId: string, reason: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/api/cases/${encodeURIComponent(caseId)}/approve-exception`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function requestCreditNote(caseId: string, amount: number): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/api/cases/${encodeURIComponent(caseId)}/credit-note`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}
