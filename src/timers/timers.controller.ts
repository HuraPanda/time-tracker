import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import { AdjustTimerDto } from './dto/adjust-timer.dto';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { TimerSystemEventDto } from './dto/timer-system-event.dto';
import { TimersService } from './timers.service';

@UseGuards(JwtAuthGuard)
@Controller('timers')
export class TimersController {
  constructor(private readonly timersService: TimersService) {}

  @Get('today')
  getToday(@CurrentUser() user: JwtPayload) {
    return this.timersService.getToday(user.sub);
  }

  @Get('logs')
  getLogs(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    return this.timersService.getLogs(user.sub, date);
  }

  @Post('start')
  start(@CurrentUser() user: JwtPayload) {
    return this.timersService.start(user.sub);
  }

  @Post('stop')
  stop(@CurrentUser() user: JwtPayload) {
    return this.timersService.stop(user.sub);
  }

  @Post('adjust')
  adjust(@CurrentUser() user: JwtPayload, @Body() dto: AdjustTimerDto) {
    return this.timersService.adjust(user.sub, dto);
  }

  @Post('heartbeat')
  heartbeat(@CurrentUser() user: JwtPayload, @Body() dto: HeartbeatDto) {
    return this.timersService.heartbeat(user.sub, dto);
  }

  @Post('system-event')
  systemEvent(@CurrentUser() user: JwtPayload, @Body() dto: TimerSystemEventDto) {
    return this.timersService.registerSystemEvent(user.sub, dto);
  }
}
