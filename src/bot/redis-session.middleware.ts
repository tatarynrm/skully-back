import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('RedisSession');

export function redisSession(redis: Redis, options?: { keyPrefix?: string; ttl?: number }) {
  const prefix = options?.keyPrefix ?? 'tg-session:';
  const ttl = options?.ttl ?? 86400; // 24 hours TTL by default

  return async (ctx: any, next: () => Promise<void>) => {
    const userId = ctx.from?.id;
    if (!userId) {
      return next();
    }

    const key = `${prefix}${userId}`;

    try {
      // 1. Fetch session from Redis
      const rawData = await redis.get(key);
      ctx.session = rawData ? JSON.parse(rawData) : {};
    } catch (err) {
      logger.error(`Failed to get session from Redis for user ${userId}: ${err.message}`);
      ctx.session = {};
    }

    await next();

    try {
      // 2. Persist session back to Redis
      if (!ctx.session || Object.keys(ctx.session).length === 0) {
        await redis.del(key);
      } else {
        await redis.set(key, JSON.stringify(ctx.session), 'EX', ttl);
      }
    } catch (err) {
      logger.error(`Failed to save session to Redis for user ${userId}: ${err.message}`);
    }
  };
}
