import type { AuthResponse, TimerLog, TimerSnapshot, TimerState } from './types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  register(email: string, password: string) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  },
  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  },
  getToday(token: string) {
    return request<TimerSnapshot>('/timers/today', {}, token);
  },
  getLogs(token: string, date?: string) {
    const query = date ? `?date=${date}` : '';
    return request<TimerLog[]>(`/timers/logs${query}`, {}, token);
  },
  start(token: string) {
    return request<TimerSnapshot>('/timers/start', { method: 'POST' }, token);
  },
  stop(token: string) {
    return request<TimerSnapshot>('/timers/stop', { method: 'POST' }, token);
  },
  adjust(token: string, minutes: number, reason?: string) {
    return request<TimerSnapshot>(
      '/timers/adjust',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minutes, reason }),
      },
      token,
    );
  },
  heartbeat(
    token: string,
    payload: {
      lastInputAt: string;
      isVisible: boolean;
      userAgent?: string;
    },
  ) {
    return request<TimerSnapshot>(
      '/timers/heartbeat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      token,
    );
  },
  sendSystemEvent(
    token: string,
    payload: { state: Extract<TimerState, 'lock' | 'shutdown'>; reason?: string },
  ) {
    return fetch(`${API_URL}/timers/system-event`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  },
};
