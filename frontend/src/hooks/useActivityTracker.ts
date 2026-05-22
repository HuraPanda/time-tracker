import { useEffect, useEffectEvent, useRef } from 'react';
import { api } from '../lib/api';
import type { TimerSnapshot } from '../lib/types';

type UseActivityTrackerOptions = {
  enabled: boolean;
  token: string | null;
  onSnapshot: (snapshot: TimerSnapshot) => void;
};

const TRACKED_EVENTS: Array<keyof WindowEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
];

export function useActivityTracker({ enabled, token, onSnapshot }: UseActivityTrackerOptions) {
  const lastInputAtRef = useRef(new Date());
  const visibilityStateRef = useRef(document.visibilityState === 'visible');
  const emitSnapshot = useEffectEvent((snapshot: TimerSnapshot) => {
    onSnapshot(snapshot);
  });

  useEffect(() => {
    if (!token || !enabled) {
      return;
    }

    const markActive = () => {
      lastInputAtRef.current = new Date();
    };

    const sendHeartbeat = async (isVisible: boolean) => {
      if (!token) {
        return;
      }

      try {
        const snapshot = await api.heartbeat(token, {
          lastInputAt: lastInputAtRef.current.toISOString(),
          isVisible,
          userAgent: navigator.userAgent,
        });
        emitSnapshot(snapshot);
      } catch (error) {
        console.error('Heartbeat request failed', error);
      }
    };

    const onVisibilityChange = () => {
      visibilityStateRef.current = document.visibilityState === 'visible';

      void sendHeartbeat(visibilityStateRef.current);

      if (!visibilityStateRef.current) {
        void api.sendSystemEvent(token, {
          state: 'lock',
          reason: 'Document hidden, interpreted as lock in web mode',
        });
      }
    };

    const onUnload = () => {
      if (enabled) {
        void api.sendSystemEvent(token, {
          state: 'shutdown',
          reason: 'Browser window closed',
        });
      }
    };

    TRACKED_EVENTS.forEach((eventName) => window.addEventListener(eventName, markActive));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onUnload);
    window.addEventListener('beforeunload', onUnload);

    const interval = window.setInterval(() => {
      void sendHeartbeat(visibilityStateRef.current);
    }, 30000);

    void sendHeartbeat(visibilityStateRef.current);

    return () => {
      TRACKED_EVENTS.forEach((eventName) => window.removeEventListener(eventName, markActive));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onUnload);
      window.removeEventListener('beforeunload', onUnload);
      window.clearInterval(interval);
    };
  }, [emitSnapshot, enabled, token]);
}
