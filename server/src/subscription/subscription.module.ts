import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionModule.name);

  constructor(private readonly sub: SubscriptionService) {}

  onModuleInit() {
    // 每天凌晨 2:00 执行到期检查
    const scheduleDailyCheck = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(2, 0, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      const delay = next.getTime() - now.getTime();

      setTimeout(async () => {
        try {
          await this.sub.dailyCheck();
        } catch (e: any) {
          this.logger.error(`订阅到期检查失败：${e?.message || e}`);
        }
        // 执行完后安排下一次（24小时间隔）
        setInterval(() => {
          this.sub.dailyCheck().catch((e) => this.logger.error(`订阅检查失败：${e?.message}`));
        }, 24 * 60 * 60 * 1000);
      }, delay);

      this.logger.log(`订阅到期检查已安排，下次执行：${next.toLocaleString('zh-CN')}`);
    };

    scheduleDailyCheck();
  }
}
