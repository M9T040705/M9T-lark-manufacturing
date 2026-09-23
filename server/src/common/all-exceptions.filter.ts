import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器：统一错误响应格式，记录错误堆栈和请求上下文
 * 响应格式：{ code, message, path, timestamp, reqId }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const reqId = (request as any).reqId || '-';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as any;
        message = r.message || exception.message;
        code = r.code || r.error || 'HTTP_ERROR';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      // Prisma 等已知错误分类
      if ((exception as any).code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = '数据已存在，请勿重复创建';
      } else if ((exception as any).code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = '记录不存在';
      }
    }

    // 5xx 记录完整堆栈，4xx 只记录摘要
    if (status >= 500) {
      this.logger.error(`[${reqId}] ${request.method} ${request.url} ${status} ${message}`, exception instanceof Error ? exception.stack : '');
    } else {
      this.logger.warn(`[${reqId}] ${request.method} ${request.url} ${status} ${message}`);
    }

    response.status(status).json({
      code,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      reqId,
    });
  }
}
