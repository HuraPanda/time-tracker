import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class HeartbeatDto {
  @IsDateString()
  lastInputAt: string;

  @IsBoolean()
  isVisible: boolean;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
