import { TimerDayEntity } from '../database/entities/timer-day.entity';
import { TimerState } from './timer-state.enum';
import { getLiveDurationInSeconds, transitionTimerState } from './timer-state.machine';

describe('timer state machine', () => {
  it('accumulates tracked time when active timer becomes idle', () => {
    const startedAt = new Date('2026-05-22T09:00:00.000Z');
    const now = new Date('2026-05-22T09:30:40.000Z');
    const timer = {
      trackedSeconds: 120,
      manualAdjustmentSeconds: 0,
      currentState: TimerState.ACTIVE,
      activeStartedAt: startedAt,
      stateChangedAt: startedAt,
    } as TimerDayEntity;

    const result = transitionTimerState(timer, TimerState.IDLE, now);

    expect(result.changed).toBe(true);
    expect(result.deltaSeconds).toBe(1840);
    expect(timer.trackedSeconds).toBe(1960);
    expect(timer.activeStartedAt).toBeNull();
    expect(timer.currentState).toBe(TimerState.IDLE);
  });

  it('includes active runtime and manual adjustment in live duration', () => {
    const timer = {
      trackedSeconds: 900,
      manualAdjustmentSeconds: 300,
      currentState: TimerState.ACTIVE,
      activeStartedAt: new Date('2026-05-22T09:00:00.000Z'),
    } as TimerDayEntity;

    const totalSeconds = getLiveDurationInSeconds(
      timer,
      new Date('2026-05-22T09:10:00.000Z'),
    );

    expect(totalSeconds).toBe(1800);
  });
});
