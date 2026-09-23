import { PrismaClient } from '@prisma/client';
import { ToolResult } from './agent.types';

/**
 * 受控工具执行器：智能体"能做什么"的服务端实现。
 * 安全约束：
 *  - 每个查询 where 强制 tenantId（租户隔离）；
 *  - 仅 select 安全字段、take 限制条数；
 *  - 不提供任意 SQL / 写操作 / 跨租户能力；
 *  - keyword 经 Prisma 参数化（contains），status/type 等仅作为匹配值，无注入面。
 */

type P = PrismaClient;
const TAKE = 20;

const money = (v: number | null | undefined) =>
  '¥' + Math.round((v ?? 0)).toLocaleString('zh-CN');
const num = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('zh-CN');
const fd = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const bool = (v: any) => v === true || v === 'true';

function kwOr(fields: string[], keyword?: string) {
  if (!keyword) return undefined;
  return { OR: fields.map((f) => ({ [f]: { contains: keyword } })) };
}

// ---------------- 各工具执行器 ----------------

async function getOverviewKpi(prisma: P, tenantId: string): Promise<ToolResult> {
  const orderAgg = await prisma.salesOrder.aggregate({
    where: { tenantId },
    _sum: { amount: true },
    _count: true,
  });
  const woCount = await prisma.workOrder.count({ where: { tenantId } });
  const woFinished = await prisma.workOrder.count({ where: { tenantId, status: '已完工' } });
  const inspCount = await prisma.inspection.count({ where: { tenantId } });
  const defectAgg = await prisma.defect.aggregate({ where: { tenantId }, _sum: { qty: true } });
  const inv = await prisma.inventory.findMany({
    where: { tenantId },
    include: { product: true },
    take: 500,
  });
  const low = inv.filter((i) => i.qty < i.product.safetyStock);
  const payAgg = await prisma.payment.aggregate({
    where: { tenantId },
    _sum: { amount: true, paidAmount: true },
  });
  const pendingApprovals = await prisma.approval.count({ where: { tenantId, status: 'pending' } });

  const completion = woCount ? Math.round((woFinished / woCount) * 100) : 0;
  const receivable = (payAgg._sum.amount ?? 0) - (payAgg._sum.paidAmount ?? 0);

  const rows = [
    { label: '销售订单数', value: num(orderAgg._count) },
    { label: '订单总额', value: money(orderAgg._sum.amount) },
    { label: '工单完成率', value: completion + '%' + `（${woFinished}/${woCount}）` },
    { label: '检验批次', value: num(inspCount) },
    { label: '累计缺陷数', value: num(defectAgg._sum.qty) },
    { label: '低库存物料', value: num(low.length) + ' 种' },
    { label: '应收未收余额', value: money(receivable) },
    { label: '待审批单', value: num(pendingApprovals) + ' 张' },
  ];
  return {
    tool: 'get_overview_kpi',
    count: rows.length,
    rows,
    summary:
      `公司经营总览：订单 ${orderAgg._count} 张、总额 ${money(orderAgg._sum.amount)}；` +
      `工单完成率 ${completion}%；低库存物料 ${low.length} 种；` +
      `应收未收 ${money(receivable)}；待审批 ${pendingApprovals} 张。`,
  };
}

async function listCustomers(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.customer.findMany({
    where: {
      tenantId,
      ...(a.level ? { level: a.level } : {}),
      ...(kwOr(['name', 'code', 'contact'], a.keyword) || {}),
    },
    select: {
      code: true, name: true, type: true, level: true,
      settlementType: true, billingCycle: true, contact: true, phone: true,
    },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
  });
  return {
    tool: 'list_customers', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 个客户：` +
      rows.map((r) => `${r.name}（${r.level}级·${r.type === 'dealer' ? '经销商' : '终端'}，联系人 ${r.contact || '-'}）`).join('；'),
  };
}

async function listQuotes(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.quote.findMany({
    where: {
      tenantId,
      ...(a.status ? { status: a.status } : {}),
      ...(kwOr(['quoteNo', 'productName'], a.keyword) || {}),
    },
    select: {
      quoteNo: true, productName: true, spec: true, qty: true,
      unitPrice: true, amount: true, status: true,
      customer: { select: { name: true } }, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
  });
  return {
    tool: 'list_quotes', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 张报价单：` +
      rows.map((r) => `${r.quoteNo} ${r.customer.name} ${r.productName}×${num(r.qty)} 金额${money(r.amount)} 状态${r.status}`).join('；'),
  };
}

async function listOrders(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const now = new Date();
  const data = await prisma.salesOrder.findMany({
    where: {
      tenantId,
      ...(a.status ? { status: a.status } : {}),
      ...(kwOr(['orderNo', 'productName'], a.keyword) || {}),
    },
    select: {
      orderNo: true, productName: true, spec: true, qty: true, amount: true,
      deliveryDate: true, status: true, customer: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
  });
  const rows = data.map((r) => {
    const overdue = r.status !== '已完工' && r.deliveryDate && r.deliveryDate < now;
    return { ...r, overdue: !!overdue };
  });
  return {
    tool: 'list_orders', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 张销售订单：` +
      rows.map((r) => `${r.orderNo} ${r.customer.name} ${r.productName}×${num(r.qty)} 金额${money(r.amount)} 交期${fd(r.deliveryDate)} ${r.overdue ? '【已延期】' : r.status}`).join('；'),
  };
}

async function listWorkOrders(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const now = new Date();
  const data = await prisma.workOrder.findMany({
    where: {
      tenantId,
      ...(a.status ? { status: a.status } : {}),
      ...(kwOr(['woNo', 'productName'], a.keyword) || {}),
    },
    select: {
      woNo: true, productName: true, spec: true, qty: true, finishedQty: true,
      badQty: true, planStart: true, planEnd: true, status: true, team: true,
      assignee: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
  });
  const rows = data.map((r) => {
    const pct = r.qty ? Math.round((r.finishedQty / r.qty) * 100) : 0;
    const overdue = r.status !== '已完工' && r.planEnd && r.planEnd < now;
    return { ...r, progressPct: pct, overdue: !!overdue };
  });
  return {
    tool: 'list_work_orders', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 张工单：` +
      rows.map((r) => `${r.woNo} ${r.productName} 进度${r.progressPct}%（${num(r.finishedQty)}/${num(r.qty)}）负责人${r.assignee?.name || '未派工'} ${r.overdue ? '【已延期】' : r.status}`).join('；'),
  };
}

async function listWorkReports(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.workReport.findMany({
    where: { tenantId, ...(kwOr(['process', 'machine'], a.keyword) || {}) },
    select: {
      reportTime: true, process: true, workHours: true, goodQty: true,
      badQty: true, machine: true, batchNo: true,
      workOrder: { select: { woNo: true } },
      user: { select: { name: true } },
    },
    orderBy: { reportTime: 'desc' },
    take: TAKE,
  });
  return {
    tool: 'list_work_reports', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 条报工记录：` +
      rows.map((r) => `${fd(r.reportTime)} ${r.workOrder.woNo} ${r.user.name} ${r.process || ''} 合格${num(r.goodQty)} 不良${num(r.badQty)} 工时${r.workHours}`).join('；'),
  };
}

async function listBoms(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.bom.findMany({
    where: { tenantId, ...(kwOr(['bomNo'], a.keyword) || {}) },
    select: {
      bomNo: true, version: true, processRoute: true, drawing: true,
      product: { select: { name: true } },
      items: { select: { materialName: true, qty: true, unit: true, sequence: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: TAKE,
  });
  // keyword 同时匹配产品名（关系字段，内存过滤）
  const filtered = a.keyword
    ? rows.filter((r) => r.product.name.includes(a.keyword))
    : rows;
  return {
    tool: 'list_boms', count: filtered.length, rows: filtered,
    summary:
      `为你找到 ${filtered.length} 个 BOM：` +
      filtered.map((r) => `${r.bomNo} ${r.product.name} ${r.version} 工艺路线[${r.processRoute || '-'}] 物料${r.items.length}项`).join('；'),
  };
}

async function queryInventory(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const data = await prisma.inventory.findMany({
    where: { tenantId },
    include: {
      product: {
        select: { code: true, name: true, spec: true, type: true, unit: true, safetyStock: true },
      },
    },
    take: 200,
  });
  let rows = data.map((i) => ({
    code: i.product.code, name: i.product.name, spec: i.product.spec,
    type: i.product.type, unit: i.product.unit, warehouse: i.warehouse,
    batchNo: i.batchNo, qty: i.qty, safetyStock: i.product.safetyStock,
    low: i.qty < i.product.safetyStock,
  }));
  if (a.keyword) {
    rows = rows.filter(
      (r) => r.name.includes(a.keyword) || r.code.includes(a.keyword) || (r.spec || '').includes(a.keyword),
    );
  }
  if (bool(a.lowOnly)) rows = rows.filter((r) => r.low);
  rows = rows.slice(0, 50);
  return {
    tool: 'query_inventory', count: rows.length, rows,
    summary:
      (bool(a.lowOnly) ? `低于安全库存的物料有 ${rows.length} 种：` : `为你查询到 ${rows.length} 条库存：`) +
      rows.map((r) => `${r.name}${r.spec ? ' ' + r.spec : ''} 现存${num(r.qty)}${r.unit}（安全库存${r.safetyStock}）${r.low ? '【偏低】' : ''}`).join('；'),
  };
}

async function listStockMoves(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.stockMove.findMany({
    where: {
      tenantId,
      ...(a.type ? { type: a.type } : {}),
    },
    select: {
      moveNo: true, type: true, qty: true, batchNo: true, warehouse: true,
      refType: true, refNo: true, remark: true, createdAt: true,
      product: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const typeName: Record<string, string> = { in: '入库', out: '出库', pick: '领料' };
  return {
    tool: 'list_stock_moves', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 条出入库流水：` +
      rows.map((r) => `${fd(r.createdAt)} ${r.moveNo} ${typeName[r.type] || r.type} ${r.product.name}×${num(r.qty)} ${r.remark || ''}`).join('；'),
  };
}

async function listInspections(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.inspection.findMany({
    where: {
      tenantId,
      ...(a.type ? { type: a.type } : {}),
      ...(a.result ? { result: a.result } : {}),
    },
    select: {
      inspNo: true, type: true, productName: true, batchNo: true, qty: true,
      defectQty: true, result: true, remark: true, inspectTime: true,
      inspector: { select: { name: true } },
    },
    orderBy: { inspectTime: 'desc' },
    take: 30,
  });
  const typeName: Record<string, string> = { incoming: '来料检', process: '工序检', final: '成品检' };
  return {
    tool: 'list_inspections', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 条检验记录：` +
      rows.map((r) => `${r.inspNo} ${typeName[r.type] || r.type} ${r.productName} 数量${num(r.qty)} 缺陷${num(r.defectQty)} 结果${r.result === 'pass' ? '合格' : '不合格'} 检验员${r.inspector?.name || '-'}`).join('；'),
  };
}

async function listDefects(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const data = await prisma.defect.findMany({
    where: { tenantId, ...(a.closed !== undefined && a.closed !== '' ? { closed: bool(a.closed) } : {}) },
    select: {
      category: true, qty: true, handle: true, closed: true, note: true, createdAt: true,
      inspection: { select: { inspNo: true, productName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const handleName: Record<string, string> = { rework: '返工', scrap: '报废', accept: '让步接收' };
  const rows = a.keyword
    ? data.filter((r) => r.category.includes(a.keyword) || (r.note || '').includes(a.keyword))
    : data;
  return {
    tool: 'list_defects', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 条缺陷记录：` +
      rows.map((r) => `${r.inspection.inspNo} ${r.category}×${num(r.qty)} 处理${handleName[r.handle] || r.handle} ${r.closed ? '已关闭' : '未关闭'} 备注${r.note || '-'}`).join('；'),
  };
}

async function listApprovals(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const rows = await prisma.approval.findMany({
    where: {
      tenantId,
      ...(a.type ? { type: a.type } : {}),
      ...(a.status ? { status: a.status } : {}),
    },
    select: {
      type: true, title: true, status: true, createdAt: true, approvedAt: true,
      applicant: { select: { name: true } },
      approver: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return {
    tool: 'list_approvals', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 张审批单：` +
      rows.map((r) => `${r.title} 类型${r.type} 申请人${r.applicant.name} 状态${r.status === 'pending' ? '待审批' : r.status === 'approved' ? '已批准' : '已驳回'}${r.approver ? ' 审批人' + r.approver.name : ''}`).join('；'),
  };
}

async function listPayments(prisma: P, tenantId: string, a: any): Promise<ToolResult> {
  const now = new Date();
  const data = await prisma.payment.findMany({
    where: {
      tenantId,
      ...(a.status ? { status: a.status } : {}),
    },
    select: {
      period: true, amount: true, paidAmount: true, payDate: true, status: true,
      customer: { select: { name: true } },
      order: { select: { orderNo: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  const rows = data.map((r) => ({
    ...r,
    overdue: r.status !== 'paid' && !!r.payDate && r.payDate < now,
  }));
  return {
    tool: 'list_payments', count: rows.length, rows,
    summary:
      `为你找到 ${rows.length} 条回款记录：` +
      rows.map((r) => `${r.customer.name} ${r.order?.orderNo || ''} 应收${money(r.amount)} 已收${money(r.paidAmount)} ${r.overdue ? '【逾期】' : r.status === 'paid' ? '已结清' : '未结清'}`).join('；'),
  };
}

async function receivableSummary(prisma: P, tenantId: string): Promise<ToolResult> {
  const agg = await prisma.payment.aggregate({
    where: { tenantId },
    _sum: { amount: true, paidAmount: true },
    _count: true,
  });
  const now = new Date();
  const overdueCount = await prisma.payment.count({
    where: { tenantId, status: { not: 'paid' }, payDate: { lt: now } },
  });
  const total = agg._sum.amount ?? 0;
  const paid = agg._sum.paidAmount ?? 0;
  const rows = [
    { label: '应收总额', value: money(total) },
    { label: '已收总额', value: money(paid) },
    { label: '未收余额', value: money(total - paid) },
    { label: '逾期笔数', value: num(overdueCount) },
  ];
  return {
    tool: 'receivable_summary', count: rows.length, rows,
    summary:
      `应收汇总：应收总额 ${money(total)}，已收 ${money(paid)}，未收余额 ${money(total - paid)}，逾期 ${overdueCount} 笔。`,
  };
}

// ---------------- 注册表 ----------------

type Executor = (prisma: P, tenantId: string, args: any) => Promise<ToolResult>;

export const TOOL_EXECUTORS: Record<string, Executor> = {
  get_overview_kpi: (p, t) => getOverviewKpi(p, t),
  list_customers: (p, t, a) => listCustomers(p, t, a || {}),
  list_quotes: (p, t, a) => listQuotes(p, t, a || {}),
  list_orders: (p, t, a) => listOrders(p, t, a || {}),
  list_work_orders: (p, t, a) => listWorkOrders(p, t, a || {}),
  list_work_reports: (p, t, a) => listWorkReports(p, t, a || {}),
  list_boms: (p, t, a) => listBoms(p, t, a || {}),
  query_inventory: (p, t, a) => queryInventory(p, t, a || {}),
  list_stock_moves: (p, t, a) => listStockMoves(p, t, a || {}),
  list_inspections: (p, t, a) => listInspections(p, t, a || {}),
  list_defects: (p, t, a) => listDefects(p, t, a || {}),
  list_approvals: (p, t, a) => listApprovals(p, t, a || {}),
  list_payments: (p, t, a) => listPayments(p, t, a || {}),
  receivable_summary: (p, t) => receivableSummary(p, t),
};
