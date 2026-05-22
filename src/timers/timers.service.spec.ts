import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TimerDayEntity } from '../database/entities/timer-day.entity';
import { TimerLogEntity } from '../database/entities/timer-log.entity';
import { AdjustTimerDto } from './dto/adjust-timer.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { TimerCacheService } from './timer-cache.service';
import { TimerLogSource } from './timer-log-source.enum';
import { TimerState } from './timer-state.enum';
import { TimersService } from './timers.service';

type MockRepository<T> = Partial<
  Record<keyof Repository<T>, jest.Mock | Repository<T>[keyof Repository<T>]>
>;

describe('TimersService', () => {
  const userId = 'user-1';
  const timerId = 'timer-1';
  const today = '2026-05-22';

  let timersRepository: MockRepository<TimerDayEntity>;
  let timerLogsRepository: MockRepository<TimerLogEntity>;
  let configService: Pick<ConfigService, 'getOrThrow'>;
  let cacheService: Pick<TimerCacheService, 'deleteMany' | 'getJson' | 'setJson'>;
  let service: TimersService;

  beforeEach(() => {
    timersRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      createQueryBuilder: jest.fn(),
    };

    timerLogsRepository = {
      find: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };

    configService = {
      getOrThrow: jest.fn((key: string) => {
        switch (key) {
          case 'IDLE_TIMEOUT_MINUTES':
            return 15;
          case 'HEARTBEAT_TIMEOUT_SECONDS':
            return 90;
          case 'APP_TIMEZONE':
            return 'Europe/Moscow';
          default:
            throw new Error(`Unexpected key ${key}`);
        }
      }),
    };

    cacheService = {
      deleteMany: jest.fn(),
      getJson: jest.fn(async () => null),
      setJson: jest.fn(async () => undefined),
    };

    service = new TimersService(
      timersRepository as Repository<TimerDayEntity>,
      timerLogsRepository as Repository<TimerLogEntity>,
      configService as ConfigService,
      cacheService as TimerCacheService,
    );

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves timer to idle after inactivity timeout and auto-resumes on new activity', async () => {
    const timer = buildTimer({
      id: timerId,
      userId,
      date: today,
      currentState: TimerState.ACTIVE,
      trackedSeconds: 0,
      manualAdjustmentSeconds: 0,
      activeStartedAt: new Date('2026-05-22T11:00:00.000Z'),
      stateChangedAt: new Date('2026-05-22T11:00:00.000Z'),
    });

    timersRepository.findOne = jest.fn(async () => timer);

    const result = await service.heartbeat(userId, {
      lastInputAt: '2026-05-22T11:44:00.000Z',
      isVisible: true,
      userAgent: 'jest',
    } as HeartbeatDto);

    expect(result.state).toBe(TimerState.IDLE);
    expect(timer.currentState).toBe(TimerState.IDLE);
    expect(timer.trackedSeconds).toBe(3600);
    expect(timerLogsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromState: TimerState.ACTIVE,
        toState: TimerState.IDLE,
        source: TimerLogSource.ACTIVITY,
      }),
    );

    const resumed = await service.heartbeat(userId, {
      lastInputAt: '2026-05-22T12:00:00.000Z',
      isVisible: true,
      userAgent: 'jest',
    } as HeartbeatDto);

    expect(resumed.state).toBe(TimerState.ACTIVE);
    expect(timer.currentState).toBe(TimerState.ACTIVE);
  });

  it('does not auto-start timer from stop on heartbeat', async () => {
    const timer = buildTimer({
      id: timerId,
      userId,
      date: today,
      currentState: TimerState.STOP,
      trackedSeconds: 0,
      manualAdjustmentSeconds: 0,
      activeStartedAt: null,
      stateChangedAt: new Date('2026-05-22T11:00:00.000Z'),
    });

    timersRepository.findOne = jest.fn(async () => timer);

    const result = await service.heartbeat(userId, {
      lastInputAt: '2026-05-22T11:59:00.000Z',
      isVisible: true,
      userAgent: 'jest',
    } as HeartbeatDto);

    expect(result.state).toBe(TimerState.STOP);
    expect(timer.currentState).toBe(TimerState.STOP);
    expect(timerLogsRepository.save).not.toHaveBeenCalled();
  });

  it('resumes timer from lock on fresh activity', async () => {
    const timer = buildTimer({
      id: timerId,
      userId,
      date: today,
      currentState: TimerState.LOCK,
      trackedSeconds: 600,
      manualAdjustmentSeconds: 0,
      activeStartedAt: null,
      stateChangedAt: new Date('2026-05-22T11:30:00.000Z'),
    });

    timersRepository.findOne = jest.fn(async () => timer);

    const result = await service.heartbeat(userId, {
      lastInputAt: '2026-05-22T11:59:50.000Z',
      isVisible: true,
      userAgent: 'jest',
    } as HeartbeatDto);

    expect(result.state).toBe(TimerState.ACTIVE);
    expect(timer.currentState).toBe(TimerState.ACTIVE);
  });

  it('adds manual adjustments and stores a log record', async () => {
    const timer = buildTimer({
      id: timerId,
      userId,
      date: today,
      currentState: TimerState.STOP,
      trackedSeconds: 1200,
      manualAdjustmentSeconds: 0,
      activeStartedAt: null,
      stateChangedAt: new Date('2026-05-22T08:00:00.000Z'),
    });

    timersRepository.findOne = jest.fn(async () => timer);

    const result = await service.adjust(userId, {
      minutes: 20,
      reason: 'Forgot to start timer',
    } as AdjustTimerDto);

    expect(result.totalSeconds).toBe(2400);
    expect(timer.manualAdjustmentSeconds).toBe(1200);
    expect(timerLogsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        deltaSeconds: 1200,
        source: TimerLogSource.MANUAL,
      }),
    );
    expect(cacheService.deleteMany).toHaveBeenCalled();
  });
});

function buildTimer(partial: Partial<TimerDayEntity>): TimerDayEntity {
  return {
    id: partial.id ?? 'timer-1',
    userId: partial.userId ?? 'user-1',
    user: partial.user as never,
    date: partial.date ?? '2026-05-22',
    currentState: partial.currentState ?? TimerState.STOP,
    trackedSeconds: partial.trackedSeconds ?? 0,
    manualAdjustmentSeconds: partial.manualAdjustmentSeconds ?? 0,
    activeStartedAt: partial.activeStartedAt ?? null,
    lastActivityAt: partial.lastActivityAt ?? null,
    lastHeartbeatAt: partial.lastHeartbeatAt ?? null,
    stateChangedAt: partial.stateChangedAt ?? new Date('2026-05-22T08:00:00.000Z'),
    createdAt: partial.createdAt ?? new Date('2026-05-22T08:00:00.000Z'),
    updatedAt: partial.updatedAt ?? new Date('2026-05-22T08:00:00.000Z'),
  };
}
