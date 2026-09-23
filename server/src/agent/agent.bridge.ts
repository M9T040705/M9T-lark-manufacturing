import { Injectable } from '@nestjs/common';

/**
 * 运行时桥：解决 FeishuModule 与 AgentModule 的潜在循环依赖。
 * AgentService 在 onModuleInit 时注册自身；FeishuService 收到群消息事件后懒获取并调用。
 * 模块层因此保持单向依赖（AgentModule -> FeishuModule），无需 forwardRef。
 */
@Injectable()
export class AgentBridge {
  private agent: { runDepartmentChat?: (...args: any[]) => Promise<any> } | null = null;

  setAgent(agent: any) {
    this.agent = agent;
  }

  getAgent(): any | null {
    return this.agent;
  }
}
