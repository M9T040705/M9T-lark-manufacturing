import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function lastMonths(n: number) {
  const now = new Date();
  const arr: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    arr.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return arr;
}

@Injectable()
export class BiService {
  constructor(private prisma: PrismaService) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  async overview(user: AuthUser) {
    const tenantId = user.tenantId as string;
    const [orders, wos, reports, inspections, inventories, customers, payments, lowStockProducts, pendingApprovals] =
      await Promise.all([
        this.prisma.salesOrder.findMany({ where: { tenantId }, select: { amount: true, status: true, createdAt: true } }),
        this.prisma.workOrder.findMany({
          where: { tenantId },
          select: { qty: true, finishedQty: true, badQty: true, status: true, planEnd: true },
        }),
        this.prisma.workReport.findMany({ where: { tenantId }, select: { goodQty: true, badQty: true, reportTime: true } }),
        this.prisma.inspection.findMany({ where: { tenantId }, select: { qty: true, defectQty: true, result: true } }),
        this.prisma.inventory.findMany({ where: { tenantId }, include: { product: { select: { price: true, safetyStock: true } } } }),
        this.prisma.customer.count({ where: { tenantId } }),
        this.prisma.payment.findMany({ where: { tenantId }, select: { amount: true, paidAmount: true, status: true } }),
        this.prisma.product.findMany({ where: { tenantId }, select: { id: true, safetyStock: true, _count: { select: { inventories: true } } } }),
        this.prisma.approval.count({ where: { tenantId, status: 'pending' } }),
      ]);

    const now = Date.now();
    const orderAmount = orders.reduce((s, o) => s + o.amount, 0);
    const producing = orders.filter((o) => ['生产中', 'pending'].includes(o.status)).length;
    const completedWo = wos.filter((w) => w.status === '已完工');
    const overdueWo = wos.filter((w) => w.status !== '已完工' && w.planEnd && new Date(w.planEnd).getTime() < now).length;
    const goodQty = reports.reduce((s, r) => s + r.goodQty, 0);
    const badQty = reports.reduce((s, r) => s + r.badQty, 0);
    const inspQty = inspections.reduce((s, i) => s + i.qty, 0);
    const inspDefect = inspections.reduce((s, i) => s + i.defectQty, 0);
    const stockValue = inventories.reduce((s, i) => s + i.qty * i.product.price, 0);
    // 按产品汇总库存，计算低库存数
    const stockByProduct = new Map<string, number>();
    for (const i of inventories) stockByProduct.set(i.productId, (stockByProduct.get(i.productId) || 0) + i.qty);
    const lowStock = lowStockProducts.filter((p) => {
      const q = stockByProduct.get(p.id) || 0;
      return p.safetyStock > 0 && q <= p.safetyStock;
    }).length;
    const receivable = payments.reduce((s, p) => s + p.amount, 0);
    const received = payments.reduce((s, p) => s + p.paidAmount, 0);
    const overduePay = payments.filter((p) => p.status === 'overdue').length;

    return {
      kpi: {
        customerCount: customers,
        orderCount: orders.length,
        orderAmount: +orderAmount.toFixed(2),
        producingOrders: producing,
        woCount: wos.length,
        woCompleted: completedWo.length,
        completionRate: wos.length ? +((completedWo.length / wos.length) * 100).toFixed(1) : 0,
        overdueWo,
        goodQty,
        badQty,
        yieldRate: goodQty + badQty > 0 ? +((goodQty / (goodQty + badQty)) * 100).toFixed(1) : 100,
        inspQty,
        inspDefect,
        inspPassRate: inspQty > 0 ? +(((inspQty - inspDefect) / inspQty) * 100).toFixed(1) : 100,
        stockValue: +stockValue.toFixed(2),
        lowStockCount: lowStock,
        receivable: +receivable.toFixed(2),
        received: +received.toFixed(2),
        uncollected: +(receivable - received).toFixed(2),
        overduePay,
        pendingApprovals,
      },
    };
  }

  // 销售看板：近6月订单趋势 + 客户订单 Top
  async sales(user: AuthUser) {
    const tenantId = user.tenantId as string;
    const months = lastMonths(6);
    const [orders, customerAgg] = await Promise.all([
      this.prisma.salesOrder.findMany({
        where: { tenantId },
        select: { amount: true, createdAt: true, customerId: true, customer: { select: { name: true } } },
      }),
      this.prisma.salesOrder.groupBy({
        by: ['customerId'],
        where: { tenantId },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const amountByMonth = months.map((m) => ({
      month: m,
      amount: orders.filter((o) => monthKey(new Date(o.createdAt)) === m).reduce((s, o) => s + o.amount, 0),
      count: orders.filter((o) => monthKey(new Date(o.createdAt)) === m).length,
    }));
    const nameMap = new Map(orders.map((o) => [o.customerId, o.customer.name]));
    const topCustomers = customerAgg
      .map((c) => ({ name: nameMap.get(c.customerId) || c.customerId, amount: c._sum.amount || 0, count: c._count._all }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
    return { months, amountByMonth, topCustomers };
  }

  // 生产看板：工单状态分布 + 近6月产量趋势 + 合格率
  async production(user: AuthUser) {
    const tenantId = user.tenantId as string;
    const months = lastMonths(6);
    const [wos, reports, inspections] = await Promise.all([
      this.prisma.workOrder.findMany({ where: { tenantId }, select: { status: true } }),
      this.prisma.workReport.findMany({ where: { tenantId }, select: { goodQty: true, badQty: true, reportTime: true } }),
      this.prisma.inspection.findMany({ where: { tenantId }, select: { type: true, qty: true, defectQty: true } }),
    ]);
    const statusDist = ['pending', '生产中', '已完工', '延期'].map((status) => ({
      status,
      count: wos.filter((w) => w.status === status).length,
    }));
    const outputByMonth = months.map((m) => ({
      month: m,
      good: reports.filter((r) => monthKey(new Date(r.reportTime)) === m).reduce((s, r) => s + r.goodQty, 0),
      bad: reports.filter((r) => monthKey(new Date(r.reportTime)) === m).reduce((s, r) => s + r.badQty, 0),
    }));
    const qualityByType = ['incoming', 'process', 'final'].map((type) => {
      const rows = inspections.filter((i) => i.type === type);
      const qty = rows.reduce((s, i) => s + i.qty, 0);
      const defect = rows.reduce((s, i) => s + i.defectQty, 0);
      return { type, passRate: qty > 0 ? +(((qty - defect) / qty) * 100).toFixed(1) : 100, qty };
    });
    return { months, statusDist, outputByMonth, qualityByType };
  }
}
