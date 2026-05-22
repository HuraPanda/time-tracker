import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { TimerState } from '../../timers/timer-state.enum';
import { UserEntity } from './user.entity';

@Entity({ name: 'timers' })
@Unique('UQ_user_date', ['userId', 'date'])
@Index('IDX_timer_user_date', ['userId', 'date'])
export class TimerDayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.timerDays, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'date' })
  date: string;

  @Column({
    type: 'enum',
    enum: TimerState,
    name: 'current_state',
    default: TimerState.STOP,
  })
  currentState: TimerState;

  @Column({ name: 'tracked_seconds', default: 0 })
  trackedSeconds: number;

  @Column({ name: 'manual_adjustment_seconds', default: 0 })
  manualAdjustmentSeconds: number;

  @Column({ name: 'active_started_at', type: 'timestamptz', nullable: true })
  activeStartedAt: Date | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ name: 'state_changed_at', type: 'timestamptz' })
  stateChangedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
