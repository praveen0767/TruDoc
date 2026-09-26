/**
 * Human Review / HITL API Service
 * Real routes: /api/reviews, /api/reviews/{review_id}, /api/reviews/{review_id}/correction
 *
 * A review case exists only because the backend flagged a field REVIEW_REQUIRED.
 * Correction goes through the real MCP tool `document.apply_correction`
 * (requester=human_reviewer) and the backend then revalidates + finalizes.
 */

import { apiClient } from './client';
import type { CorrectionPayload, CorrectionResult, ReviewCase } from './types';

export async function getReviews(): Promise<ReviewCase[]> {
  return apiClient<ReviewCase[]>('/api/reviews');
}

export async function getReview(reviewId: string): Promise<ReviewCase> {
  return apiClient<ReviewCase>(`/api/reviews/${reviewId}`);
}

/**
 * Submit a human correction. The response is the backend-revalidated Document;
 * the frontend must not set any status locally.
 */
export async function submitCorrection(
  reviewId: string,
  payload: CorrectionPayload
): Promise<CorrectionResult> {
  return apiClient<CorrectionResult>(`/api/reviews/${reviewId}/correction`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function submitReviewAction(
  reviewId: string,
  action: 'ACCEPT' | 'CORRECT' | 'REJECT',
  payload: any
): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/api/reviews/${reviewId}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, ...payload }),
  });
}
