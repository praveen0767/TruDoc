/**
 * System Health API Service — real route: /api/system/health
 * Every status is a real backend probe. Nothing is hardcoded to CONNECTED.
 */

import { apiClient } from './client';
import type { SystemHealth } from './types';

export async function getSystemHealth(): Promise<SystemHealth> {
  return apiClient<SystemHealth>('/api/system/health');
}

export async function pingService(serviceKey: string): Promise<{ latencyMs: number }> {
  return apiClient<{ latencyMs: number }>(`/api/system/ping?service=${serviceKey}`);
}
