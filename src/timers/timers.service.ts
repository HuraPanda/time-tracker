import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimerDayEntity } from '../database/entities/timer-day.entity';
import { TimerLogEntity } from '../database/entities/timer-log.entity';
import { TimerLogSource } from './timer-log-source.enum';
import { TimerState } from './timer-state.enum';
import { AdjustTimerDto } from './dto/adjust-timer.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { TimerSystemEventDto } from './dto/timer-system-event.dto';
import { TimerCacheService } from './timer-cache.service';
import { getLiveDurationInSeconds, transitionTimerState } from './timer-state.machine';

type TimerSnapshot = {
  id: string;
  date: string;
  state: TimerState;
  trackedSeconds: number;
  manualAdjustmentSeconds: number;
  totalSeconds: number;
  activeStartedAt: Date | null;
  lastActivityAt: Date | null;
  lastHeartbeatAt: Date | null;
  stateChangedAt: Date;
};

@Injectable()
export class TimersService {
  private readonly logger = new Logger(TimersService.name);

  constructor(
    @InjectRepository(TimerDayEntity)
    private readonly timersRepository: Repository<TimerDayEntity>,
    @InjectRepository(TimerLogEntity)
    private readonly timerLogsRepository: Repository<TimerLogEntity>,
    private readonly configService: ConfigService,
    private readonly cacheService: TimerCacheService,
  ) {}

  async getToday(userId: string) {
    const date = this.getTodayDate();
    const cacheKey = this.getTodayCacheKey(userId, date);
    const cached = await this.cacheService.getJson<TimerSnapshot>(cacheKey);

    if (cached) {
      return cached;
    }

    const timer = await this.ensureTimerDay(userId, date);
    const snapshot = this.buildSnapshot(timer, new Date());
    await this.cacheService.setJson(cacheKey, snapshot, 20);
    return snapshot;
  }

  async getLogs(userId: string, date = this.getTodayDate()) {
    const cacheKey = this.getLogsCacheKey(userId, date);
    const cached = await this.cacheService.getJson<TimerLogEntity[]>(cacheKey);

    if (cached) {
      return cached;
    }

    const logs = await this.timerLogsRepository.find({
      where: { userId, date },
      order: { createdAt: 'DESC' },
    });

    await this.cacheService.setJson(cacheKey, logs, 30);
    return logs;
  }

  async start(userId: string) {
    return this.applyStateChange(userId, TimerState.ACTIVE, TimerLogSource.MANUAL, 'Manual start');
  }

  async stop(userId: string) {
    return this.applyStateChange(userId, TimerState.STOP, TimerLogSource.MANUAL, 'Manual stop');
  }

  async adjust(userId: string, dto: AdjustTimerDto) {
    const date = this.getTodayDate();
    const timer = await this.ensureTimerDay(userId, date);
    const deltaSeconds = dto.minutes * 60;
    timer.manualAdjustmentSeconds += deltaSeconds;
    await this.timersRepository.save(timer);

    await this.timerLogsRepository.save(
      this.timerLogsRepository.create({
        timerId: timer.id,
        userId,
        date,
        fromState: timer.currentState,
        toState: timer.currentState,
        source: TimerLogSource.MANUAL,
        deltaSeconds,
        reason: dto.reason ?? `Manual adjustment ${dto.minutes} minutes`,
      }),
    );

    await this.invalidateCache(userId, date);
    return this.buildSnapshot(timer, new Date());
  }

  async heartbeat(userId: string, dto: HeartbeatDto) {
    const date = this.getTodayDate();
    const timer = await this.ensureTimerDay(userId, date);
    const now = new Date();
    const lastInputAt = new Date(dto.lastInputAt);
    const idleTimeoutMs =
      this.configService.getOrThrow<number>('IDLE_TIMEOUT_MINUTES') * 60 * 1000;

    timer.lastHeartbeatAt = now;
    timer.lastActivityAt = lastInputAt;

    let targetState: TimerState | null = null;
    const isRecoverableState =
      timer.currentState === TimerState.ACTIVE ||
      timer.currentState === TimerState.IDLE ||
      timer.currentState === TimerState.LOCK;

    if (!isRecoverableState) {
      await this.timersRepository.save(timer);
      await this.invalidateCache(userId, date);
      return this.buildSnapshot(timer, now);
    }

    if (!dto.isVisible) {
      targetState = TimerState.LOCK;
    } else if (now.getTime() - lastInputAt.getTime() >= idleTimeoutMs) {
      targetState = TimerState.IDLE;
    } else if (
      timer.currentState === TimerState.IDLE ||
      timer.currentState === TimerState.LOCK
    ) {
      targetState = TimerState.ACTIVE;
    }

    if (targetState) {
      await this.persistTransition(
        timer,
        targetState,
        TimerLogSource.ACTIVITY,
        dto.userAgent ? `Heartbeat from ${dto.userAgent}` : 'Activity heartbeat',
        now,
      );
    } else {
      await this.timersRepository.save(timer);
    }

    await this.invalidateCache(userId, date);
    return this.buildSnapshot(timer, now);
  }

  async registerSystemEvent(userId: string, dto: TimerSystemEventDto) {
    const targetState = dto.state;
    return this.applyStateChange(
      userId,
      targetState,
      TimerLogSource.SYSTEM,
      dto.reason ?? `System event: ${targetState}`,
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async closeStaleActiveTimers() {
    const staleThresholdSeconds = this.configService.getOrThrow<number>(
      'HEARTBEAT_TIMEOUT_SECONDS',
    );
    const staleBefore = new Date(Date.now() - staleThresholdSeconds * 1000);

    const staleTimers = await this.timersRepository
      .createQueryBuilder('timer')
      .where('timer.current_state IN (:...states)', {
        states: [TimerState.ACTIVE, TimerState.IDLE],
      })
      .andWhere('timer.last_heartbeat_at IS NOT NULL')
      .andWhere('timer.last_heartbeat_at < :staleBefore', { staleBefore })
      .getMany();

    if (staleTimers.length === 0) {
      return;
    }

    this.logger.log(`Found ${staleTimers.length} stale timers, moving them to lock`);

    for (const timer of staleTimers) {
      await this.persistTransition(
        timer,
        TimerState.LOCK,
        TimerLogSource.SCHEDULER,
        'Heartbeat timeout reached',
        new Date(),
      );
      await this.invalidateCache(timer.userId, timer.date);
    }
  }

  private async applyStateChange(
    userId: string,
    nextState: TimerState,
    source: TimerLogSource,
    reason: string,
  ) {
    const timer = await this.ensureTimerDay(userId, this.getTodayDate());
    await this.persistTransition(timer, nextState, source, reason, new Date());
    await this.invalidateCache(userId, timer.date);
    return this.buildSnapshot(timer, new Date());
  }

  private async persistTransition(
    timer: TimerDayEntity,
    nextState: TimerState,
    source: TimerLogSource,
    reason: string,
    now: Date,
  ) {
    const previousState = timer.currentState;
    const { changed, deltaSeconds } = transitionTimerState(timer, nextState, now);

    await this.timersRepository.save(timer);

    if (!changed) {
      return;
    }

    await this.timerLogsRepository.save(
      this.timerLogsRepository.create({
        timerId: timer.id,
        userId: timer.userId,
        date: timer.date,
        fromState: previousState,
        toState: nextState,
        source,
        reason,
        deltaSeconds,
      }),
    );
  }

  private async ensureTimerDay(userId: string, date: string): Promise<TimerDayEntity> {
    const existing = await this.timersRepository.findOne({
      where: { userId, date },
    });

    if (existing) {
      return existing;
    }

    const now = new Date();

    const timer = this.timersRepository.create({
      userId,
      date,
      currentState: TimerState.STOP,
      trackedSeconds: 0,
      manualAdjustmentSeconds: 0,
      activeStartedAt: null,
      lastActivityAt: null,
      lastHeartbeatAt: null,
      stateChangedAt: now,
    });

    return this.timersRepository.save(timer);
  }

  private buildSnapshot(timer: TimerDayEntity, now: Date) {
    return {
      id: timer.id,
      date: timer.date,
      state: timer.currentState,
      trackedSeconds: timer.trackedSeconds,
      manualAdjustmentSeconds: timer.manualAdjustmentSeconds,
      totalSeconds: getLiveDurationInSeconds(timer, now),
      activeStartedAt: timer.activeStartedAt,
      lastActivityAt: timer.lastActivityAt,
      lastHeartbeatAt: timer.lastHeartbeatAt,
      stateChangedAt: timer.stateChangedAt,
    };
  }

  private getTodayDate() {
    const timezone = this.configService.getOrThrow<string>('APP_TIMEZONE');
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private getTodayCacheKey(userId: string, date: string) {
    return `timer:${userId}:${date}:today`;
  }

  private getLogsCacheKey(userId: string, date: string) {
    return `timer:${userId}:${date}:logs`;
  }

  private async invalidateCache(userId: string, date: string) {
    await this.cacheService.deleteMany([
      this.getTodayCacheKey(userId, date),
      this.getLogsCacheKey(userId, date),
    ]);
  }
}
