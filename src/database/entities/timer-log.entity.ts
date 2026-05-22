import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimerLogSource } from '../../timers/timer-log-source.enum';
import { TimerState } from '../../timers/timer-state.enum';
import { UserEntity } from './user.entity';
import { TimerDayEntity } from './timer-day.entity';

@Entity({ name: 'timer_logs' })
@Index('IDX_timer_logs_user_date', ['userId', 'date'])
export class TimerLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'timer_id' })
  timerId: string;

  @ManyToOne(() => TimerDayEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timer_id' })
  timer: TimerDayEntity;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.timerLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'enum', enum: TimerState, name: 'from_state', nullable: true })
  fromState: TimerState | null;

  @Column({ type: 'enum', enum: TimerState, name: 'to_state' })
  toState: TimerState;

  @Column({ type: 'enum', enum: TimerLogSource })
  source: TimerLogSource;

  @Column({ name: 'delta_seconds', default: 0 })
  deltaSeconds: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
