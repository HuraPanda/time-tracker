import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TimerDayEntity } from './timer-day.entity';
import { TimerLogEntity } from './timer-log.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @OneToMany(() => TimerDayEntity, (timerDay) => timerDay.user)
  timerDays: TimerDayEntity[];

  @OneToMany(() => TimerLogEntity, (timerLog) => timerLog.user)
  timerLogs: TimerLogEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
