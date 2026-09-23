import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/current-user.decorator';
import { toPage } from '../common/pagination';
import { genNo } from '../common/gen-no';
import { CustomerDto, OrderDto, PaymentDto, QuoteDto } from './dto/crm.dto';

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  private t(user: AuthUser) {
    return { tenantId: user.tenantId as string };
  }

  // ---------- 客户 ----------
  async listCustomers(user: AuthUser, keyword = '', page = 1, pageSize = 20) {
    const { skip, take, page: p, pageSize: ps } = toPage(page, pageSize);
    const where = {
      ...this.t(user),
      ...(keyword ? { OR: [{ name: { contains: keyword } }, { code: { contains: keyword } }] } : {}),
    };
    const [list, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.customer.count({ where }),
    ]);
    return { list, total, page: p, pageSize: ps };
  }

  createCustomer(user: AuthUser, dto: CustomerDto) {
    return this.prisma.customer.create({
      data: { ...dto, tenantId: user.tenantId as string },
    });
  }

  async updateCustomer(user: AuthUser, id: string, dto: Partial<CustomerDto>) {
    await this.ensureCustomer(user, id);
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  private async ensureCustomer(user: AuthUser, id: string) {
    const c = await this.prisma.customer.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!c) throw new NotFoundException('客户不存在');
    return c;
  }

  // ---------- 报价 ----------
  async listQuotes(user: AuthUser) {
    return this.prisma.quote.findMany({
      where: this.t(user),
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuote(user: AuthUser, dto: QuoteDto) {
    const amount = +(dto.qty * dto.unitPrice).toFixed(2);
    return this.prisma.quote.create({
      data: {
        ...dto,
        amount,
        status: 'sent',
        quoteNo: genNo('Q'),
        tenantId: user.tenantId as string,
        ownerId: user.userId,
      },
    });
  }

  // 报价转订单
  async quoteToOrder(user: AuthUser, id: string, deliveryDate?: string) {
    const q = await this.prisma.quote.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!q) throw new NotFoundException('报价单不存在');
    const order = await this.prisma.salesOrder.create({
      data: {
        orderNo: genNo('SO'),
        tenantId: user.tenantId as string,
        customerId: q.customerId,
        quoteId: q.id,
        productId: q.productId ?? undefined,
        productName: q.productName,
        spec: q.spec,
        qty: q.qty,
        unitPrice: q.unitPrice,
        amount: q.amount,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        status: 'pending',
      },
    });
    await this.prisma.quote.update({ where: { id: q.id }, data: { status: 'ordered' } });
    return order;
  }

  // ---------- 订单 ----------
  async listOrders(user: AuthUser, status = '', keyword = '') {
    return this.prisma.salesOrder.findMany({
      where: {
        ...this.t(user),
        ...(status ? { status } : {}),
        ...(keyword ? { OR: [{ orderNo: { contains: keyword } }, { productName: { contains: keyword } }] } : {}),
      },
      include: { customer: { select: { name: true } }, workOrders: { select: { id: true, woNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOrder(user: AuthUser, dto: OrderDto) {
    const amount = +(dto.qty * dto.unitPrice).toFixed(2);
    return this.prisma.salesOrder.create({
      data: {
        ...dto,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        amount,
        orderNo: genNo('SO'),
        tenantId: user.tenantId as string,
        status: 'pending',
      },
    });
  }

  async updateOrderStatus(user: AuthUser, id: string, status: string) {
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!order) throw new NotFoundException('订单不存在');
    return this.prisma.salesOrder.update({ where: { id }, data: { status } });
  }

  // ---------- 对账回款 ----------
  async listPayments(user: AuthUser) {
    return this.prisma.payment.findMany({
      where: this.t(user),
      include: { customer: { select: { name: true } }, order: { select: { orderNo: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPayment(user: AuthUser, dto: PaymentDto) {
    return this.prisma.payment.create({
      data: {
        ...dto,
        payDate: dto.payDate ? new Date(dto.payDate) : null,
        status: 'unpaid',
        tenantId: user.tenantId as string,
      },
    });
  }

  async markPaid(user: AuthUser, id: string, paidAmount: number) {
    const p = await this.prisma.payment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!p) throw new NotFoundException('对账单不存在');
    const amount = paidAmount ?? p.amount;
    const status = amount >= p.amount ? 'paid' : 'unpaid';
    return this.prisma.payment.update({
      where: { id },
      data: { paidAmount: amount, status, payDate: new Date() },
    });
  }
}
