/**
 * Agent Runs / Trace API Service
 * Real routes: /api/runs, /api/runs/{run_id}, /api/documents/{id}/trace
 */

import { apiClient } from './client';
import type { AgentTrace, RunSummary } from './types';

export async function getRuns(): Promise<RunSummary[]> {
  return apiClient<RunSummary[]>('/api/runs');
}

export async function getRun(id: string): Promise<AgentTrace> {
  return apiClient<AgentTrace>(`/api/runs/${encodeURIComponent(id)}`);
}
