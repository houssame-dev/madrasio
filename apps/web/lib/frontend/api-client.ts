export interface ApiErrorPayload {
  code: string;
  featureCode?: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly featureCode?: string;
  readonly details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload.code;
    this.featureCode = payload.featureCode;
    this.details = payload.details;
  }
}

interface ErrorEnvelope {
  error?: Partial<ApiErrorPayload>;
}

const SAFE_FALLBACK = 'The request could not be completed. Please try again.';

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(path: `/api/v1/${string}`, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  const payload = await readJson(response);

  if (!response.ok) {
    const envelope = payload as ErrorEnvelope | undefined;
    const error = envelope?.error;
    throw new ApiClientError(response.status, {
      code: typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED',
      featureCode: typeof error?.featureCode === 'string' ? error.featureCode : undefined,
      message: typeof error?.message === 'string' && response.status < 500 ? error.message : SAFE_FALLBACK,
      details: error?.details,
    });
  }

  if (payload === undefined) {
    throw new ApiClientError(response.status, { code: 'INVALID_RESPONSE', message: SAFE_FALLBACK });
  }
  return payload as T;
}
