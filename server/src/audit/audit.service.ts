import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(tenantId: string | null, userId: string | null, action: string, entity: string, entityId?: string, detail?: string) {
    try {
      await this.prisma.operationLog.create({
        data: { tenantId, userId, action, entity, entityId, detail },
      });
    } catch (e) {
      // 审计日志失败不阻断主流程
    }
  }

  async list(tenantId: string, query: { page?: number; pageSize?: number; userId?: string; entity?: string; action?: string }) {
    const page = Number(query.page) || 1;
    const pageSize = Math.min(Number(query.pageSize) || 20, 100);
    const where: any = { tenantId };
    if (query.userId) where.userId = query.userId;
    if (query.entity) where.entity = query.entity;
    if (query.action) where.action = query.action;
    const [total, items] = await Promise.all([
      this.prisma.operationLog.count({ where }),
      this.prisma.operationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, username: true } } },
      }),
    ]);
    return { total, page, pageSize, items };
  }
}
