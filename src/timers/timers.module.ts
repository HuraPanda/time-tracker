import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { TimerDayEntity } from '../database/entities/timer-day.entity';
import { TimerLogEntity } from '../database/entities/timer-log.entity';
import { TimersController } from './timers.controller';
import { TimerCacheService } from './timer-cache.service';
import { TimersService } from './timers.service';

@Module({
  imports: [TypeOrmModule.forFeature([TimerDayEntity, TimerLogEntity]), AuthModule],
  controllers: [TimersController],
  providers: [TimersService, TimerCacheService],
  exports: [TimersService],
})
export class TimersModule {}
