import { TimerDayEntity } from '../database/entities/timer-day.entity';
import { TimerState } from './timer-state.enum';

const SECOND = 1000;

export type TransitionResult = {
  changed: boolean;
  deltaSeconds: number;
};

export function transitionTimerState(
  timer: TimerDayEntity,
  nextState: TimerState,
  now: Date,
): TransitionResult {
  const previousState = timer.currentState;

  if (previousState === nextState) {
    return {
      changed: false,
      deltaSeconds: 0,
    };
  }

  let deltaSeconds = 0;

  if (previousState === TimerState.ACTIVE && timer.activeStartedAt) {
    deltaSeconds = Math.max(
      0,
      Math.floor((now.getTime() - timer.activeStartedAt.getTime()) / SECOND),
    );
    timer.trackedSeconds += deltaSeconds;
    timer.activeStartedAt = null;
  }

  if (nextState === TimerState.ACTIVE) {
    timer.activeStartedAt = now;
  }

  timer.currentState = nextState;
  timer.stateChangedAt = now;

  return {
    changed: true,
    deltaSeconds,
  };
}

export function getLiveDurationInSeconds(timer: TimerDayEntity, now: Date): number {
  const activeSeconds =
    timer.currentState === TimerState.ACTIVE && timer.activeStartedAt
      ? Math.max(0, Math.floor((now.getTime() - timer.activeStartedAt.getTime()) / SECOND))
      : 0;

  return timer.trackedSeconds + timer.manualAdjustmentSeconds + activeSeconds;
}
