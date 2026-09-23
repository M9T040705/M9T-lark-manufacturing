/**
 * 前端角色权限配置
 * 每个角色定义可见的菜单路径和操作权限点
 * 后端有 RBAC 细粒度权限点，前端用角色做菜单级过滤，按钮级用 v-permission 指令
 */

export type Role =
  | 'super_admin'
  | 'boss'
  | 'sales'
  | 'manager'
  | 'worker'
  | 'warehouse'
  | 'quality'
  | 'hr'
  | 'finance'
  | string;

/** 角色 → 可见菜单路径前缀（以这些路径开头的菜单可见） */
const ROLE_MENUS: Record<string, string[]> = {
  super_admin: ['*'], // 全部
  boss: ['*'], // 全部
  sales: [
    '/dashboard',
    '/crm',
    '/agent', // 智能助手全部（问答/群记录/多维表/知识库/Token统计/飞书集成）
    '/oa/approvals',
  ],
  manager: [
    '/dashboard',
    '/mes',
    '/wms',
    '/qms',
    '/agent',
    '/oa/approvals',
  ],
  worker: [
    '/mes/reports', // 只看扫码报工
    '/mes/work-orders',
    '/agent',
  ],
  warehouse: [
    '/wms',
    '/agent',
    '/oa/approvals',
  ],
  quality: [
    '/qms',
    '/agent',
    '/oa/approvals',
  ],
  hr: [
    '/oa/approvals',
    '/agent',
  ],
  finance: [
    '/dashboard',
    '/crm/orders',
    '/oa/approvals',
    '/agent',
  ],
};

/** 角色 → 系统管理菜单可见 */
const ROLE_SYSTEM: Record<string, boolean> = {
  super_admin: true,
  boss: true,
  sales: false,
  manager: false,
  worker: false,
  warehouse: false,
  quality: false,
  hr: false,
  finance: false,
};

/** 角色 → 智能体管理页可见 */
const ROLE_AGENT_ADMIN: Record<string, boolean> = {
  super_admin: true,
  boss: true,
  sales: false,
  manager: false,
  worker: false,
  warehouse: false,
  quality: false,
  hr: false,
  finance: false,
};

/** 判断当前角色是否能访问某路径 */
export function canAccess(role: string, path: string): boolean {
  const menus = ROLE_MENUS[role];
  if (!menus) return false;
  if (menus.includes('*')) return true;
  // 系统管理单独判断
  if (path.startsWith('/system')) return !!ROLE_SYSTEM[role];
  // 智能体管理单独判断
  if (path === '/agent/admin') return !!ROLE_AGENT_ADMIN[role];
  return menus.some((m) => path.startsWith(m));
}

/** 获取当前角色可见的菜单路径列表（用于菜单渲染过滤） */
export function getVisibleMenus(role: string): string[] {
  return ROLE_MENUS[role] || [];
}

/** 是否是管理员角色（可看管理类页面） */
export function isAdminRole(role: string): boolean {
  return ['super_admin', 'boss'].includes(role);
}

/** 角色中文标签 */
export const ROLE_LABELS: Record<string, string> = {
  super_admin: '超管',
  boss: '老板',
  sales: '销售',
  manager: '生产经理',
  worker: '操作工',
  warehouse: '仓管',
  quality: '质检',
  hr: '人事',
  finance: '财务',
};
