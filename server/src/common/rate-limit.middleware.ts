import { Injectable, NestMiddleware, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * 内存级滑动窗口限流：按 IP + 路径 统计
 * 生产环境建议替换为 Redis 分布式限流
 */
interface Bucket { count: number; resetAt: number; }

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000; // 1 分钟窗口
  private readonly maxGeneral = 120;   // 普通接口 120 次/分钟
  private readonly maxAuth = 10;       // 登录接口 10 次/分钟
  private readonly maxAgent = 30;      // 智能体接口 30 次/分钟

  use(req: Request, res: Response, next: NextFunction) {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const path = req.path || '';
    let limit = this.maxGeneral;
    if (path.includes('/auth/login')) limit = this.maxAuth;
    else if (path.includes('/agent/chat')) limit = this.maxAgent;

    const key = `${ip}:${path}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      throw new HttpException({ code: 429, message: `请求过于频繁，限制 ${limit} 次/分钟` }, 429);
    }
    // 定期清理过期桶（每 1000 次请求清一次）
    if (this.buckets.size > 10000) {
      for (const [k, v] of this.buckets) if (v.resetAt < now) this.buckets.delete(k);
    }
    next();
  }
}
