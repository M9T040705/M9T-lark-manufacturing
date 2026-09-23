import { createRouter, createWebHistory } from 'vue-router';
import { canAccess } from '../utils/permission';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/login/index.vue'), meta: { public: true } },
  { path: '/feishu/callback', name: 'feishu-callback', component: () => import('../views/feishu/callback.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../layout/index.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/dashboard/index.vue'), meta: { title: '经营总览' } },
      { path: 'crm/customers', name: 'customers', component: () => import('../views/crm/customers.vue'), meta: { title: '客户管理' } },
      { path: 'crm/orders', name: 'orders', component: () => import('../views/crm/orders.vue'), meta: { title: '销售订单' } },
      { path: 'mes/work-orders', name: 'work-orders', component: () => import('../views/mes/work-orders.vue'), meta: { title: '工单管理' } },
      { path: 'mes/reports', name: 'reports', component: () => import('../views/mes/reports.vue'), meta: { title: '扫码报工' } },
      { path: 'wms/inventory', name: 'inventory', component: () => import('../views/wms/inventory.vue'), meta: { title: '库存查询' } },
      { path: 'wms/moves', name: 'moves', component: () => import('../views/wms/moves.vue'), meta: { title: '出入库' } },
      { path: 'qms/inspections', name: 'inspections', component: () => import('../views/qms/inspections.vue'), meta: { title: '质量检验' } },
      { path: 'oa/approvals', name: 'approvals', component: () => import('../views/oa/approvals.vue'), meta: { title: '审批中心' } },
      { path: 'system/users', name: 'users', component: () => import('../views/system/users.vue'), meta: { title: '账号权限' } },
      { path: 'agent/feishu', name: 'agent-feishu', component: () => import('../views/agent/feishu.vue'), meta: { title: '飞书集成' } },
      { path: 'agent', name: 'agent', component: () => import('../views/agent/index.vue'), meta: { title: '智能问答' } },
      { path: 'agent/group-logs', name: 'agent-group-logs', component: () => import('../views/agent/group-logs.vue'), meta: { title: '群会话记录' } },
      { path: 'agent/base-browser', name: 'agent-base-browser', component: () => import('../views/agent/base-browser.vue'), meta: { title: '多维表浏览' } },
      { path: 'agent/admin', name: 'agent-admin', component: () => import('../views/agent/admin.vue'), meta: { title: '智能体管理' } },
      { path: 'agent/knowledge', name: 'agent-knowledge', component: () => import('../views/agent/knowledge.vue'), meta: { title: '知识库' } },
      { path: 'agent/token-stats', name: 'agent-token-stats', component: () => import('../views/agent/token-stats.vue'), meta: { title: 'Token 使用统计' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = localStorage.getItem('token');
  if (!to.meta.public && !token) return '/login';
  if (to.path === '/login' && token) return '/dashboard';
  // 权限校验：已登录用户访问无权限路径 → 跳首页
  if (token && !to.meta.public) {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role && !canAccess(user.role, to.path)) {
          return '/dashboard';
        }
      } catch { /* ignore */ }
    }
  }
  return true;
});

export default router;
