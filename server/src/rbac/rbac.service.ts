import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 系统内置权限点
const BUILTIN_PERMISSIONS = [
  // CRM
  { code: 'crm:customer:view', name: '查看客户', module: 'crm', type: 'data' },
  { code: 'crm:customer:create', name: '创建客户', module: 'crm', type: 'button' },
  { code: 'crm:customer:edit', name: '编辑客户', module: 'crm', type: 'button' },
  { code: 'crm:customer:delete', name: '删除客户', module: 'crm', type: 'button' },
  { code: 'crm:order:view', name: '查看订单', module: 'crm', type: 'data' },
  { code: 'crm:order:create', name: '创建订单', module: 'crm', type: 'button' },
  { code: 'crm:quote:view', name: '查看报价', module: 'crm', type: 'data' },
  { code: 'crm:payment:view', name: '查看回款', module: 'crm', type: 'data' },
  // MES
  { code: 'mes:product:view', name: '查看产品', module: 'mes', type: 'data' },
  { code: 'mes:product:edit', name: '编辑产品', module: 'mes', type: 'button' },
  { code: 'mes:bom:view', name: '查看BOM', module: 'mes', type: 'data' },
  { code: 'mes:workorder:view', name: '查看工单', module: 'mes', type: 'data' },
  { code: 'mes:workorder:create', name: '创建工单', module: 'mes', type: 'button' },
  { code: 'mes:workorder:report', name: '报工', module: 'mes', type: 'button' },
  // WMS
  { code: 'wms:inventory:view', name: '查看库存', module: 'wms', type: 'data' },
  { code: 'wms:stockmove:create', name: '出入库操作', module: 'wms', type: 'button' },
  // QMS
  { code: 'qms:inspection:view', name: '查看检验', module: 'qms', type: 'data' },
  { code: 'qms:inspection:create', name: '创建检验', module: 'qms', type: 'button' },
  { code: 'qms:defect:handle', name: '缺陷处理', module: 'qms', type: 'button' },
  // OA
  { code: 'oa:approval:view', name: '查看审批', module: 'oa', type: 'data' },
  { code: 'oa:approval:create', name: '发起审批', module: 'oa', type: 'button' },
  { code: 'oa:approval:approve', name: '审批操作', module: 'oa', type: 'button' },
  // 系统
  { code: 'system:user:manage', name: '用户管理', module: 'system', type: 'menu' },
  { code: 'system:tenant:manage', name: '租户管理', module: 'system', type: 'menu' },
  { code: 'system:audit:view', name: '审计日志', module: 'system', type: 'menu' },
  { code: 'system:dict:manage', name: '数据字典', module: 'system', type: 'menu' },
  { code: 'system:file:manage', name: '文件管理', module: 'system', type: 'menu' },
  // 智能体
  { code: 'agent:chat', name: '智能体对话', module: 'agent', type: 'api' },
  { code: 'agent:knowledge:manage', name: '知识库管理', module: 'agent', type: 'menu' },
  { code: 'agent:token:view', name: 'Token统计', module: 'agent', type: 'menu' },
  { code: 'agent:grouplogs:view', name: '群会话记录', module: 'agent', type: 'menu' },
];

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // 初始化内置权限点
    for (const p of BUILTIN_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: p.code },
        update: {},
        create: p,
      });
    }
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  listRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: { tenantId },
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createRole(tenantId: string, dto: { code: string; name: string; remark?: string; permissionCodes?: string[] }) {
    const role = await this.prisma.role.create({ data: { tenantId, code: dto.code, name: dto.name, remark: dto.remark || null } });
    if (dto.permissionCodes?.length) {
      const perms = await this.prisma.permission.findMany({ where: { code: { in: dto.permissionCodes } } });
      await this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
      });
    }
    return role;
  }

  async updateRole(tenantId: string, id: string, dto: { name?: string; remark?: string; permissionCodes?: string[] }) {
    if (dto.name !== undefined || dto.remark !== undefined) {
      await this.prisma.role.updateMany({ where: { id, tenantId }, data: { name: dto.name, remark: dto.remark } });
    }
    if (dto.permissionCodes) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      const perms = await this.prisma.permission.findMany({ where: { code: { in: dto.permissionCodes } } });
      if (perms.length) {
        await this.prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: id, permissionId: p.id })) });
      }
    }
    return { success: true };
  }

  async getUserPermissions(tenantId: string, roleCode: string): Promise<Set<string>> {
    const role = await this.prisma.role.findFirst({
      where: { tenantId, code: roleCode },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return new Set();
    return new Set(role.permissions.map((rp) => rp.permission.code));
  }

  async hasPermission(tenantId: string, roleCode: string, permissionCode: string): Promise<boolean> {
    if (roleCode === 'super_admin') return true;
    const perms = await this.getUserPermissions(tenantId, roleCode);
    return perms.has(permissionCode);
  }
}
