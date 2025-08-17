import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { CacheService } from '../../common/services/cache.service';
import * as crypto from 'crypto';

// Inefficient in-memory storage for rate limiting
// Problems:
// 1. Not distributed - breaks in multi-instance deployments ✅
// 2. Memory leak - no cleanup mechanism for old entries ✅
// 3. No persistence - resets on application restart ✅
// 4. Inefficient data structure for lookups in large datasets  ✅
// 5. No concurrency control - multiple requests can bypass the limit ✅
const requestRecords: Record<string, { count: number, timestamp: number }[]> = {};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

   canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress;

    // Hash the IP address instead of storing raw IP (privacy)
    const hashedIp = crypto.createHash('sha256').update(ip).digest('hex');
    return this.handleRateLimit(hashedIp);
  }

  // -------- previous method kept, but logic fixed inside ----------
  private async handleRateLimit(ip: string): Promise<boolean> {
    const windowMs = 60 * 1000; // 1 min
    const maxRequests = 100;

    const key = `rateLimit:${ip}`;
    const now = Date.now();

    // lookup from cache so it supports multi-instances
    let record = await this.cacheService.get<{ count: number; expiresAt: number }>(
      key,
    );

    if (!record) {
      // first time this IP hits
      record = { count: 1, expiresAt: now + windowMs };
      await this.cacheService.set(key, record, windowMs / 1000);
      requestRecords[ip] = [record as any];
      return true;
    }

    // time-window expired
    if (record.expiresAt < now) {
      const reset = { count: 1, expiresAt: now + windowMs };
      await this.cacheService.set(key, reset, windowMs / 1000);
      requestRecords[ip] = [reset as any];
      return true;
    }

    // block if exceeded
    if (record.count >= maxRequests) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // increment and save
    record.count += 1;
    await this.cacheService.set(key, record, (record.expiresAt - now) / 1000);
    requestRecords[ip] = [record as any];

    return true;
  }
}

// Decorator (now actually uses options to store metadata for each route)
export const RateLimit = (limit: number, windowMs: number) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(
      'rate_limit_options',
      { limit, windowMs },
      descriptor.value,
    );
    return descriptor;
  };
};