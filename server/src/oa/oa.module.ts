import { Module } from '@nestjs/common';
import { OaService } from './oa.service';
import { ApprovalsController } from './oa.controller';
import { FeishuModule } from '../feishu/feishu.module';

@Module({
  imports: [FeishuModule],
  controllers: [ApprovalsController],
  providers: [OaService],
})
export class OaModule {}
