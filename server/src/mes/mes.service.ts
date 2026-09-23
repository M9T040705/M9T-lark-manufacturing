import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { genNo } from '../common/gen-no';
import { AssignDto, BomDto, ProductDto, ReportDto, WorkOrderDto } from './dto/mes.dto';
import { FeishuService } from '../feishu/feishu.service';

@Injectable()
export class MesService {
  constructor(
    private prisma: PrismaService,
    private feishu: FeishuService,
  ) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  // ---------- 产品/物料 ----------
  listProducts(user: AuthUser, type = '', keyword = '') {
    return this.prisma.product.findMany({
      where: {
        ...this.t(user),
        ...(type ? { type } : {}),
        ...(keyword ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createProduct(user: AuthUser, dto: ProductDto) {
    return this.prisma.product.create({ data: { ...dto, tenantId: user.tenantId as string } });
  }

  updateProduct(user: AuthUser, id: string, dto: Partial<ProductDto>) {
    return this.prisma.product.updateMany({ where: { id, tenantId: user.tenantId }, data: dto });
  }

  // ---------- BOM ----------
  listBoms(user: AuthUser) {
    return this.prisma.bom.findMany({
      where: this.t(user),
      include: { product: { select: { name: true, code: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  getBom(user: AuthUser, id: string) {
    return this.prisma.bom.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { items: { orderBy: { sequence: 'asc' } }, product: true },
    });
  }

  async createBom(user: AuthUser, dto: BomDto) {
    const { items, ...head } = dto;
    return this.prisma.bom.create({
      data: {
        ...head,
        tenantId: user.tenantId as string,
        items: {
          create: items.map((i) => ({ ...i, tenantId: user.tenantId as string })),
        },
      },
      include: { items: true },
    });
  }

  // ---------- 工单 ----------
  async listWorkOrders(user: AuthUser, status = '') {
    const wos = await this.prisma.workOrder.findMany({
      where: { ...this.t(user), ...(status ? { status } : {}) },
      include: {
        assignee: { select: { name: true } },
        order: { select: { orderNo: true, customer: { select: { name: true } } } },
        _count: { select: { reports: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    // 交期延期动态标记
    return wos.map((w) => ({
      ...w,
      overdue: w.status !== '已完工' && w.planEnd ? new Date(w.planEnd).getTime() < now : false,
    }));
  }

  // 订单转工单
  async createFromOrder(user: AuthUser, orderId: string, dto: Partial<WorkOrderDto>) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId: user.tenantId },
    });
    if (!order) throw new NotFoundException('销售订单不存在');
    const wo = await this.prisma.workOrder.create({
      data: {
        woNo: genNo('WO'),
        tenantId: user.tenantId as string,
        orderId: order.id,
        productId: order.productId ?? undefined,
        productName: order.productName,
        spec: order.spec,
        qty: order.qty,
        planStart: dto.planStart ? new Date(dto.planStart) : new Date(),
        planEnd: dto.planEnd ? new Date(dto.planEnd) : order.deliveryDate,
        team: dto.team,
        status: 'pending',
      },
    });
    await this.prisma.salesOrder.update({ where: { id: order.id }, data: { status: '生产中' } });
    return wo;
  }

  async createWorkOrder(user: AuthUser, dto: WorkOrderDto) {
    return this.prisma.workOrder.create({
      data: {
        ...dto,
        woNo: genNo('WO'),
        tenantId: user.tenantId as string,
        planStart: dto.planStart ? new Date(dto.planStart) : null,
        planEnd: dto.planEnd ? new Date(dto.planEnd) : null,
        status: 'pending',
      },
    });
  }

  // 派工
  async assign(user: AuthUser, id: string, dto: AssignDto) {
    await this.ensureWo(user, id);
    return this.prisma.workOrder.update({
      where: { id },
      data: { assigneeId: dto.assigneeId, team: dto.team, status: '生产中' },
    });
  }

  // 扫码报工：累加合格/不良数量，联动工单状态
  async report(user: AuthUser, id: string, dto: ReportDto) {
    const wo = await this.ensureWo(user, id);
    const report = await this.prisma.workReport.create({
      data: {
        tenantId: user.tenantId as string,
        workOrderId: id,
        userId: user.userId,
        process: dto.process,
        workHours: dto.workHours ?? 0,
        goodQty: dto.goodQty,
        badQty: dto.badQty ?? 0,
        machine: dto.machine,
        batchNo: dto.batchNo,
      },
    });
    const finishedQty = wo.finishedQty + dto.goodQty;
    const badQty = wo.badQty + (dto.badQty ?? 0);
    const done = finishedQty >= wo.qty;
    await this.prisma.workOrder.update({
      where: { id },
      data: {
        finishedQty,
        badQty,
        status: done ? '已完工' : '生产中',
      },
    });
    if (done && wo.orderId) {
      await this.prisma.salesOrder.updateMany({ where: { id: wo.orderId }, data: { status: '已完工' } });
    }
    // 未完工且已过计划完工日 → 交期延期预警（异步、带去重，不影响报工）
    if (!done && wo.planEnd && new Date(wo.planEnd).getTime() < Date.now()) {
      this.feishu
        .notifyOverdueWo(user.tenantId as string, {
          woNo: wo.woNo,
          productName: wo.productName,
          planEnd: wo.planEnd,
          finishedQty,
          qty: wo.qty,
        })
        .catch(() => undefined);
    }
    return report;
  }

  async listReports(user: AuthUser) {
    return this.prisma.workReport.findMany({
      where: this.t(user),
      include: { workOrder: { select: { woNo: true, productName: true } }, user: { select: { name: true } } },
      orderBy: { reportTime: 'desc' },
    });
  }

  private async ensureWo(user: AuthUser, id: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!wo) throw new NotFoundException('工单不存在');
    return wo;
  }
}
