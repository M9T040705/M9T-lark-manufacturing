import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DictService {
  constructor(private prisma: PrismaService) {}

  listTypes(tenantId: string) {
    return this.prisma.dictType.findMany({ where: { tenantId }, orderBy: { code: 'asc' }, include: { _count: { select: { items: true } } } });
  }

  createType(tenantId: string, dto: { code: string; name: string; remark?: string }) {
    return this.prisma.dictType.create({ data: { tenantId, code: dto.code, name: dto.name, remark: dto.remark || null } });
  }

  listItems(tenantId: string, typeCode: string) {
    return this.prisma.dictItem.findMany({
      where: { tenantId, type: { code: typeCode } },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createItem(tenantId: string, typeCode: string, dto: { label: string; value: string; sort?: number; color?: string }) {
    const type = await this.prisma.dictType.findFirst({ where: { tenantId, code: typeCode } });
    if (!type) throw new Error('字典类型不存在');
    return this.prisma.dictItem.create({
      data: { tenantId, typeId: type.id, label: dto.label, value: dto.value, sort: dto.sort || 0, color: dto.color || null },
    });
  }

  async updateItem(tenantId: string, id: string, dto: { label?: string; value?: string; sort?: number; color?: string; enabled?: boolean }) {
    return this.prisma.dictItem.updateMany({ where: { id, tenantId }, data: { ...dto } });
  }

  removeItem(tenantId: string, id: string) {
    return this.prisma.dictItem.deleteMany({ where: { id, tenantId } });
  }
}
