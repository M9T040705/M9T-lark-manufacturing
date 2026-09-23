import { Module } from '@nestjs/common';
import { FeishuModule } from '../feishu/feishu.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { LlmModule } from './llm/llm.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [FeishuModule, LlmModule, KnowledgeModule],
  controllers: [AgentController],
  providers: [AgentService],
})
export class AgentModule {}
