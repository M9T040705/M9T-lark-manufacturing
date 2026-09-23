<template>
  <el-container style="height: 100%">
    <el-aside width="230px" class="aside">
      <div class="logo">
        <el-icon :size="22" color="#fff"><Platform /></el-icon>
        <span>飞书智造云</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#1f2329"
        text-color="#c9cdd4"
        active-text-color="#ffffff"
      >
        <el-menu-item v-if="canAccess('/dashboard')" index="/dashboard">
          <el-icon><DataAnalysis /></el-icon><span>经营总览</span>
        </el-menu-item>
        <el-sub-menu v-if="showAgentMenu" index="agent-menu">
          <template #title><el-icon><ChatDotRound /></el-icon><span>智能助手</span></template>
          <el-menu-item v-if="canAccess('/agent')" index="/agent">智能问答</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/group-logs')" index="/agent/group-logs">群会话记录</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/base-browser')" index="/agent/base-browser">多维表浏览</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/knowledge')" index="/agent/knowledge">知识库</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/token-stats')" index="/agent/token-stats">Token 统计</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/feishu')" index="/agent/feishu">飞书集成</el-menu-item>
          <el-menu-item v-if="canAccess('/agent/admin')" index="/agent/admin">智能体管理</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showCrmMenu" index="crm">
          <template #title><el-icon><User /></el-icon><span>客户经营 CRM</span></template>
          <el-menu-item v-if="canAccess('/crm/customers')" index="/crm/customers">客户管理</el-menu-item>
          <el-menu-item v-if="canAccess('/crm/orders')" index="/crm/orders">销售订单</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showMesMenu" index="mes">
          <template #title><el-icon><Setting /></el-icon><span>生产制造 MES</span></template>
          <el-menu-item v-if="canAccess('/mes/work-orders')" index="/mes/work-orders">工单管理</el-menu-item>
          <el-menu-item v-if="canAccess('/mes/reports')" index="/mes/reports">扫码报工</el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showWmsMenu" index="wms">
          <template #title><el-icon><Box /></el-icon><span>仓储 WMS</span></template>
          <el-menu-item v-if="canAccess('/wms/inventory')" index="/wms/inventory">库存查询</el-menu-item>
          <el-menu-item v-if="canAccess('/wms/moves')" index="/wms/moves">出入库</el-menu-item>
        </el-sub-menu>
        <el-menu-item v-if="canAccess('/qms/inspections')" index="/qms/inspections">
          <el-icon><CircleCheck /></el-icon><span>质量 QMS</span>
        </el-menu-item>
        <el-menu-item v-if="canAccess('/oa/approvals')" index="/oa/approvals">
          <el-icon><Document /></el-icon><span>审批中心</span>
        </el-menu-item>
        <el-sub-menu v-if="showSystemMenu" index="system">
          <template #title><el-icon><Tools /></el-icon><span>系统</span></template>
          <el-menu-item index="/system/users">账号权限</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="title">{{ route.meta.title || '经营总览' }}</div>
        <div class="right">
          <el-tag size="small" type="info" effect="plain">{{ auth.tenant?.name }}</el-tag>
          <el-dropdown @command="onCommand">
            <span class="user">
              <el-avatar :size="28" style="background: #3370ff">{{ auth.user?.name?.[0] || 'U' }}</el-avatar>
              <span class="uname">{{ auth.user?.name }}</span>
              <el-tag size="small" type="primary">{{ roleLabel }}</el-tag>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../store/auth';
import { canAccess as checkAccess, isAdminRole, ROLE_LABELS } from '../utils/permission';

const route = useRoute();
const auth = useAuthStore();
const activeMenu = computed(() => route.path);

const roleLabel = computed(() => ROLE_LABELS[auth.role] || auth.role);
const isAdmin = computed(() => isAdminRole(auth.role));

/** 暴露给 template：当前角色是否可访问某路径 */
function canAccess(path: string): boolean {
  return checkAccess(auth.role, path);
}

/** 子菜单组是否有任意可见项 */
const showAgentMenu = computed(() =>
  ['/agent', '/agent/group-logs', '/agent/base-browser', '/agent/knowledge', '/agent/token-stats', '/agent/feishu', '/agent/admin']
    .some((p) => checkAccess(auth.role, p)),
);
const showCrmMenu = computed(() => ['/crm/customers', '/crm/orders'].some((p) => checkAccess(auth.role, p)));
const showMesMenu = computed(() => ['/mes/work-orders', '/mes/reports'].some((p) => checkAccess(auth.role, p)));
const showWmsMenu = computed(() => ['/wms/inventory', '/wms/moves'].some((p) => checkAccess(auth.role, p)));
const showSystemMenu = computed(() => checkAccess(auth.role, '/system/users'));

function onCommand(cmd: string) {
  if (cmd === 'logout') auth.logout();
}
</script>

<style scoped>
.aside {
  background: #1f2329;
  overflow-y: auto;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  padding: 0 18px;
}
.aside :deep(.el-menu) {
  border-right: none;
}
.header {
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}
.header .title {
  font-size: 16px;
  font-weight: 600;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.uname {
  font-size: 14px;
}
.main {
  background: #f5f6f7;
  padding: 0;
}
</style>
