import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** 套餐定义 */
export const PLANS = {
  standard: {
    name: '标准版',
    pricePerMonth: 299, // 元/月
    pricePerYear: 2990, // 元/年（约83折）
    maxUsers: 10,
    maxAgentCallsPerDay: 100,
    features: ['CRM', 'MES', 'WMS', 'QMS', 'OA审批', '基础BI', '部门智能体'],
  },
  pro: {
    name: '专业版',
    pricePerMonth: 799,
    pricePerYear: 7990,
    maxUsers: 100,
    maxAgentCallsPerDay: -1, // 不限
    features: ['全部标准版功能', '高级BI看板', 'RAG知识库', '飞书深度集成', 'API开放', '优先技术支持'],
  },
};

/** 宽限期天数：到期后只读 */
const GRACE_DAYS = 7;
/** 提前提醒天数 */
const REMIND_DAYS = [7, 3, 1];

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private prisma: PrismaService) {}

  /** 获取租户订阅状态 */
  async getSubscriptionStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true, code: true, name: true, plan: true, status: true,
        expiresAt: true, trialEndsAt: true, autoRenew: true, graceEndsAt: true,
      },
    });
    if (!tenant) throw new BadRequestException('租户不存在');

    const now = new Date();
    const planInfo = PLANS[tenant.plan as keyof typeof PLANS] || PLANS.standard;

    // 计算状态
    let subStatus: 'permanent' | 'active' | 'trial' | 'grace' | 'expired' = 'active';
    let daysLeft: number | null = null;

    if (!tenant.expiresAt) {
      subStatus = 'permanent'; // 永久（开发/内部）
    } else if (tenant.trialEndsAt && tenant.trialEndsAt > now) {
      subStatus = 'trial';
      daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - now.getTime()) / 86400000);
    } else if (tenant.expiresAt > now) {
      subStatus = 'active';
      daysLeft = Math.ceil((tenant.expiresAt.getTime() - now.getTime()) / 86400000);
    } else if (tenant.graceEndsAt && tenant.graceEndsAt > now) {
      subStatus = 'grace';
      daysLeft = Math.ceil((tenant.graceEndsAt.getTime() - now.getTime()) / 86400000);
    } else {
      subStatus = 'expired';
    }

    return {
      ...tenant,
      planInfo,
      subStatus,
      daysLeft,
      isReadOnly: tenant.status === 'read_only' || subStatus === 'grace',
      isSuspended: tenant.status === 'suspended' || subStatus === 'expired',
    };
  }

  /** 开通/续费订阅（模拟支付，线下缴费场景） */
  async subscribe(tenantId: string, dto: {
    plan: 'standard' | 'pro';
    months: number;
    amount: number;
    payMethod?: string;
    remark?: string;
    operatorId?: string;
  }) {
    const planInfo = PLANS[dto.plan];
    if (!planInfo) throw new BadRequestException('未知套餐');

    // 创建缴费记录
    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId,
        plan: dto.plan,
        months: dto.months,
        amount: dto.amount,
        status: 'paid',
        payMethod: dto.payMethod || 'manual',
        paidAt: new Date(),
        createdBy: dto.operatorId,
        remark: dto.remark,
      },
    });

    // 计算新的到期时间：在当前到期时间基础上延续（如果还没到期），否则从现在开始
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const baseDate = tenant?.expiresAt && tenant.expiresAt > new Date() ? tenant.expiresAt : new Date();
    const newExpiresAt = new Date(baseDate);
    newExpiresAt.setMonth(newExpiresAt.getMonth() + dto.months);

    // 创建订阅记录
    const sub = await this.prisma.subscription.create({
      data: {
        tenantId,
        plan: dto.plan,
        startDate: baseDate,
        endDate: newExpiresAt,
        months: dto.months,
        amount: dto.amount,
        status: 'active',
        paymentId: payment.id,
        remark: dto.remark,
      },
    });

    // 更新租户：套餐、到期时间、恢复正常状态、清除宽限期
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plan: dto.plan,
        expiresAt: newExpiresAt,
        status: 'active',
        graceEndsAt: null,
      },
    });

    return { subscription: sub, payment, newExpiresAt };
  }

  /** 开启/关闭自动续费 */
  async setAutoRenew(tenantId: string, autoRenew: boolean) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { autoRenew },
    });
  }

  /** 订阅历史列表 */
  async listSubscriptions(tenantId: string) {
    return this.prisma.subscription.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 缴费记录列表 */
  async listPayments(tenantId: string) {
    return this.prisma.subscriptionPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ================= 定时任务：到期检查 =================

  /** 每天凌晨执行：检查所有租户到期状态，发提醒、降级、停用 */
  async dailyCheck() {
    this.logger.log('开始执行订阅到期检查...');
    const tenants = await this.prisma.tenant.findMany({
      where: { expiresAt: { not: null } },
      select: { id: true, code: true, name: true, plan: true, status: true, expiresAt: true, graceEndsAt: true, autoRenew: true },
    });

    const now = new Date();
    let reminded = 0, degraded = 0, suspended = 0, renewed = 0;

    for (const t of tenants) {
      if (!t.expiresAt) continue;
      const daysLeft = Math.ceil((t.expiresAt.getTime() - now.getTime()) / 86400000);

      // 1. 即将到期提醒（7/3/1天）
      if (daysLeft > 0 && REMIND_DAYS.includes(daysLeft) && t.status === 'active') {
        await this.sendReminder(t.id, t.name, daysLeft);
        reminded++;
      }

      // 2. 刚到期：进入只读宽限期
      if (daysLeft <= 0 && t.status === 'active') {
        const graceEndsAt = new Date(now);
        graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_DAYS);
        await this.prisma.tenant.update({
          where: { id: t.id },
          data: { status: 'read_only', graceEndsAt },
        });
        await this.sendNotification(t.id, '订阅已到期', `您的订阅已于 ${t.expiresAt.toLocaleDateString()} 到期，当前进入 ${GRACE_DAYS} 天只读宽限期，请尽快续费。`);
        degraded++;
        continue;
      }

      // 3. 宽限期结束：停用
      if (t.status === 'read_only' && t.graceEndsAt && t.graceEndsAt <= now) {
        await this.prisma.tenant.update({
          where: { id: t.id },
          data: { status: 'suspended' },
        });
        await this.sendNotification(t.id, '账号已停用', '只读宽限期已过，账号已停用。续费后可立即恢复全部功能。');
        suspended++;
      }

      // 4. 自动续费（autoRenew=true 且到期当天）
      if (t.autoRenew && daysLeft <= 0 && t.status !== 'suspended') {
        // 模拟自动续费：按当前套餐续1个月
        const planInfo = PLANS[t.plan as keyof typeof PLANS] || PLANS.standard;
        await this.subscribe(t.id, {
          plan: t.plan as 'standard' | 'pro',
          months: 1,
          amount: planInfo.pricePerMonth,
          payMethod: 'auto_renew',
          remark: '自动续费',
        });
        renewed++;
      }
    }

    this.logger.log(`订阅检查完成：提醒 ${reminded} 家，降级只读 ${degraded} 家，停用 ${suspended} 家，自动续费 ${renewed} 家`);
    return { reminded, degraded, suspended, renewed, total: tenants.length };
  }

  /** 发送到期提醒（站内通知 + 飞书群） */
  private async sendReminder(tenantId: string, tenantName: string, daysLeft: number) {
    await this.sendNotification(
      tenantId,
      `订阅即将到期（${daysLeft}天）`,
      `您的「${tenantName}」订阅将在 ${daysLeft} 天后到期，请及时续费以免影响使用。`,
    );
  }

  private async sendNotification(tenantId: string, title: string, content: string) {
    // 站内通知（全员广播）
    await this.prisma.notification.create({
      data: { tenantId, userId: null, type: 'system', title, content },
    }).catch(() => {});
    // 飞书群推送（如果配置了）
    // 这里可以调用 FeishuService.notify，通过模块间依赖注入
  }

  /** 套餐价格表 */
  getPlanInfo() {
    return PLANS;
  }
}
