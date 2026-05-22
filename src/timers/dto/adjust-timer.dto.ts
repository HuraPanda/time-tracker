import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdjustTimerDto {
  @IsInt()
  @Min(-240)
  @Max(240)
  minutes: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
