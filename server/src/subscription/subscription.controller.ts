import { Controller, Get, Post, Body, Patch, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { RolesGuard, Roles } from '../common/roles.guard';

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly sub: SubscriptionService) {}

  /** 当前租户订阅状态 */
  @Get('status')
  status(@CurrentUser() u: AuthUser) {
    return this.sub.getSubscriptionStatus(u.tenantId as string);
  }

  /** 套餐价格表 */
  @Get('plans')
  plans() {
    return this.sub.getPlanInfo();
  }

  /** 订阅历史 */
  @Get('history')
  history(@CurrentUser() u: AuthUser) {
    return this.sub.listSubscriptions(u.tenantId as string);
  }

  /** 缴费记录 */
  @Get('payments')
  payments(@CurrentUser() u: AuthUser) {
    return this.sub.listPayments(u.tenantId as string);
  }

  /** 开通/续费（管理员操作，线下缴费场景） */
  @Post('subscribe')
  @UseGuards(RolesGuard)
  @Roles('boss', 'super_admin')
  subscribe(@CurrentUser() u: AuthUser, @Body() dto: {
    plan: 'standard' | 'pro';
    months: number;
    amount: number;
    payMethod?: string;
    remark?: string;
  }) {
    return this.sub.subscribe(u.tenantId as string, { ...dto, operatorId: u.userId });
  }

  /** 开关自动续费 */
  @Patch('auto-renew')
  @UseGuards(RolesGuard)
  @Roles('boss', 'super_admin')
  autoRenew(@CurrentUser() u: AuthUser, @Body() dto: { autoRenew: boolean }) {
    return this.sub.setAutoRenew(u.tenantId as string, dto.autoRenew);
  }

  /** 手动触发到期检查（超管调试用） */
  @Post('daily-check')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  dailyCheck() {
    return this.sub.dailyCheck();
  }
}
