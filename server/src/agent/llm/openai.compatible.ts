import { LlmChatRequest, LlmProvider, LlmResponse } from '../agent.types';

/**
 * OpenAI 兼容 Provider：火山方舟(Ark) / DeepSeek / 通义千问 / OpenAI 等
 * 任意提供 /chat/completions 兼容接口的服务均可通过环境变量接入：
 *   LLM_BASE_URL  如 https://ark.cn-beijing.volces.com/api/v3
 *   LLM_API_KEY   密钥
 *   LLM_MODEL     模型/接入点 id（如 ep-xxx / deepseek-chat / qwen-plus / gpt-4o-mini）
 *   LLM_TIMEOUT   超时秒数（默认 30）
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutSec = 30,
  ) {}

  async chat(req: LlmChatRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutSec * 1000);

    try {
      const payload: Record<string, any> = {
        model: this.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
      };
      if (req.tools && req.tools.length) {
        payload.tools = req.tools;
        payload.tool_choice = 'auto';
      }

      const resp = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`LLM HTTP ${resp.status}: ${text.slice(0, 300)}`);
      }

      const data = await resp.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new Error('LLM 返回缺少 choices[0].message');

      const toolCalls = Array.isArray(msg.tool_calls)
        ? msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            name: tc.function?.name,
            arguments: safeJson(tc.function?.arguments),
          }))
        : [];

      // 思考过程提取：优先 reasoning_content（deepseek-reasoner 原生），其次解析 <think> 标签
      let thinking: string | undefined = msg.reasoning_content?.trim() || undefined;
      let content = msg.content || '';
      if (!thinking) {
        const m = content.match(/<think>([\s\S]*?)<\/think>/i);
        if (m) {
          thinking = m[1].trim();
          content = content.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        }
      }

      return {
        content,
        toolCalls,
        tokens: data?.usage?.total_tokens ?? 0,
        thinking,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(s: any): Record<string, any> {
  if (!s) return {};
  if (typeof s === 'object') return s;
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
