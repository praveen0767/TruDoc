/**
 * Centralized TruDoc API Client
 * Interfaces with Authoritative Python / FastAPI backend
 */

export class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(message: string, status: number, statusText: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }

  /**
   * True ONLY for connection/network/timeout failures.
   * A 404/422/500 is a real HTTP response from a reachable API and must never be
   * reported as "API unreachable".
   */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

// Configuration
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  'http://localhost:8000';

// Mock Mode Storage & State
const MOCK_STORAGE_KEY = 'trudoc_use_mocks';

export function isMockModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(MOCK_STORAGE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  // Check env variable
  const envVal =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCKS) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_USE_MOCKS);
  if (envVal !== undefined) {
    return envVal === 'true';
  }
  // Trust rule: mocks are OFF unless explicitly requested. The backend is authoritative.
  return false;
}

export function setMockMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MOCK_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('trudoc_mock_mode_changed', { detail: enabled }));
  }
}

/**
 * Universal JSON Fetch wrapper with strict error handling
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      if (typeof errorBody === 'object' && errorBody !== null && 'detail' in errorBody) {
        const detail = (errorBody as { detail: unknown }).detail;
        errorMessage = typeof detail === 'string' ? detail : JSON.stringify(detail);
      } else if (typeof errorBody === 'string' && errorBody.length > 0) {
        errorMessage = errorBody;
      }

      // NOTE: the API responded. It is reachable. Do not label this "unreachable".
      if (response.status === 404) {
        errorMessage = `Not found (404): ${endpoint} — ${errorMessage}`;
      } else if (response.status === 422) {
        errorMessage = `Validation failed (422): ${errorMessage}`;
      } else if (response.status === 500) {
        errorMessage = `Document processing service error (500): ${errorMessage}`;
      } else if (response.status === 503) {
        errorMessage = `Document processing service unavailable (503): ${errorMessage}`;
      }

      throw new ApiError(errorMessage, response.status, response.statusText, errorBody);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }
    // Genuine transport failure: DNS, refused connection, abort, timeout.
    const isAbort = error instanceof Error && error.name === 'AbortError';
    const msg = isAbort
      ? `Request to ${API_BASE_URL} timed out or was aborted.`
      : `Document intelligence service unreachable at ${API_BASE_URL} (network failure: ${
          error instanceof Error ? error.message : 'unknown transport error'
        })`;
    throw new ApiError(msg, 0, 'NETWORK_ERROR');
  }
}
