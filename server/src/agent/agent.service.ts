import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeishuService } from '../feishu/feishu.service';
import { AgentBridge } from './agent.bridge';
import {
  DeptCode,
  buildLlmTools,
  deptMeta,
  deptOfRole,
  toolsForDept,
} from './agent.policy';
import { TOOL_EXECUTORS } from './agent.tools';
import { ChatMessage, IntentResult, LlmProvider, LlmToolDef, ToolResult } from './agent.types';
import { LLM_PROVIDER } from './llm/llm.module';
import { RuleBasedProvider } from './llm/rule.based';
import { KnowledgeService } from '../knowledge/knowledge.service';

const HISTORY_TAIL = 10; // 带入最近 N 条历史
const MAX_TOOL_ROUNDS = 8; // 最多工具调用轮数（ReAct 循环，可配置）

@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private prisma: PrismaService,
    private feishu: FeishuService,
    private bridge: AgentBridge,
    @Inject(LLM_PROVIDER) private llm: LlmProvider,
    private rule: RuleBasedProvider,
    private knowledge: KnowledgeService,
  ) {}

  onModuleInit() {
    // 注册到桥，供 FeishuService 懒调用（避免模块循环依赖）
    this.bridge.setAgent(this);
    this.logger.log(`部门智能体已就绪，LLM 模式：${(this.llm as any).name}`);
  }

  providerName() {
    return (this.llm as any).name || 'llm';
  }

  // 当前登录用户的部门可查询范围（含示例问题，供前端展示）
  async currentScope(user: any) {
    const info = await this.resolveWebDept(user);
    return deptMeta(info.dept);
  }

  // ================= 部门管理 =================

  listDepartments(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
      include: { _count: { select: { users: true, dataSources: true } } },
    });
  }

  async createDepartment(tenantId: string, dto: any) {
    return this.prisma.department.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        managerId: dto.managerId || null,
        feishuChatId: dto.feishuChatId || null,
        feishuWebhook: dto.feishuWebhook || null,
        active: dto.active !== false,
      },
    });
  }

  async updateDepartment(tenantId: string, id: string, dto: any) {
    return this.prisma.department.updateMany({
      where: { id, tenantId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId || null } : {}),
        ...(dto.feishuChatId !== undefined ? { feishuChatId: dto.feishuChatId || null } : {}),
        ...(dto.feishuWebhook !== undefined ? { feishuWebhook: dto.feishuWebhook || null } : {}),
        ...(dto.active !== undefined ? { active: !!dto.active } : {}),
      },
    });
  }

  // ================= 数据源（多维表）管理 =================

  listDataSources(tenantId: string) {
    return this.prisma.agentDataSource.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { department: { select: { name: true, code: true } } },
    });
  }

  createDataSource(tenantId: string, dto: any) {
    return this.prisma.agentDataSource.create({
      data: {
        tenantId,
        departmentId: dto.departmentId || null,
        name: dto.name,
        type: dto.type || 'BIZ_DB',
        enabled: dto.enabled !== false,
        feishuAppToken: dto.feishuAppToken || null,
        feishuTableId: dto.feishuTableId || null,
        feishuViewId: dto.feishuViewId || null,
        syncKeyField: dto.syncKeyField || null,
        config: dto.config || null,
      },
    });
  }

  updateDataSource(tenantId: string, id: string, dto: any) {
    return this.prisma.agentDataSource.updateMany({
      where: { id, tenantId },
      data: {
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId || null } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.enabled !== undefined ? { enabled: !!dto.enabled } : {}),
        ...(dto.feishuAppToken !== undefined ? { feishuAppToken: dto.feishuAppToken || null } : {}),
        ...(dto.feishuTableId !== undefined ? { feishuTableId: dto.feishuTableId || null } : {}),
        ...(dto.feishuViewId !== undefined ? { feishuViewId: dto.feishuViewId || null } : {}),
        ...(dto.syncKeyField !== undefined ? { syncKeyField: dto.syncKeyField || null } : {}),
        ...(dto.config !== undefined ? { config: dto.config || null } : {}),
      },
    });
  }

  removeDataSource(tenantId: string, id: string) {
    return this.prisma.agentDataSource.deleteMany({ where: { id, tenantId } });
  }

  // ================= 多维表数据浏览（部门隔离：总经办看全部，其他只看本部门） =================

  async listVisibleDataSources(tenantId: string, user: any) {
    const info = await this.resolveWebDept(user);
    const where: any = { tenantId, type: 'FEISHU_BASE', enabled: true };
    if (info.dept !== 'management') {
      where.departmentId = info.departmentId || '__none__';
    }
    return this.prisma.agentDataSource.findMany({
      where,
      select: { id: true, name: true, department: { select: { name: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async browseDataSourceRecords(tenantId: string, user: any, dataSourceId: string) {
    const info = await this.resolveWebDept(user);
    const ds = await this.prisma.agentDataSource.findFirst({
      where: { id: dataSourceId, tenantId, type: 'FEISHU_BASE' },
      include: { department: { select: { name: true, code: true } } },
    });
    if (!ds) throw new Error('数据源不存在');
    if (info.dept !== 'management') {
      if (!ds.departmentId || ds.departmentId !== info.departmentId) {
        throw new Error('无权查看该数据源');
      }
    }
    if (!ds.feishuAppToken || !ds.feishuTableId) {
      throw new Error('该数据源未配置 app_token / table_id');
    }
    const { items } = await this.feishu.listBaseRecords(
      tenantId,
      ds.feishuAppToken as string,
      ds.feishuTableId as string,
      { viewId: ds.feishuViewId || undefined, pageSize: 100 },
    );
    const fieldSet = new Set<string>();
    const rows = items.map((it: any) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(it.fields || {})) {
        fieldSet.add(k);
        o[k] = fieldToText(v);
      }
      return o;
    });
    return {
      dataSource: { id: ds.id, name: ds.name, department: ds.department },
      fields: Array.from(fieldSet),
      rows,
      total: rows.length,
    };
  }

  // ================= 会话 =================

  listConversations(tenantId: string, userId: string) {
    return this.prisma.agentConversation.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: { department: { select: { name: true } } },
    });
  }

  async getConversation(tenantId: string, userId: string, id: string) {
    const conv = await this.prisma.agentConversation.findFirst({
      where: { id, tenantId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, department: { select: { name: true, code: true } } },
    });
    return conv;
  }

  // ================= 群会话记录（部门隔离：总经办看全部，其他只看本部门） =================

  async listGroupConversations(tenantId: string, user: any) {
    const info = await this.resolveWebDept(user);
    const where: any = { tenantId, channel: 'feishu_group' };
    if (info.dept !== 'management' && info.departmentId) {
      where.departmentId = info.departmentId;
    }
    const convs = await this.prisma.agentConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        department: { select: { name: true, code: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return convs.map((c) => {
      const userMsgs = c.messages.filter((m) => m.role === 'user');
      const lastUser = userMsgs[userMsgs.length - 1];
      return {
        id: c.id,
        title: c.title,
        department: c.department,
        questionCount: userMsgs.length,
        answerCount: c.messages.filter((m) => m.role === 'assistant').length,
        lastQuestion: lastUser?.content?.slice(0, 60) || '',
        lastActive: c.updatedAt,
        createdAt: c.createdAt,
      };
    });
  }

  async getGroupConversationMessages(tenantId: string, user: any, id: string) {
    const info = await this.resolveWebDept(user);
    const where: any = { id, tenantId, channel: 'feishu_group' };
    if (info.dept !== 'management' && info.departmentId) {
      where.departmentId = info.departmentId;
    }
    const conv = await this.prisma.agentConversation.findFirst({
      where,
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        department: { select: { name: true, code: true } },
      },
    });
    if (!conv) throw new Error('会话不存在或无权查看');
    return conv;
  }

  // ================= Web 问答入口 =================

  async chat(user: any, dto: { conversationId?: string; message: string; thinking?: boolean }) {
    const deptInfo = await this.resolveWebDept(user);

    let conv = dto.conversationId
      ? await this.prisma.agentConversation.findFirst({
          where: { id: dto.conversationId, tenantId: user.tenantId, userId: user.userId },
        })
      : null;
    if (!conv) {
      conv = await this.prisma.agentConversation.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          departmentId: deptInfo.departmentId,
          title: dto.message.slice(0, 20),
          channel: 'web',
        },
      });
    }
    await this.saveMessage(conv.id, 'user', dto.message);

    const answer = await this.answer(user.tenantId, conv, deptInfo.dept, dto.message, !!dto.thinking);
    return {
      conversationId: conv.id,
      content: answer.content,
      toolCalls: answer.toolCalls,
      provider: answer.provider,
      thinking: answer.thinking,
      intent: answer.intent,
      trace: answer.trace,
      department: deptMeta(deptInfo.dept),
    };
  }

  // ================= 飞书部门群入口（接口预留并打通） =================

  async runDepartmentChat(
    tenantId: string,
    chatId: string,
    text: string,
    _sender?: { senderOpenId?: string },
  ): Promise<{ text: string }> {
    const deptRecord = await this.prisma.department.findFirst({
      where: { tenantId, feishuChatId: chatId },
    });
    if (!deptRecord) {
      return {
        text: '本群尚未绑定部门。请管理员在「智能助手 → 管理 → 部门与群配置」中填入该群的 open_chat_id。',
      };
    }
    // 群会话：同部门群复用最近一条，channel=feishu_group，固化部门
    let conv = await this.prisma.agentConversation.findFirst({
      where: { tenantId, channel: 'feishu_group', departmentId: deptRecord.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conv) {
      conv = await this.prisma.agentConversation.create({
        data: {
          tenantId,
          userId: deptRecord.managerId || 'feishu-group',
          departmentId: deptRecord.id,
          title: `${deptRecord.name}群问答`,
          channel: 'feishu_group',
        },
      });
    }
    await this.saveMessage(conv.id, 'user', text);
    const answer = await this.answer(tenantId, conv, deptRecord.code as DeptCode, text, false);
    return { text: answer.content };
  }

  // ================= 问答编排（隔离核心） =================

  private async resolveWebDept(user: any): Promise<{ dept: DeptCode; departmentId: string | null }> {
    const full = await this.prisma.user.findUnique({
      where: { id: user.userId },
      include: { department: true },
    });
    if (full?.department) {
      return { dept: full.department.code as DeptCode, departmentId: full.department.id };
    }
    return { dept: deptOfRole(user.role), departmentId: null };
  }

  private async answer(
    tenantId: string,
    conv: any,
    dept: DeptCode,
    userMessage: string,
    enableThinking: boolean,
  ) {
    // ============ 执行轨迹（全链路可追溯） ============
    const trace: any[] = [];
    const t0 = Date.now();
    const step = (type: string, label: string, detail: any = {}) => {
      trace.push({ step: trace.length + 1, type, label, ...detail, ms: Date.now() - t0, at: new Date().toISOString() });
    };

    // 历史
    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TAIL,
    });
    history.reverse();
    const histMessages: ChatMessage[] = history
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 步骤1+2 并行：意图识别 + RAG 知识库检索（部门隔离）+ 外部工具构建
    const t1 = Date.now();
    const [intent, ragResult, external] = await Promise.all([
      this.detectIntent(dept, userMessage),
      this.knowledge.buildRagContext(tenantId, dept, conv.departmentId, userMessage),
      this.buildExternalTools(tenantId, dept, conv.departmentId),
    ]);
    const { context: ragContext, sources } = ragResult;
    step('intent', '意图识别', { summary: `${intent.intent} · ${intent.summary}`, detail: intent, ms: Date.now() - t1 });
    step('rag', '知识库检索', {
      summary: `命中 ${sources.length} 条相关资料`,
      sources: sources.map((s: any) => ({ title: s.title, score: s.score, section: s.sectionPath })),
      ms: Date.now() - t1,
    });

    // 步骤3：执行计划（仅复杂数据查询需要；闲聊/不明确跳过，省一次 LLM 调用）
    let plan = '';
    if (intent.needsData && intent.intent !== 'chitchat' && intent.intent !== 'unclear') {
      const t3 = Date.now();
      plan = await this.detectPlan(dept, userMessage, intent);
      step('plan', '执行计划', { summary: plan.slice(0, 200), ms: Date.now() - t3 });
    }

    const toolDefs: LlmToolDef[] = [...buildLlmTools(dept), ...external.defs];
    const allowedNames = new Set<string>([...toolsForDept(dept).map((t) => t.name), ...external.names]);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt(dept, intent, enableThinking, ragContext, plan) },
      ...histMessages,
    ];

    const auditCalls: any[] = [];
    let tokensTotal = 0;
    let finalContent = '';
    let finalThinking = '';

    // 步骤4-N：ReAct 循环（最多8轮）
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const tr0 = Date.now();
      let resp;
      try {
        resp = await this.llm.chat({ messages, tools: toolDefs });
      } catch (e: any) {
        this.logger.warn(`主 LLM 调用失败，降级规则模式：${e?.message || e}`);
        resp = await this.rule.chat({ messages, tools: toolDefs });
      }
      tokensTotal += resp.tokens || 0;
      if (resp.thinking) finalThinking += (finalThinking ? '\n' : '') + resp.thinking;

      if (!resp.toolCalls.length) {
        finalContent = resp.content;
        step('llm', `最终回答（第${round + 1}轮）`, { summary: finalContent.slice(0, 150), ms: Date.now() - tr0, tokens: resp.tokens });
        break;
      }

      const calls = resp.toolCalls.map((tc, i) => ({ id: tc.id || `call_${round}_${i}`, name: tc.name, arguments: tc.arguments || {} }));
      messages.push({
        role: 'assistant', content: resp.content || '',
        tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })),
      });

      for (const c of calls) {
        const tc0 = Date.now();
        if (!allowedNames.has(c.name)) {
          auditCalls.push({ name: c.name, args: c.arguments, denied: true });
          step('tool_denied', `拒绝调用 ${c.name}`, { summary: '不在部门白名单内', ms: Date.now() - tc0 });
          messages.push({ role: 'tool', name: c.name, tool_call_id: c.id, content: '该工具不在你所在部门的可查询范围内，本次调用已被拒绝。' });
          continue;
        }
        let result: ToolResult;
        try {
          result = c.name.startsWith('base_')
            ? await external.exec(c.name, c.arguments)
            : await TOOL_EXECUTORS[c.name](this.prisma as any, tenantId, c.arguments);
        } catch (e: any) {
          result = { tool: c.name, count: 0, rows: [], summary: `查询「${c.name}」失败：${e?.message || e}` };
        }
        auditCalls.push({ name: c.name, args: c.arguments, count: result.count });
        step('tool', `调用 ${c.name}`, { summary: `返回 ${result.count} 条`, args: c.arguments, ms: Date.now() - tc0 });
        messages.push({ role: 'tool', name: c.name, tool_call_id: c.id, content: result.summary });
      }
    }

    if (!finalContent) finalContent = this.outOfScope(dept);
    step('done', '完成', { totalMs: Date.now() - t0 });

    await this.saveMessage(conv.id, 'assistant', finalContent, JSON.stringify(auditCalls), tokensTotal, finalThinking || null, JSON.stringify(intent), JSON.stringify(trace));
    return { content: finalContent, toolCalls: auditCalls, provider: this.providerName(), thinking: finalThinking || null, intent, trace };
  }

  // 执行计划（Planning）
  private async detectPlan(dept: DeptCode, message: string, intent: IntentResult): Promise<string> {
    try {
      const resp = await this.llm.chat({
        messages: [
          { role: 'system', content: '你是任务规划器。根据用户问题输出简短执行计划（2-4步），说明调用哪些工具、查什么数据、如何组织答案。直接输出计划文本，不要JSON。格式：1.调用xxx 2.调用yyy 3.综合分析回答。' },
          { role: 'user', content: `问题：${message}\n意图：${intent.intent}` },
        ],
        temperature: 0,
      });
      return (resp.content || '').trim();
    } catch { return '直接回答'; }
  }

  // ---------------- 外部飞书多维表工具（动态装配） ----------------

  private async buildExternalTools(
    tenantId: string,
    dept: DeptCode,
    departmentId: string | null,
  ): Promise<{ defs: LlmToolDef[]; names: string[]; exec: (name: string, args: any) => Promise<ToolResult> }> {
    const sources = await this.prisma.agentDataSource.findMany({
      where: {
        tenantId,
        enabled: true,
        type: 'FEISHU_BASE',
        ...(dept === 'management'
          ? {}
          : { departmentId: departmentId || '__no_dept__' }),
      },
    });

    const defs: LlmToolDef[] = [];
    const names: string[] = [];
    const map = new Map<string, (args: any) => Promise<ToolResult>>();

    for (const s of sources) {
      if (!s.feishuAppToken || !s.feishuTableId) continue;
      const toolName = `base_${s.id}`;
      defs.push({
        type: 'function',
        function: {
          name: toolName,
          description: `查询飞书多维表「${s.name}」的记录`,
          parameters: {
            type: 'object',
            properties: { keyword: { type: 'string', description: '关键词（可选，匹配任意字段文本）' } },
            additionalProperties: false,
          },
        },
      });
      names.push(toolName);

      map.set(toolName, async (args: any) => {
        const { items } = await this.feishu.listBaseRecords(tenantId, s.feishuAppToken as string, s.feishuTableId as string, {
          viewId: s.feishuViewId || undefined,
          pageSize: 100,
        });
        let rows = items.map((it: any) => {
          const o: Record<string, string> = {};
          for (const [k, v] of Object.entries(it.fields || {})) o[k] = fieldToText(v);
          return o;
        });
        if (args?.keyword) {
          rows = rows.filter((r: any) => Object.values(r).join(' ').includes(args.keyword));
        }
        rows = rows.slice(0, 20);
        const summary = rows.length
          ? `「${s.name}」匹配 ${rows.length} 条：` +
            rows.map((r: any) => Object.entries(r).map(([k, v]) => `${k}:${v}`).join('，')).join('；')
          : `「${s.name}」暂无匹配记录。`;
        return { tool: toolName, count: rows.length, rows, summary };
      });
    }

    return {
      defs,
      names,
      exec: async (name: string, args: any) => (map.get(name) as any)(args),
    };
  }

  // ---------------- 意图识别（轻量 LLM 调用，不带 tools） ----------------

  private async detectIntent(dept: DeptCode, message: string): Promise<IntentResult> {
    const fallback: IntentResult = {
      intent: 'query',
      domain: dept,
      needsData: true,
      summary: message.slice(0, 50),
    };
    try {
      const resp = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content:
              '你是意图分类器。只输出严格 JSON，不要任何解释、markdown 或代码块。字段：intent(query数据查询/stats统计分析/create创建请求/action操作请求/chitchat闲聊/unclear不明确)，domain(业务域英文)，needsData(true/false是否需要查数据)，summary(一句话中文摘要不超过30字)。',
          },
          { role: 'user', content: message },
        ],
        temperature: 0,
      });
      const text = (resp.content || '').trim().replace(/^```json\s*/i, '').replace(/```$/, '');
      const parsed = JSON.parse(text);
      return {
        intent: parsed.intent || 'query',
        domain: parsed.domain || dept,
        needsData: parsed.needsData !== false,
        summary: parsed.summary || message.slice(0, 50),
      };
    } catch {
      return fallback;
    }
  }

  // ---------------- 提示词 / 兜底 ----------------

  private systemPrompt(dept: DeptCode, intent?: IntentResult, enableThinking = false, ragContext?: string, plan?: string) {
    const m = deptMeta(dept);
    const lines = [
      `你是制造企业的部门数据助手，服务于「${m.name}」。`,
      `你只能通过提供的工具获取数据，可查询范围限定为：${m.scopeDesc}。`,
    ];
    if (intent) {
      lines.push(`当前问题意图：${intent.intent}（${intent.summary}）。${intent.needsData ? '需要查询数据时调用工具。' : '这是闲聊或操作类问题，无需调用工具，直接简洁回应。'}`);
    }
    if (plan) {
      lines.push(`执行计划：${plan}`);
    }
    if (ragContext && ragContext.trim()) {
      lines.push(ragContext);
      lines.push('以上参考资料来自企业知识库，回答时优先引用其中的制度/流程/规范，不要与资料矛盾。');
    }
    lines.push(
      '要求：',
      '1) 需要数据时调用工具，绝不编造数字或业务事实；工具无返回就明确告知"暂无数据"；',
      '2) 问题与本部门职责无关、或没有可支持的工具时，直接说明超出你所在部门的可查询范围，不要尝试回答；',
      '3) 你无法看到、也不能请求其他部门的数据；',
      '4) 使用中文、简洁作答，先给结论与关键数字。',
    );
    if (enableThinking) {
      lines.push('5) 回答前先在 <think> 标签中简要思考分析（问题理解、需要哪些数据、如何组织答案），再给出最终回答。思考部分不要包含最终结论。');
    }
    return lines.join('\n');
  }

  private outOfScope(dept: DeptCode) {
    const m = deptMeta(dept);
    return (
      `抱歉，这个问题超出了「${m.name}」可查询的范围。` +
      `你可以询问：${m.scopeDesc}。例如：${m.examples.join('；')}。`
    );
  }

  // ================= Token 使用统计展板（全员可见，不做部门隔离） =================

  async tokenStats(tenantId: string, _user: any) {
    const convWhere: any = { tenantId };

    const [conversations, messages, departments, users] = await Promise.all([
      this.prisma.agentConversation.findMany({
        where: convWhere,
        select: { id: true, userId: true, departmentId: true, channel: true, createdAt: true },
      }),
      this.prisma.agentMessage.findMany({
        where: { conversation: convWhere },
        select: { id: true, conversationId: true, role: true, tokens: true, createdAt: true },
      }),
      this.prisma.department.findMany({ where: { tenantId }, select: { id: true, name: true, code: true } }),
      this.prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true, departmentId: true } }),
    ]);

    const deptMap = new Map(departments.map((d) => [d.id, d]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const convMap = new Map(conversations.map((c) => [c.id, c]));

    const totalTokens = messages.reduce((s, m) => s + (m.tokens || 0), 0);
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const userMsgs = messages.filter((m) => m.role === 'user');
    const avgTokensPerAnswer = assistantMsgs.length ? Math.round(totalTokens / assistantMsgs.length) : 0;

    const byDept = new Map<string, { tokens: number; questions: number; answers: number }>();
    for (const m of messages) {
      const conv = convMap.get(m.conversationId);
      const deptId = conv?.departmentId || '__unknown__';
      const cur = byDept.get(deptId) || { tokens: 0, questions: 0, answers: 0 };
      cur.tokens += m.tokens || 0;
      if (m.role === 'user') cur.questions++;
      if (m.role === 'assistant') cur.answers++;
      byDept.set(deptId, cur);
    }
    const deptStats = Array.from(byDept.entries())
      .map(([deptId, v]) => ({
        departmentId: deptId,
        departmentName: deptMap.get(deptId)?.name || (deptId === '__unknown__' ? '未分配' : deptId),
        tokens: v.tokens,
        questions: v.questions,
        answers: v.answers,
        avgTokens: v.answers ? Math.round(v.tokens / v.answers) : 0,
      }))
      .sort((a, b) => b.tokens - a.tokens);

    const byUser = new Map<string, { tokens: number; questions: number; answers: number }>();
    for (const m of messages) {
      const conv = convMap.get(m.conversationId);
      const userId = conv?.userId || '__unknown__';
      const cur = byUser.get(userId) || { tokens: 0, questions: 0, answers: 0 };
      cur.tokens += m.tokens || 0;
      if (m.role === 'user') cur.questions++;
      if (m.role === 'assistant') cur.answers++;
      byUser.set(userId, cur);
    }
    const userStats = Array.from(byUser.entries())
      .map(([userId, v]) => {
        const u = userMap.get(userId);
        const conv = conversations.find((c) => c.userId === userId);
        return {
          userId,
          userName: u?.name || (userId === '__unknown__' ? '群会话/未知' : userId),
          departmentName: deptMap.get(conv?.departmentId || '')?.name || deptMap.get(u?.departmentId || '')?.name || '-',
          tokens: v.tokens,
          questions: v.questions,
          answers: v.answers,
          avgTokens: v.answers ? Math.round(v.tokens / v.answers) : 0,
        };
      })
      .sort((a, b) => b.tokens - a.tokens);

    const days: string[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }
    const dailyTokens = days.map(() => 0);
    const dailyQuestions = days.map(() => 0);
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const idx = days.indexOf(key);
      if (idx >= 0) {
        dailyTokens[idx] += m.tokens || 0;
        if (m.role === 'user') dailyQuestions[idx]++;
      }
    }

    const byChannel = new Map<string, number>();
    for (const c of conversations) {
      const ch = c.channel || 'web';
      byChannel.set(ch, (byChannel.get(ch) || 0) + 1);
    }
    const channelStats = Array.from(byChannel.entries()).map(([channel, count]) => ({
      channel: channel === 'web' ? '网页端' : channel === 'feishu_group' ? '飞书群' : channel,
      conversations: count,
    }));

    return {
      kpi: {
        totalTokens,
        totalQuestions: userMsgs.length,
        totalAnswers: assistantMsgs.length,
        avgTokensPerAnswer,
        activeUsers: byUser.size,
        activeDepartments: byDept.size,
      },
      byDepartment: deptStats,
      byUser: userStats,
      trend: { days, tokens: dailyTokens, questions: dailyQuestions },
      byChannel: channelStats,
    };
  }

  // ================= 对话评价反馈 =================

  async createFeedback(tenantId: string, dto: { messageId: string; rating: number; comment?: string }) {
    return this.prisma.agentFeedback.create({
      data: { tenantId, messageId: dto.messageId, rating: dto.rating, comment: dto.comment || null },
    });
  }

  private async saveMessage(
    conversationId: string,
    role: string,
    content: string,
    toolCalls?: string,
    tokens = 0,
    thinking?: string | null,
    intent?: string,
    trace?: string,
  ) {
    await this.prisma.agentMessage.create({
      data: {
        conversationId,
        role,
        content,
        toolCalls: toolCalls || null,
        thinking: thinking || null,
        intent: intent || null,
        trace: trace || null,
        tokens,
      },
    });
    await this.prisma.agentConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }
}

// 飞书多维表字段值 → 可读文本（处理富文本/人员/附件等数组结构）
function fieldToText(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => (x === null || x === undefined ? '' : x.text ?? x.name ?? (typeof x === 'object' ? '' : String(x))))
      .filter(Boolean)
      .join(' ');
  }
  return v.text ?? v.name ?? '';
}
