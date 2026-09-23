/**
 * 部门级数据隔离策略（单一事实来源）
 *
 * 隔离模型（两道硬隔离，不依赖 LLM 自觉）：
 *  1) 传给 LLM 的 tools 仅包含"提问人所在部门"的白名单工具；
 *  2) 工具执行在服务端，查询强制注入 tenantId（租户隔离），
 *     且执行前再次校验工具是否属于该部门（防提示词注入越权）。
 *
 * 工具只暴露"受控的只读业务查询"，不提供任意 SQL / 任意表能力，无越权通道。
 */

export type DeptCode =
  | 'management'
  | 'sales'
  | 'production'
  | 'warehouse'
  | 'quality'
  | 'hr'
  | 'finance';

export interface DeptMeta {
  code: DeptCode;
  name: string;
  // 该部门可查询的信息范围（前端"我能问什么"展示）
  scopeDesc: string;
  // 该部门的示例问题
  examples: string[];
}

export const DEPARTMENTS: DeptMeta[] = [
  {
    code: 'management',
    name: '总经办',
    scopeDesc: '全公司经营总览，以及销售、生产、仓储、质量、人事、财务各域汇总数据',
    examples: ['本月订单总额和完成率', '当前有哪些工单延期', '公司整体经营情况'],
  },
  {
    code: 'sales',
    name: '销售部',
    scopeDesc: '客户档案、报价单、销售订单、订单状态与交期',
    examples: ['A级客户有哪些', '报价单 Q20260910002 的状态', '最近订单的交付情况'],
  },
  {
    code: 'production',
    name: '生产部',
    scopeDesc: '工单、生产进度、报工产量、BOM 与工艺路线',
    examples: ['工单 WO20260905001 进度', '今天各工单报工产量', '精密齿轮轴的 BOM 工艺'],
  },
  {
    code: 'warehouse',
    name: '仓储部',
    scopeDesc: '库存、物料余量、出入库流水、低库存物料',
    examples: ['45#钢棒还有多少库存', '哪些物料低于安全库存', '今天的出入库记录'],
  },
  {
    code: 'quality',
    name: '质量部',
    scopeDesc: '来料/工序/成品检验记录、缺陷与不合格处理',
    examples: ['最近的成品检验结果', '有哪些未关闭的缺陷', '尺寸超差的处理情况'],
  },
  {
    code: 'hr',
    name: '人事行政部',
    scopeDesc: '各类审批单（请假/加班/采购/报销等）与流程状态',
    examples: ['有哪些待审批的单子', '采购类审批有哪些', '赵师傅的请假批了吗'],
  },
  {
    code: 'finance',
    name: '财务部',
    scopeDesc: '回款记录、应收/已收/逾期情况、应收汇总',
    examples: ['华锐的回款情况', '目前还有多少应收未收', '哪些回款已逾期'],
  },
];

// 系统角色 -> 部门（User.role；与账号权限页一致）
const ROLE_TO_DEPT: Record<string, DeptCode> = {
  super_admin: 'management',
  boss: 'management',
  sales: 'sales',
  manager: 'production',
  worker: 'production',
  warehouse: 'warehouse',
  quality: 'quality',
  hr: 'hr',
  finance: 'finance',
};

export function deptOfRole(role: string): DeptCode {
  return ROLE_TO_DEPT[role] || 'production';
}

export function deptMeta(code: DeptCode): DeptMeta {
  return DEPARTMENTS.find((d) => d.code === code) as DeptMeta;
}

// ---------------- 工具元数据 ----------------

export interface ParamProp {
  type: 'string' | 'boolean' | 'number';
  description?: string;
  enum?: string[];
}

export interface ToolMeta {
  name: string;
  // 归属业务部门；management 表示总经办专属工具（如 get_overview_kpi）。
  // management 部门本身可调用全部工具，其余部门只能调用 dept 等于自己的工具。
  dept: DeptCode;
  description: string;
  // 参数 JSON Schema 属性（均为可选）
  params: Record<string, ParamProp>;
  // 规则模式（无 LLM Key）下用于关键词命中
  keywords: string[];
}

const P = {
  keyword: { type: 'string', description: '名称/编号模糊关键词' } as ParamProp,
  status: (e: string[]) => ({ type: 'string', description: '状态筛选', enum: e } as ParamProp),
};

export const TOOLS: ToolMeta[] = [
  {
    name: 'get_overview_kpi',
    dept: 'management',
    description: '公司经营总览核心指标：订单、工单完成率、合格率、库存、应收、待审批等',
    params: {},
    keywords: ['总览', '经营', '整体', '概况', 'kpi', '指标'],
  },
  {
    name: 'list_customers',
    dept: 'sales',
    description: '客户档案查询，可按名称关键词或客户等级（A/B/C）筛选',
    params: { keyword: P.keyword, level: { type: 'string', description: '客户等级', enum: ['A', 'B', 'C'] } },
    keywords: ['客户', 'customer', '经销商', '终端'],
  },
  {
    name: 'list_quotes',
    dept: 'sales',
    description: '报价单查询，可按状态（draft/sent/ordered/rejected）筛选',
    params: { keyword: P.keyword, status: P.status(['draft', 'sent', 'ordered', 'rejected']) },
    keywords: ['报价', 'quote'],
  },
  {
    name: 'list_orders',
    dept: 'sales',
    description: '销售订单查询，含订单状态、交期、金额，可按状态或产品/编号关键词筛选',
    params: { keyword: P.keyword, status: P.status(['pending', '生产中', '已完工', '已发货', '已对账', '延期']) },
    keywords: ['订单', 'order', '交付', '交期'],
  },
  {
    name: 'list_work_orders',
    dept: 'production',
    description: '生产工单与进度查询，含计划/完工数量、负责人、状态，可按状态筛选',
    params: { keyword: P.keyword, status: P.status(['pending', '生产中', '已完工', '延期']) },
    keywords: ['工单', 'work order', 'wo', '生产进度', '进度'],
  },
  {
    name: 'list_work_reports',
    dept: 'production',
    description: '报工记录与产量查询，含工序、合格/不合格数量、机台、报工时间',
    params: { keyword: P.keyword },
    keywords: ['报工', '产量', '工时', 'report'],
  },
  {
    name: 'list_boms',
    dept: 'production',
    description: 'BOM 物料清单与工艺路线查询，可按产品名称关键词筛选',
    params: { keyword: P.keyword },
    keywords: ['bom', '工艺', '物料清单', '工序'],
  },
  {
    name: 'query_inventory',
    dept: 'warehouse',
    description: '库存查询，含物料/产品名称、仓库、批次、数量，可只看低于安全库存项',
    params: { keyword: P.keyword, lowOnly: { type: 'boolean', description: '是否仅返回低于安全库存的物料' } },
    keywords: ['库存', 'inventory', '余量', '低库存', '安全库存'],
  },
  {
    name: 'list_stock_moves',
    dept: 'warehouse',
    description: '出入库流水查询，可按类型（in 入库/out 出库/pick 领料）筛选',
    params: { keyword: P.keyword, type: P.status(['in', 'out', 'pick']) },
    keywords: ['出入库', '入库', '出库', '领料', '流水', 'stock move'],
  },
  {
    name: 'list_inspections',
    dept: 'quality',
    description: '检验记录查询（incoming 来料/process 工序/final 成品），含合格数、缺陷数、结果',
    params: { keyword: P.keyword, type: P.status(['incoming', 'process', 'final']), result: P.status(['pass', 'fail']) },
    keywords: ['检验', '质检', 'insp', '来料检', '成品检'],
  },
  {
    name: 'list_defects',
    dept: 'quality',
    description: '缺陷/不合格记录查询，含缺陷分类、数量、处理方式（返工/报废/让步）及是否关闭',
    params: { keyword: P.keyword, closed: { type: 'boolean', description: '是否已关闭' } },
    keywords: ['缺陷', '不合格', '不良', 'defect', '返工', '报废', '超差'],
  },
  {
    name: 'list_approvals',
    dept: 'hr',
    description: '审批单查询（请假/加班/采购/领料/报废/报销等），可按类型或状态筛选',
    params: {
      keyword: P.keyword,
      type: P.status(['leave', 'overtime', 'purchase', 'pick', 'scrap', 'order_change', 'expense']),
      status: P.status(['pending', 'approved', 'rejected']),
    },
    keywords: ['审批', '请假', '加班', '报销', '采购审批', 'approval'],
  },
  {
    name: 'list_payments',
    dept: 'finance',
    description: '回款/应收记录查询，含客户、金额、已收金额、状态（unpaid/paid/overdue）',
    params: { keyword: P.keyword, status: P.status(['unpaid', 'paid', 'overdue']) },
    keywords: ['回款', '应收', '收款', 'payment', '到账'],
  },
  {
    name: 'receivable_summary',
    dept: 'finance',
    description: '应收汇总：应收总额、已收总额、未收余额、逾期笔数',
    params: {},
    keywords: ['应收汇总', '未收', '逾期', '汇总', '账龄'],
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export function toolMeta(name: string): ToolMeta | undefined {
  return TOOL_BY_NAME.get(name);
}

/** 部门可调用的工具白名单（management = 全部） */
export function toolsForDept(dept: DeptCode): ToolMeta[] {
  if (dept === 'management') return TOOLS;
  return TOOLS.filter((t) => t.dept === dept);
}

/** 隔离硬校验：该工具是否允许被该部门调用 */
export function isToolAllowed(toolName: string, dept: DeptCode): boolean {
  if (dept === 'management') return TOOL_BY_NAME.has(toolName);
  const t = TOOL_BY_NAME.get(toolName);
  return !!t && t.dept === dept;
}

/** 生成 OpenAI function-calling 所需的 tools 定义（仅白名单工具） */
export function buildLlmTools(dept: DeptCode) {
  return toolsForDept(dept).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: t.params,
        additionalProperties: false,
      },
    },
  }));
}
