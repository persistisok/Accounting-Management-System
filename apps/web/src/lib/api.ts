const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function token() {
  return localStorage.getItem('ledger_token');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && !path.includes('/auth/login')) {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_user');
    window.location.assign('/login');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message;
    throw new ApiError(message ?? `请求失败（${response.status}）`, response.status);
  }
  return response.json() as Promise<T>;
}

async function download(path: string) {
  const response = await fetch(`${API_URL}${path}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (response.status === 401) {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_user');
    window.location.assign('/login');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message;
    throw new ApiError(message ?? `下载失败（${response.status}）`, response.status);
  }
  return response.blob();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<T>(path, { method: 'POST', body });
  },
  uploadForm: <T>(path: string, file: File, fields: Record<string, string>) => {
    const body = new FormData();
    body.append('file', file);
    Object.entries(fields).forEach(([key, value]) => body.append(key, value));
    return request<T>(path, { method: 'POST', body });
  },
  download,
};

export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}
