import { useEffect, useEffectEvent } from 'react';
import { api } from '../lib/api';
import { getDesktopTracker } from '../lib/desktop';
import type { DesktopPresencePayload, DesktopSystemEventPayload } from '../lib/desktop';
import type { TimerSnapshot } from '../lib/types';

type UseDesktopActivityTrackerOptions = {
  enabled: boolean;
  token: string | null;
  onSnapshot: (snapshot: TimerSnapshot) => void;
};

export function useDesktopActivityTracker({
  enabled,
  token,
  onSnapshot,
}: UseDesktopActivityTrackerOptions) {
  const emitSnapshot = useEffectEvent((snapshot: TimerSnapshot) => {
    onSnapshot(snapshot);
  });

  const handlePresence = useEffectEvent(async (payload: DesktopPresencePayload) => {
    if (!enabled || !token) {
      return;
    }

    try {
      const snapshot = await api.heartbeat(token, {
        lastInputAt: payload.lastInputAt,
        isVisible: !payload.isLocked,
        userAgent: `electron-desktop/${payload.source}`,
      });
      emitSnapshot(snapshot);
    } catch (error) {
      console.error('Desktop heartbeat request failed', error);
    }
  });

  const handleSystemEvent = useEffectEvent(async (payload: DesktopSystemEventPayload) => {
    if (!enabled || !token) {
      return;
    }

    try {
      await api.sendSystemEvent(token, {
        state: payload.state,
        reason: payload.reason,
      });
    } catch (error) {
      console.error('Desktop system event request failed', error);
    }
  });

  useEffect(() => {
    const desktopTracker = getDesktopTracker();

    if (!desktopTracker || !desktopTracker.isAvailable() || !token) {
      return;
    }

    const unsubscribePresence = desktopTracker.onPresence((payload) => {
      void handlePresence(payload);
    });

    const unsubscribeSystemEvent = desktopTracker.onSystemEvent((payload) => {
      void handleSystemEvent(payload);
    });

    void desktopTracker.requestPresence().then((payload) => {
      void handlePresence(payload);
    });

    return () => {
      unsubscribePresence();
      unsubscribeSystemEvent();
    };
  }, [enabled, handlePresence, handleSystemEvent, token]);
}
