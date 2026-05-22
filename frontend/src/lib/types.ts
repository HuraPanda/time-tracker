export type TimerState = 'stop' | 'active' | 'idle' | 'lock' | 'shutdown';

export type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
  };
};

export type TimerSnapshot = {
  id: string;
  date: string;
  state: TimerState;
  trackedSeconds: number;
  manualAdjustmentSeconds: number;
  totalSeconds: number;
  activeStartedAt: string | null;
  lastActivityAt: string | null;
  lastHeartbeatAt: string | null;
  stateChangedAt: string;
};

export type TimerLog = {
  id: string;
  fromState: TimerState | null;
  toState: TimerState;
  source: 'manual' | 'activity' | 'system' | 'scheduler';
  deltaSeconds: number;
  reason: string | null;
  createdAt: string;
};
