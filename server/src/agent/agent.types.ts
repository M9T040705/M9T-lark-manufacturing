/** 智能体共享类型 */

export interface ToolResult {
  tool: string;
  count: number;
  rows: any[];
  summary: string;
}

// ---------------- LLM 抽象 ----------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface LlmToolCall {
  id?: string;
  name: string;
  arguments: Record<string, any>;
}

export interface LlmResponse {
  content: string;
  toolCalls: LlmToolCall[];
  tokens: number;
  thinking?: string; // 思考过程（深度思考模式）
}

/** 意图识别结果 */
export interface IntentResult {
  intent: 'query' | 'stats' | 'create' | 'action' | 'chitchat' | 'unclear';
  domain: string; // 业务域判断
  needsData: boolean; // 是否需要查询数据
  summary: string; // 一句话摘要
}

export interface LlmToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: any };
}

export interface LlmChatRequest {
  messages: ChatMessage[];
  tools?: LlmToolDef[];
  temperature?: number;
}

export interface LlmProvider {
  readonly name: string;
  chat(req: LlmChatRequest): Promise<LlmResponse>;
}
