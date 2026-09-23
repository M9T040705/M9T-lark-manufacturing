import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: { userId?: string; type: string; title: string; content?: string; link?: string }) {
    return this.prisma.notification.create({
      data: { tenantId, userId: data.userId || null, type: data.type, title: data.title, content: data.content || null, link: data.link || null },
    });
  }

  async list(tenantId: string, userId: string, query: { page?: number; pageSize?: number; unreadOnly?: boolean }) {
    const page = Number(query.page) || 1;
    const pageSize = Math.min(Number(query.pageSize) || 20, 100);
    const where: any = { tenantId, OR: [{ userId }, { userId: null }] };
    if (query.unreadOnly) where.read = false;
    const [total, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, items };
  }

  async unreadCount(tenantId: string, userId: string) {
    return this.prisma.notification.count({ where: { tenantId, OR: [{ userId }, { userId: null }], read: false } });
  }

  async markRead(tenantId: string, userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, tenantId, OR: [{ userId }, { userId: null }] }, data: { read: true, readAt: new Date() } });
  }

  async markAllRead(tenantId: string, userId: string) {
    return this.prisma.notification.updateMany({ where: { tenantId, OR: [{ userId }, { userId: null }], read: false }, data: { read: true, readAt: new Date() } });
  }
}
