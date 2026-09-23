<template>
  <div class="page-container">
    <div class="page-toolbar">
      <div class="toolbar-left">
        <span class="label">部门：</span>
        <el-select
          v-if="isAdmin"
          v-model="filterDept"
          placeholder="全部部门"
          clearable
          style="width: 180px"
          @change="loadList"
        >
          <el-option label="全部部门" value="" />
          <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.code" />
        </el-select>
        <el-tag v-else type="primary" size="default">{{ currentDept?.name }}</el-tag>
        <span class="hint">（仅可查看本部门群会话）</span>
      </div>
      <el-button @click="loadList">
        <el-icon><Refresh /></el-icon>刷新
      </el-button>
    </div>

    <div class="card">
      <el-table :data="filteredList" border stripe v-loading="loading">
        <el-table-column prop="title" label="会话" min-width="160" />
        <el-table-column label="部门" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.department?.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="questionCount" label="提问数" width="90" align="center" />
        <el-table-column prop="answerCount" label="回答数" width="90" align="center" />
        <el-table-column prop="lastQuestion" label="最后提问" min-width="220" show-overflow-tooltip />
        <el-table-column label="最后活跃" width="170">
          <template #default="{ row }">{{ fmt(row.lastActive) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openLog(row)">查看日志</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无群会话记录（部门群接入后自动产生）" :image-size="60" />
        </template>
      </el-table>
    </div>

    <!-- 日志详情抽屉 -->
    <el-drawer v-model="logDrawer" :title="logTitle" size="60%" direction="rtl">
      <div v-if="logConv" class="log-view">
        <div class="log-meta">
          <el-tag size="small">{{ logConv.department?.name }}</el-tag>
          <span class="meta-text">共 {{ logConv.messages?.length }} 条消息</span>
          <span class="meta-text">创建：{{ fmt(logConv.createdAt) }}</span>
        </div>
        <div class="log-list">
          <div
            v-for="(m, i) in logConv.messages"
            :key="i"
            class="log-item"
            :class="'role-' + m.role"
          >
            <div class="log-head">
              <el-tag size="small" :type="roleTag(m.role)">{{ roleLabel(m.role) }}</el-tag>
              <span class="log-time">{{ fmt(m.createdAt) }}</span>
              <span v-if="m.tokens" class="log-tokens">{{ m.tokens }} tokens</span>
            </div>
            <div class="log-content">{{ m.content }}</div>
            <div v-if="m.toolCalls" class="log-tools">
              <div class="tools-title">工具调用：</div>
              <div v-for="(tc, j) in parseTools(m.toolCalls)" :key="j" class="tool-call">
                <el-icon><Connection /></el-icon>
                <span class="tool-name">{{ tc.name }}</span>
                <span v-if="tc.denied" class="tool-denied">已拒绝（越权）</span>
                <span v-else class="tool-count">{{ tc.count }} 条结果</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { agentApi } from '../../api';
import { useAuthStore } from '../../store/auth';

const auth = useAuthStore();
const isAdmin = computed(() => ['boss', 'super_admin'].includes(auth.role));

const loading = ref(false);
const departments = ref<any[]>([]);
const currentDept = ref<any>(null);
const filterDept = ref('');
const list = ref<any[]>([]);

const logDrawer = ref(false);
const logConv = ref<any>(null);

const filteredList = computed(() => {
  if (!filterDept.value) return list.value;
  return list.value.filter((c) => c.department?.code === filterDept.value);
});

const logTitle = computed(() => logConv.value?.title || '会话日志');

onMounted(async () => {
  currentDept.value = await agentApi.scope();
  if (isAdmin.value) {
    departments.value = await agentApi.departments();
  }
  await loadList();
});

async function loadList() {
  loading.value = true;
  try {
    list.value = await agentApi.groupConversations();
  } finally {
    loading.value = false;
  }
}

async function openLog(row: any) {
  logConv.value = await agentApi.groupConversationMessages(row.id);
  logDrawer.value = true;
}

function fmt(t: string) {
  if (!t) return '';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function roleLabel(role: string) {
  return { user: '用户提问', assistant: 'AI 回答', tool: '工具返回' }[role] || role;
}
function roleTag(role: string) {
  return ({ user: 'primary', assistant: 'success', tool: 'info' } as any)[role] || '';
}
function parseTools(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}
</script>

<style scoped>
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.label {
  font-size: 14px;
  color: #646a73;
}
.hint {
  font-size: 12px;
  color: #8f959e;
}
.log-view {
  padding: 0 4px;
}
.log-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e6eb;
  margin-bottom: 12px;
}
.meta-text {
  font-size: 12px;
  color: #8f959e;
}
.log-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.log-item {
  border-left: 3px solid #c9cdd4;
  padding: 8px 12px;
  background: #f7f8fa;
  border-radius: 0 6px 6px 0;
}
.log-item.role-user {
  border-left-color: #3370ff;
}
.log-item.role-assistant {
  border-left-color: #0fb985;
}
.log-item.role-tool {
  border-left-color: #8f959e;
  background: #f0f1f2;
}
.log-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.log-time {
  font-size: 11px;
  color: #8f959e;
}
.log-tokens {
  font-size: 11px;
  color: #c9cdd4;
  margin-left: auto;
}
.log-content {
  font-size: 13px;
  line-height: 1.7;
  color: #1f2329;
  white-space: pre-wrap;
  word-break: break-word;
}
.log-tools {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #e5e6eb;
}
.tools-title {
  font-size: 11px;
  color: #8f959e;
  margin-bottom: 4px;
}
.tool-call {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #646a73;
  padding: 2px 0;
}
.tool-name {
  font-family: monospace;
}
.tool-denied {
  color: #f53f3f;
}
.tool-count {
  color: #0fb985;
}
</style>
