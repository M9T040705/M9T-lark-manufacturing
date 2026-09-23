import { Module } from '@nestjs/common';
import { FeishuService } from './feishu.service';
import { FeishuController } from './feishu.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FeishuController],
  providers: [FeishuService],
  exports: [FeishuService],
})
export class FeishuModule {}
