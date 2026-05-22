import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { UserEntity } from './database/entities/user.entity';
import { TimerDayEntity } from './database/entities/timer-day.entity';
import { TimerLogEntity } from './database/entities/timer-log.entity';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { TimersModule } from './timers/timers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DATABASE_HOST'),
        port: configService.getOrThrow<number>('DATABASE_PORT'),
        username: configService.getOrThrow<string>('DATABASE_USER'),
        password: configService.getOrThrow<string>('DATABASE_PASSWORD'),
        database: configService.getOrThrow<string>('DATABASE_NAME'),
        entities: [UserEntity, TimerDayEntity, TimerLogEntity],
        synchronize: true,
      }),
    }),
    UsersModule,
    AuthModule,
    TimersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
