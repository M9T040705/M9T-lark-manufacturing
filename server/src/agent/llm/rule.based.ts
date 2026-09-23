import { LlmChatRequest, LlmProvider, LlmResponse } from '../agent.types';
import { toolMeta } from '../agent.policy';

/**
 * 规则型 Provider（未配置 LLM_API_KEY 时的降级实现）。
 * 不直接编造数据：它只负责"按问题关键词 + 部门白名单选出一个受控工具"，
 * 真实数据仍由服务端工具执行（隔离与租户过滤照常生效）。
 * 第二轮（已含 tool 结果）直接把工具结论作为回答。
 */
export class RuleBasedProvider implements LlmProvider {
  readonly name = 'rule-based';

  async chat(req: LlmChatRequest): Promise<LlmResponse> {
    // 第二轮：工具已执行，组织最终回答
    if (req.messages.some((m) => m.role === 'tool')) {
      const toolMsgs = req.messages.filter((m) => m.role === 'tool');
      return {
        content: toolMsgs.map((m) => m.content).join('\n'),
        toolCalls: [],
        tokens: 0,
      };
    }

    const userMsg = [...req.messages].reverse().find((m) => m.role === 'user');
    const q = (userMsg?.content || '').trim();
    const ql = q.toLowerCase();

    // 在"部门白名单工具"内打分
    let bestName: string | null = null;
    let bestScore = 0;
    for (const t of req.tools || []) {
      const meta = toolMeta(t.function.name);
      if (!meta) continue;
      let score = 0;
      for (const k of meta.keywords) {
        if (ql.includes(k.toLowerCase())) score += 1;
      }
      // 汇总型工具在"问总量/概况"时加权
      if (
        (meta.name === 'get_overview_kpi' || meta.name === 'receivable_summary') &&
        /汇总|总额|一共|整体|概况|多少|总览/.test(q)
      ) {
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestName = meta.name;
      }
    }

    // 无任何白名单工具可命中 → 返回空，由 Service 统一回复"超出范围"
    if (!bestName) return { content: '', toolCalls: [], tokens: 0 };

    return {
      content: '',
      toolCalls: [{ name: bestName, arguments: extractArgs(bestName, q) }],
      tokens: 0,
    };
  };
}

/** 从中文问题中提取工具参数（启发式） */
function extractArgs(name: string, q: string): Record<string, any> {
  const a: Record<string, any> = {};
  const m = q.match(/[A-Za-z]{1,4}[-]?\d{5,}/);
  if (m && name !== 'get_overview_kpi' && name !== 'receivable_summary') {
    a.keyword = m[0];
  }
  switch (name) {
    case 'list_customers':
      if (/A级|Ａ级/.test(q)) a.level = 'A';
      else if (/B级|Ｂ级/.test(q)) a.level = 'B';
      else if (/C级|Ｃ级/.test(q)) a.level = 'C';
      break;
    case 'list_quotes':
      if (/已下单|已转单/.test(q)) a.status = 'ordered';
      else if (/已发送|发出/.test(q)) a.status = 'sent';
      else if (/草稿/.test(q)) a.status = 'draft';
      else if (/驳回|拒绝/.test(q)) a.status = 'rejected';
      break;
    case 'list_orders':
      if (/待生产|待排/.test(q)) a.status = 'pending';
      else if (/生产中/.test(q)) a.status = '生产中';
      else if (/完工/.test(q)) a.status = '已完工';
      else if (/延期|逾期/.test(q)) a.status = '延期';
      break;
    case 'list_work_orders':
      if (/待派工|待生产/.test(q)) a.status = 'pending';
      else if (/生产中/.test(q)) a.status = '生产中';
      else if (/完工/.test(q)) a.status = '已完工';
      else if (/延期|逾期/.test(q)) a.status = '延期';
      break;
    case 'query_inventory':
      if (/低库存|低于安全|安全库存/.test(q)) a.lowOnly = true;
      break;
    case 'list_stock_moves':
      if (/入库/.test(q)) a.type = 'in';
      else if (/出库/.test(q)) a.type = 'out';
      else if (/领料/.test(q)) a.type = 'pick';
      break;
    case 'list_inspections':
      if (/来料/.test(q)) a.type = 'incoming';
      else if (/工序|巡检|首件/.test(q)) a.type = 'process';
      else if (/成品/.test(q)) a.type = 'final';
      if (/不合格/.test(q)) a.result = 'fail';
      else if (/合格/.test(q)) a.result = 'pass';
      break;
    case 'list_defects':
      if (/未关闭|待处理/.test(q)) a.closed = false;
      else if (/已关闭/.test(q)) a.closed = true;
      break;
    case 'list_approvals':
      if (/请假/.test(q)) a.type = 'leave';
      else if (/加班/.test(q)) a.type = 'overtime';
      else if (/采购/.test(q)) a.type = 'purchase';
      else if (/报销|费用/.test(q)) a.type = 'expense';
      if (/待审批|待批/.test(q)) a.status = 'pending';
      else if (/批准|通过|同意/.test(q)) a.status = 'approved';
      else if (/驳回/.test(q)) a.status = 'rejected';
      break;
    case 'list_payments':
      if (/逾期/.test(q)) a.status = 'overdue';
      else if (/已收|结清|已结/.test(q)) a.status = 'paid';
      else if (/未收|未结/.test(q)) a.status = 'unpaid';
      break;
  }
  return a;
}
