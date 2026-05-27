type ApiBody = BodyInit | Record<string, unknown> | unknown[] | null;

type ApiRequestOptions = Omit<RequestInit, 'body' | 'credentials'> & {
  body?: ApiBody;
  retryOnCsrf?: boolean;
};

type ApiErrorBody = {
  error?: string | { message?: string; code?: string };
  message?: string;
};

let currentCsrfToken: string | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, fallbackMessage: string) {
    super(errorMessage(body, fallbackMessage));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function setCsrfToken(token: string | null) {
  currentCsrfToken = token;
}

export function getCsrfToken() {
  return currentCsrfToken;
}

export async function apiRequest<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, retryOnCsrf = true, ...fetchOptions } = options;
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  const requestOptions: RequestInit = {
    ...fetchOptions,
    method,
    credentials: 'include',
    headers
  };

  if (body !== undefined && body !== null && !isBodyInit(body)) {
    headers.set('content-type', headers.get('content-type') ?? 'application/json');
    requestOptions.body = JSON.stringify(body);
  } else {
    requestOptions.body = body as BodyInit | null | undefined;
  }

  if (isMutatingMethod(method) && currentCsrfToken) {
    headers.set('x-csrf-token', currentCsrfToken);
  }

  const response = await fetch(path, requestOptions);
  const parsedBody = await parseResponseBody(response);

  if (!response.ok) {
    if (retryOnCsrf && response.status === 403 && isMutatingMethod(method) && isInvalidCsrf(parsedBody)) {
      const refreshed = await refreshCsrfToken();
      if (refreshed) return apiRequest<T>(path, { ...options, retryOnCsrf: false });
    }
    throw new ApiError(response.status, parsedBody, `Request failed with status ${response.status}`);
  }

  return parsedBody as T;
}

function isInvalidCsrf(body: unknown) {
  if (!body || typeof body !== 'object') return false;
  const error = (body as ApiErrorBody).error;
  if (typeof error === 'string') return error.toLowerCase().includes('csrf');
  return error?.message?.toLowerCase().includes('csrf') || error?.code === 'forbidden';
}

async function refreshCsrfToken() {
  const response = await fetch('/api/auth/me', { method: 'GET', credentials: 'include' });
  if (!response.ok) return false;
  const body = (await parseResponseBody(response)) as { csrfToken?: unknown } | null;
  if (typeof body?.csrfToken !== 'string') return false;
  setCsrfToken(body.csrfToken);
  return true;
}

function isMutatingMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function isBodyInit(body: ApiBody): body is BodyInit {
  return (
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  );
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

function errorMessage(body: unknown, fallbackMessage: string) {
  if (body && typeof body === 'object') {
    const apiBody = body as ApiErrorBody;
    if (typeof apiBody.error === 'string') return apiBody.error;
    if (apiBody.error?.message) return apiBody.error.message;
    if (apiBody.message) return apiBody.message;
  }
  return fallbackMessage;
}
