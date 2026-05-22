import { FormEvent, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { api } from './lib/api';
import { getDesktopTracker } from './lib/desktop';
import { formatDateTime, formatSeconds } from './lib/time';
import { useDesktopActivityTracker } from './hooks/useDesktopActivityTracker';
import { useActivityTracker } from './hooks/useActivityTracker';
import type { AuthResponse, TimerLog, TimerSnapshot } from './lib/types';

const TOKEN_STORAGE_KEY = 'time-tracker-token';
const USER_STORAGE_KEY = 'time-tracker-user';

type AuthMode = 'login' | 'register';

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [userEmail, setUserEmail] = useState<string | null>(() => localStorage.getItem(USER_STORAGE_KEY));
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('password');
  const [timer, setTimer] = useState<TimerSnapshot | null>(null);
  const [logs, setLogs] = useState<TimerLog[]>([]);
  const [minutes, setMinutes] = useState(15);
  const [adjustReason, setAdjustReason] = useState('Forgot to start timer');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const [timerLoadedAt, setTimerLoadedAt] = useState(Date.now());
  const isDesktopMode = Boolean(getDesktopTracker()?.isAvailable());
  const browserTrackerEnabled = timer?.state === 'active' || timer?.state === 'idle';
  const desktopTrackerEnabled =
    timer?.state === 'active' || timer?.state === 'idle' || timer?.state === 'lock';

  const handleTimerSnapshot = useEffectEvent((snapshot: TimerSnapshot) => {
    setTimer(snapshot);
    setTimerLoadedAt(Date.now());
    void loadLogs(token);
  });

  useActivityTracker({
    enabled: !isDesktopMode && browserTrackerEnabled,
    token,
    onSnapshot: handleTimerSnapshot,
  });

  useDesktopActivityTracker({
    enabled: isDesktopMode && desktopTrackerEnabled,
    token,
    onSnapshot: handleTimerSnapshot,
  });

  useEffect(() => {
    if (!token) {
      return;
    }

    void Promise.all([loadToday(token), loadLogs(token)]);
  }, [token]);

  useEffect(() => {
    const interval = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const liveTotal = useMemo(() => {
    if (!timer) {
      return '00:00:00';
    }

    const base = timer.totalSeconds;

    if (timer.state !== 'active') {
      return formatSeconds(base);
    }

    const extra = Math.max(0, Math.floor((tick - timerLoadedAt) / 1000));

    return formatSeconds(base + extra);
  }, [tick, timer, timerLoadedAt]);

  async function loadToday(activeToken: string) {
    const snapshot = await api.getToday(activeToken);
    setTimer(snapshot);
    setTimerLoadedAt(Date.now());
  }

  async function loadLogs(activeToken: string | null) {
    if (!activeToken) {
      return;
    }

    const items = await api.getLogs(activeToken);
    setLogs(items);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    try {
      const response: AuthResponse =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password);

      setToken(response.accessToken);
      setUserEmail(response.user.email);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      localStorage.setItem(USER_STORAGE_KEY, response.user.email);
      setInfo(`${mode === 'login' ? 'Login' : 'Registration'} successful`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unknown auth error');
    }
  }

  async function handleAction(action: 'start' | 'stop') {
    if (!token) {
      return;
    }

    setError(null);
    setInfo(null);

    try {
      const snapshot = action === 'start' ? await api.start(token) : await api.stop(token);
      setTimer(snapshot);
      setTimerLoadedAt(Date.now());
      await loadLogs(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Action failed');
    }
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    setError(null);
    setInfo(null);

    try {
      const snapshot = await api.adjust(token, minutes, adjustReason);
      setTimer(snapshot);
      setTimerLoadedAt(Date.now());
      setInfo('Manual adjustment saved');
      await loadLogs(token);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Adjustment failed');
    }
  }

  function handleLogout() {
    setToken(null);
    setUserEmail(null);
    setTimer(null);
    setLogs([]);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  }

  if (!token) {
    return (
      <main className="shell auth-shell">
        <section className="auth-card">
          <p className="eyebrow">Test task</p>
          <h1>Time tracker</h1>
          <p className="muted">
            React-клиент отправляет heartbeat на backend, а состояние таймера считает Nest.
          </p>

          <div className="auth-tabs">
            <button
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
              type="button"
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {error ? <p className="message error">{error}</p> : null}
          {info ? <p className="message success">{info}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="shell dashboard-shell">
      <section className="hero-card">
        <div className="hero-top">
          <div>
            <p className="eyebrow">Signed in as</p>
            <h1>{userEmail}</h1>
          </div>
          <button className="ghost" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>

        <div className="timer-grid">
          <article className="metric-card">
            <span className={`state-pill state-${timer?.state ?? 'stop'}`}>{timer?.state ?? 'stop'}</span>
            <h2>{liveTotal}</h2>
            <p className="muted">Текущая дневная сессия</p>
          </article>

          <article className="metric-card">
            <p className="metric-label">Последняя активность</p>
            <strong>{formatDateTime(timer?.lastActivityAt ?? null)}</strong>
            <p className="metric-label">Последний heartbeat</p>
            <strong>{formatDateTime(timer?.lastHeartbeatAt ?? null)}</strong>
          </article>

          <article className="metric-card notes-card">
            <p className="metric-label">Web-ограничение</p>
            <p className="muted">
              {isDesktopMode
                ? 'Electron-режим: idle time и system lock/shutdown приходят из ОС, поэтому трекинг работает и вне браузерной вкладки.'
                : 'Browser-режим: idle отслеживается по keyboard/mouse во вкладке. lock и shutdown интерпретируются best-effort через visibilitychange и page lifecycle events.'}
            </p>
          </article>
        </div>

        <div className="actions-row">
          <button className="primary" onClick={() => handleAction('start')} type="button">
            Start
          </button>
          <button className="secondary" onClick={() => handleAction('stop')} type="button">
            Stop
          </button>
        </div>

        {error ? <p className="message error">{error}</p> : null}
        {info ? <p className="message success">{info}</p> : null}
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <h3>Manual correction</h3>
          <form className="adjust-form" onSubmit={handleAdjust}>
            <label>
              Minutes
              <input
                type="number"
                min={-240}
                max={240}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </label>
            <label>
              Reason
              <input
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
              />
            </label>
            <button className="primary" type="submit">
              Save adjustment
            </button>
          </form>
        </article>

        <article className="panel-card">
          <div className="panel-header">
            <h3>State log</h3>
            <button className="ghost" onClick={() => token && void loadLogs(token)} type="button">
              Refresh
            </button>
          </div>

          <div className="logs-list">
            {logs.map((log) => (
              <div className="log-item" key={log.id}>
                <div className="log-top">
                  <strong>
                    {log.fromState ?? 'n/a'} → {log.toState}
                  </strong>
                  <span>{formatDateTime(log.createdAt)}</span>
                </div>
                <p>{log.reason ?? 'No reason'}</p>
                <small>
                  source: {log.source} | delta: {formatSeconds(Math.abs(log.deltaSeconds))}
                </small>
              </div>
            ))}

            {logs.length === 0 ? <p className="muted">No log entries yet</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
