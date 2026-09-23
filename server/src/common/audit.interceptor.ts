import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../audit/audit.service';

/**
 * 全局审计拦截器：自动记录写操作（POST/PUT/PATCH/DELETE）
 * 记录：操作人、方法、路径、目标实体、请求体摘要、响应中的 ID
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method as string;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }
    const path = (req.path || req.url || '') as string;
    // 跳过登录、刷新、文件上传等不需要审计的接口
    if (path.includes('/auth/login') || path.includes('/auth/refresh') || path.includes('/feishu/event')) {
      return next.handle();
    }
    const user = req.user;
    const entity = this.extractEntity(path);
    const bodySummary = this.summarize(req.body);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const entityId = this.extractId(data) || this.extractIdFromPath(path);
          this.audit.log(
            user?.tenantId || null,
            user?.userId || null,
            `${method} ${path}`,
            entity,
            entityId,
            bodySummary,
          );
        },
        error: () => {
          // 失败的操作也记录
          this.audit.log(
            user?.tenantId || null,
            user?.userId || null,
            `${method} ${path} [FAILED]`,
            entity,
            undefined,
            bodySummary,
          );
        },
      }),
    );
  }

  private extractEntity(path: string): string {
    const m = path.match(/\/api\/([^/]+)/);
    return m ? m[1] : 'unknown';
  }

  private extractId(data: any): string | undefined {
    if (!data) return undefined;
    if (typeof data === 'string') return data.length < 64 ? data : undefined;
    if (data.id) return String(data.id);
    if (data.data?.id) return String(data.data.id);
    return undefined;
  }

  private extractIdFromPath(path: string): string | undefined {
    const m = path.match(/\/([a-z0-9]{20,})/i);
    return m ? m[1] : undefined;
  }

  private summarize(body: any): string {
    if (!body) return '';
    try {
      const s = JSON.stringify(body);
      // 脱敏：密码、密钥
      const cleaned = s.replace(/"(password|apiKey|secret|token)"\s*:\s*"[^"]*"/gi, '"$1":"***"');
      return cleaned.length > 500 ? cleaned.slice(0, 500) + '...' : cleaned;
    } catch {
      return '';
    }
  }
}
