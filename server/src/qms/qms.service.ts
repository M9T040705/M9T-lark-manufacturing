import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { genNo } from '../common/gen-no';
import { HandleDefectDto, InspectionDto } from './dto/qms.dto';

const TYPE_PREFIX: Record<string, string> = {
  incoming: 'IQC',
  process: 'IPQC',
  final: 'FQC',
};

@Injectable()
export class QmsService {
  constructor(private prisma: PrismaService) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  list(user: AuthUser, type = '', result = '') {
    return this.prisma.inspection.findMany({
      where: {
        ...this.t(user),
        ...(type ? { type } : {}),
        ...(result ? { result } : {}),
      },
      include: {
        defects: true,
        workOrder: { select: { woNo: true } },
        inspector: { select: { name: true } },
      },
      orderBy: { inspectTime: 'desc' },
    });
  }

  async create(user: AuthUser, dto: InspectionDto) {
    const tenantId = user.tenantId as string;
    const defects = dto.defects ?? [];
    const defectQty = dto.defectQty ?? defects.reduce((s, d) => s + d.qty, 0);
    const insp = await this.prisma.inspection.create({
      data: {
        tenantId,
        inspNo: genNo(TYPE_PREFIX[dto.type] || 'QC'),
        type: dto.type,
        workOrderId: dto.workOrderId || null,
        productId: dto.productId,
        productName: dto.productName,
        batchNo: dto.batchNo,
        qty: dto.qty,
        defectQty,
        result: dto.result,
        remark: dto.remark,
        inspectorId: user.userId,
        defects: {
          create: defects.map((d) => ({
            tenantId,
            category: d.category,
            qty: d.qty,
            handle: d.handle || 'rework',
            note: d.note,
          })),
        },
      },
      include: { defects: true },
    });
    return insp;
  }

  listDefects(user: AuthUser, closed = '') {
    return this.prisma.defect.findMany({
      where: {
        ...this.t(user),
        ...(closed === 'true' ? { closed: true } : closed === 'false' ? { closed: false } : {}),
      },
      include: { inspection: { select: { inspNo: true, type: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async handleDefect(user: AuthUser, id: string, dto: HandleDefectDto) {
    const defect = await this.prisma.defect.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!defect) throw new NotFoundException('不良记录不存在');
    return this.prisma.defect.update({
      where: { id },
      data: { handle: dto.handle, note: dto.note, closed: dto.closed ?? true },
    });
  }
}
