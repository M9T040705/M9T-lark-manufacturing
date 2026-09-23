/**
 * 演示数据种子脚本
 * 运行：npm run setup （= prisma db push + seed）  或  npm run seed
 * 演示企业编码：demo；所有账号密码：123456
 */
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:./dev.db';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function dateOffset(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  // 清空（按依赖逆序）
  await prisma.defect.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.workReport.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.bomItem.deleteMany();
  await prisma.bom.deleteMany();
  await prisma.stockMove.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.operationLog.deleteMany();
  await prisma.agentMessage.deleteMany();
  await prisma.agentConversation.deleteMany();
  await prisma.agentDataSource.deleteMany();
  await prisma.department.deleteMany();
  await prisma.feishuConfig.deleteMany();
  await prisma.user.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.tenant.deleteMany();

  const hash = await bcrypt.hash('123456', 10);

  // 租户
  const tenant = await prisma.tenant.create({
    data: {
      code: 'demo',
      name: '精工精密机械有限公司（演示工厂）',
      plan: 'pro',
      contact: '王总',
      phone: '13800000000',
    },
  });
  const tid = tenant.id;

  // 用户（各角色）
  const userDefs = [
    ['admin', '企业老板', 'boss', '13800000001'],
    ['sales01', '李晓销售', 'sales', '13800000002'],
    ['manager01', '张工生产经理', 'manager', '13800000003'],
    ['worker01', '赵师傅操作工', 'worker', '13800000004'],
    ['worker02', '孙师傅操作工', 'worker', '13800000005'],
    ['warehouse01', '周仓管', 'warehouse', '13800000006'],
    ['quality01', '吴质检', 'quality', '13800000007'],
    ['hr01', '郑人事', 'hr', '13800000008'],
    ['finance01', '钱财务', 'finance', '13800000009'],
  ];
  const users: Record<string, string> = {};
  for (const [username, name, role, phone] of userDefs) {
    const u = await prisma.user.create({
      data: { tenantId: tid, username, name, role, phone, passwordHash: hash },
    });
    users[username] = u.id;
  }

  // 部门（数据隔离单元，也是后续部门群 / 部门多维表的挂载点）
  const deptDefs: Array<[string, string]> = [
    ['management', '总经办'],
    ['sales', '销售部'],
    ['production', '生产部'],
    ['warehouse', '仓储部'],
    ['quality', '质量部'],
    ['hr', '人事行政部'],
    ['finance', '财务部'],
  ];
  const deptIds: Record<string, string> = {};
  for (const [code, name] of deptDefs) {
    const d = await prisma.department.create({ data: { tenantId: tid, code, name } });
    deptIds[code] = d.id;
  }
  const roleDept: Record<string, string> = {
    boss: 'management',
    super_admin: 'management',
    sales: 'sales',
    manager: 'production',
    worker: 'production',
    warehouse: 'warehouse',
    quality: 'quality',
    hr: 'hr',
    finance: 'finance',
  };
  for (const [username, , role] of userDefs) {
    const dc = roleDept[role];
    if (dc) {
      await prisma.user.update({ where: { id: users[username] }, data: { departmentId: deptIds[dc] } });
    }
  }

  // 客户
  const c1 = await prisma.customer.create({
    data: { tenantId: tid, code: 'C001', name: '华锐汽车零部件有限公司', type: 'end', level: 'A', settlementType: '月结', billingCycle: '30天', contact: '刘采购', phone: '13900000001', address: '运城经开区' },
  });
  const c2 = await prisma.customer.create({
    data: { tenantId: tid, code: 'C002', name: '智远自动化设备有限公司', type: 'end', level: 'A', settlementType: '月结', billingCycle: '60天', contact: '陈工', phone: '13900000002' },
  });
  const c3 = await prisma.customer.create({
    data: { tenantId: tid, code: 'C003', name: '晋南五金经销部', type: 'dealer', level: 'B', settlementType: '现结', contact: '马经理', phone: '13900000003' },
  });

  // 产品/物料
  const raw1 = await prisma.product.create({ data: { tenantId: tid, code: 'R001', name: '45#钢棒 Φ40', spec: 'Φ40×6000', type: 'raw', unit: '根', safetyStock: 100, price: 85 } });
  const raw2 = await prisma.product.create({ data: { tenantId: tid, code: 'R002', name: '6061铝型材', spec: '40×40', type: 'raw', unit: '支', safetyStock: 80, price: 42 } });
  const raw3 = await prisma.product.create({ data: { tenantId: tid, code: 'R003', name: '304不锈钢板', spec: '2mm', type: 'raw', unit: '张', safetyStock: 50, price: 320 } });
  const f1 = await prisma.product.create({ data: { tenantId: tid, code: 'P001', name: '精密齿轮轴', spec: 'Φ20×120', type: 'finished', unit: '件', safetyStock: 30, price: 160, drawing: 'DWG-P001' } });
  const f2 = await prisma.product.create({ data: { tenantId: tid, code: 'P002', name: '法兰盘', spec: 'DN50', type: 'finished', unit: '件', safetyStock: 40, price: 75 } });
  const f3 = await prisma.product.create({ data: { tenantId: tid, code: 'P003', name: '设备连接板', spec: '200×150×8', type: 'finished', unit: '件', safetyStock: 20, price: 58 } });

  // BOM
  await prisma.bom.create({
    data: {
      tenantId: tid,
      bomNo: 'BOM-P001',
      productId: f1.id,
      version: 'V1',
      processRoute: '下料,车削,滚齿,热处理,磨削,检验',
      drawing: 'DWG-P001',
      items: {
        create: [
          { tenantId: tid, materialId: raw1.id, materialName: raw1.name, qty: 0.5, unit: '根', sequence: 1 },
          { tenantId: tid, materialId: raw3.id, materialName: raw3.name, qty: 0.1, unit: '张', sequence: 2 },
        ],
      },
    },
  });

  // 库存（含低库存预警）
  const inv = async (productId: string, qty: number, batchNo = '') =>
    prisma.inventory.create({ data: { tenantId: tid, productId, warehouse: '默认仓', qty, batchNo } });
  await inv(raw1.id, 60, 'B20260901');
  await inv(raw2.id, 30, 'B20260902'); // 低于安全库存 80
  await inv(raw3.id, 120, 'B20260903');
  await inv(f1.id, 45, '');
  await inv(f2.id, 25, ''); // 低于安全库存 40
  await inv(f3.id, 18, '');

  // 报价
  const q1 = await prisma.quote.create({
    data: { tenantId: tid, quoteNo: 'Q20260901001', customerId: c1.id, productId: f1.id, productName: f1.name, spec: f1.spec, qty: 500, unitPrice: 150, amount: 75000, status: 'ordered', ownerId: users.sales01 },
  });
  await prisma.quote.create({
    data: { tenantId: tid, quoteNo: 'Q20260910002', customerId: c2.id, productId: f3.id, productName: f3.name, spec: f3.spec, qty: 200, unitPrice: 55, amount: 11000, status: 'sent', ownerId: users.sales01 },
  });

  // 订单
  const o1 = await prisma.salesOrder.create({
    data: { tenantId: tid, orderNo: 'SO20260905001', customerId: c1.id, quoteId: q1.id, productId: f1.id, productName: f1.name, spec: f1.spec, qty: 500, unitPrice: 150, amount: 75000, deliveryDate: dateOffset(10), status: '生产中' },
  });
  const o2 = await prisma.salesOrder.create({
    data: { tenantId: tid, orderNo: 'SO20260912002', customerId: c2.id, productId: f3.id, productName: f3.name, spec: f3.spec, qty: 200, unitPrice: 55, amount: 11000, deliveryDate: dateOffset(-2), status: '生产中' },
  });
  const o3 = await prisma.salesOrder.create({
    data: { tenantId: tid, orderNo: 'SO20260820003', customerId: c3.id, productId: f2.id, productName: f2.name, spec: f2.spec, qty: 300, unitPrice: 72, amount: 21600, deliveryDate: dateOffset(-15), status: '已完工' },
  });
  // 待生产、尚未转工单的订单（用于演示一键转工单）
  await prisma.salesOrder.create({
    data: { tenantId: tid, orderNo: 'SO20260920004', customerId: c1.id, productId: f2.id, productName: f2.name, spec: f2.spec, qty: 120, unitPrice: 75, amount: 9000, deliveryDate: dateOffset(15), status: 'pending' },
  });

  // 工单
  const w1 = await prisma.workOrder.create({
    data: { tenantId: tid, woNo: 'WO20260905001', orderId: o1.id, productId: f1.id, productName: f1.name, spec: f1.spec, qty: 500, finishedQty: 320, badQty: 8, planStart: dateOffset(-8), planEnd: dateOffset(8), status: '生产中', assigneeId: users.worker01, team: '一班' },
  });
  const w2 = await prisma.workOrder.create({
    data: { tenantId: tid, woNo: 'WO20260912002', orderId: o2.id, productId: f3.id, productName: f3.name, spec: f3.spec, qty: 200, finishedQty: 60, badQty: 3, planStart: dateOffset(-6), planEnd: dateOffset(-2), status: '生产中', assigneeId: users.worker02, team: '二班' },
  });
  const w3 = await prisma.workOrder.create({
    data: { tenantId: tid, woNo: 'WO20260820003', orderId: o3.id, productId: f2.id, productName: f2.name, spec: f2.spec, qty: 300, finishedQty: 300, badQty: 5, planStart: dateOffset(-25), planEnd: dateOffset(-16), status: '已完工', assigneeId: users.worker01, team: '一班' },
  });

  // 报工
  await prisma.workReport.createMany({
    data: [
      { tenantId: tid, workOrderId: w1.id, userId: users.worker01, process: '车削', workHours: 8, goodQty: 180, badQty: 5, machine: 'CNC-01', batchNo: 'B20260901' },
      { tenantId: tid, workOrderId: w1.id, userId: users.worker01, process: '滚齿', workHours: 7, goodQty: 140, badQty: 3, machine: 'GEAR-02', batchNo: 'B20260901' },
      { tenantId: tid, workOrderId: w2.id, userId: users.worker02, process: '铣削', workHours: 6, goodQty: 60, badQty: 3, machine: 'CNC-03', batchNo: 'B20260902' },
      { tenantId: tid, workOrderId: w3.id, userId: users.worker01, process: '车削', workHours: 10, goodQty: 300, badQty: 5, machine: 'CNC-01', batchNo: 'B20260801' },
    ],
  });

  // 出入库
  await prisma.stockMove.createMany({
    data: [
      { tenantId: tid, moveNo: 'IN20260901001', type: 'in', productId: raw1.id, qty: 200, batchNo: 'B20260901', warehouse: '默认仓', operatorId: users.warehouse01, remark: '采购入库' },
      { tenantId: tid, moveNo: 'PICK20260906001', type: 'pick', productId: raw1.id, qty: 140, batchNo: 'B20260901', warehouse: '默认仓', refType: 'work_order', refNo: 'WO20260905001', operatorId: users.warehouse01, remark: '工单领料' },
      { tenantId: tid, moveNo: 'IN20260825001', type: 'in', productId: f2.id, qty: 300, warehouse: '默认仓', operatorId: users.warehouse01, remark: '成品入库' },
      { tenantId: tid, moveNo: 'OUT20260901001', type: 'out', productId: f2.id, qty: 275, warehouse: '默认仓', refType: 'sales_order', refNo: 'SO20260820003', operatorId: users.warehouse01, remark: '发货出库' },
    ],
  });

  // 检验
  const i1 = await prisma.inspection.create({
    data: { tenantId: tid, inspNo: 'IQC20260901001', type: 'incoming', productId: raw1.id, productName: raw1.name, batchNo: 'B20260901', qty: 200, defectQty: 4, result: 'pass', inspectorId: users.quality01, remark: '来料抽检' },
  });
  await prisma.defect.create({ data: { tenantId: tid, inspectionId: i1.id, category: '表面划伤', qty: 4, handle: 'accept', closed: true, note: '不影响加工，让步接收' } });
  const i2 = await prisma.inspection.create({
    data: { tenantId: tid, inspNo: 'IPQC20260908001', type: 'process', workOrderId: w1.id, productId: f1.id, productName: f1.name, batchNo: 'B20260901', qty: 180, defectQty: 5, result: 'pass', inspectorId: users.quality01, remark: '首件+巡检' },
  });
  await prisma.defect.create({ data: { tenantId: tid, inspectionId: i2.id, category: '尺寸超差', qty: 5, handle: 'rework', closed: false, note: '返工车削' } });
  await prisma.inspection.create({
    data: { tenantId: tid, inspNo: 'FQC20260828001', type: 'final', workOrderId: w3.id, productId: f2.id, productName: f2.name, qty: 300, defectQty: 5, result: 'pass', inspectorId: users.quality01, remark: '成品全检' },
  });

  // 对账回款
  const pay1 = await prisma.payment.create({
    data: { tenantId: tid, customerId: c3.id, orderId: o3.id, period: '现结', amount: 21600, paidAmount: 21600, payDate: dateOffset(-10), status: 'paid' },
  });
  await prisma.payment.create({
    data: { tenantId: tid, customerId: c1.id, orderId: o1.id, period: '30天', amount: 30000, paidAmount: 0, status: 'unpaid' },
  });

  // 审批
  await prisma.approval.create({
    data: { tenantId: tid, type: 'leave', title: '赵师傅请假 1 天', applicantId: users.worker01, status: 'pending', payload: JSON.stringify({ type: '事假', days: 1, reason: '家中有事' }) },
  });
  await prisma.approval.create({
    data: { tenantId: tid, type: 'purchase', title: '采购 45#钢棒 200 根', applicantId: users.warehouse01, status: 'pending', payload: JSON.stringify({ material: '45#钢棒', qty: 200, amount: 17000 }) },
  });
  await prisma.approval.create({
    data: { tenantId: tid, type: 'overtime', title: '一班加班 3 小时', applicantId: users.worker01, status: 'approved', approverId: users.admin, approverComment: '同意', approvedAt: new Date(), payload: JSON.stringify({ hours: 3 }) },
  });

  // 飞书配置占位（未启用）
  await prisma.feishuConfig.create({
    data: { tenantId: tid, enabled: false, ssoEnabled: false, webhook: '' },
  });

  console.log('种子数据写入完成：');
  console.log('  企业编码 demo');
  console.log('  账号：admin / sales01 / manager01 / worker01 / warehouse01 / quality01 / hr01 / finance01');
  console.log('  密码统一：123456');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
