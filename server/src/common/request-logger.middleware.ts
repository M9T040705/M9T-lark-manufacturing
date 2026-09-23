import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * 请求日志中间件：记录每个请求的方法、路径、状态码、耗时、请求ID
 * 生产环境可替换为 pino / winston 写入文件或 ELK
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const reqId = randomUUID().slice(0, 8);
    (req as any).reqId = reqId;
    res.setHeader('X-Request-Id', reqId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const method = req.method;
      const url = req.originalUrl || req.url;
      const userId = (req as any).user?.userId || '-';
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
      this.logger[level](`[${reqId}] ${method} ${url} ${status} ${duration}ms user=${userId}`);
    });

    next();
  }
}
