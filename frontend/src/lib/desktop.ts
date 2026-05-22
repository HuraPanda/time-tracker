export type DesktopPresencePayload = {
  idleSeconds: number;
  idleThresholdSeconds: number;
  isLocked: boolean;
  lastInputAt: string;
  source: 'electron';
};

export type DesktopSystemEventPayload = {
  state: 'lock' | 'shutdown';
  reason: string;
  occurredAt: string;
};

export type DesktopTrackerApi = {
  isAvailable: () => boolean;
  requestPresence: () => Promise<DesktopPresencePayload>;
  onPresence: (callback: (payload: DesktopPresencePayload) => void) => () => void;
  onSystemEvent: (callback: (payload: DesktopSystemEventPayload) => void) => () => void;
};

export function getDesktopTracker(): DesktopTrackerApi | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.desktopTracker ?? null;
}
