import { IsIn, IsOptional, IsString } from 'class-validator';
import { TimerState } from '../timer-state.enum';

export class TimerSystemEventDto {
  @IsIn([TimerState.LOCK, TimerState.SHUTDOWN])
  state: TimerState;

  @IsOptional()
  @IsString()
  reason?: string;
}
