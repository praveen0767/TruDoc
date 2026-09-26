/**
 * Policies API Service — real route: /api/policies
 * Entries are the backend's actual MCP tool registry rendered as policy rows.
 */

import { apiClient } from './client';
import type { PolicyEntry } from './types';

export async function getPolicies(): Promise<PolicyEntry[]> {
  return apiClient<PolicyEntry[]>('/api/policies');
}

export async function updatePolicyStatus(id: string, status: string): Promise<any> {
  return apiClient<any>(`/api/policies/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
