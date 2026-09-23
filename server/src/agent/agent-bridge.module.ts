import { Global, Module } from '@nestjs/common';
import { AgentBridge } from './agent.bridge';

@Global()
@Module({
  providers: [AgentBridge],
  exports: [AgentBridge],
})
export class AgentBridgeModule {}
