import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class TimerCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimerCacheService.name);
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.client = createClient({
        url: this.configService.getOrThrow<string>('REDIS_URL'),
      });

      this.client.on('error', (error) => {
        this.logger.warn(`Redis error: ${error.message}`);
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      this.logger.warn('Redis is unavailable, continuing without cache');
      this.client = null;
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client && this.isConnected) {
      await this.client.quit();
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlInSeconds = 60): Promise<void> {
    if (!this.client || !this.isConnected) {
      return;
    }

    await this.client.set(key, JSON.stringify(value), {
      EX: ttlInSeconds,
    });
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (!this.client || !this.isConnected || keys.length === 0) {
      return;
    }

    await this.client.del(keys);
  }
}
