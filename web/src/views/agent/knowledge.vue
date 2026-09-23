<template>
  <div class="knowledge-page">
    <el-card shadow="never">
      <div class="page-head">
        <div>
          <h2 style="margin:0">企业知识库（RAG）</h2>
          <p style="margin:4px 0 0;color:#909399;font-size:13px">
            数据源：SOP文件、飞书群消息、飞书多维表、人工录入 · 按部门隔离 · 智能体检索引用
          </p>
        </div>
        <div>
          <el-button type="primary" @click="openIngest">录入文档</el-button>
          <el-button type="success" @click="doSeed" :loading="seeding">生成示例数据</el-button>
        </div>
      </div>

      <!-- 统计卡片 -->
      <el-row :gutter="16" class="stat-row">
        <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ stats.total || 0 }}</div><div class="stat-label">知识片段总数</div></el-card></el-col>
        <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ sopCount }}</div><div class="stat-label">SOP/制度</div></el-card></el-col>
        <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ deptCount }}</div><div class="stat-label">覆盖部门</div></el-card></el-col>
        <el-col :span="6"><el-card shadow="never" class="stat-card"><div class="stat-num">{{ feishuCount }}</div><div class="stat-label">飞书数据源</div></el-card></el-col>
      </el-row>

      <!-- 检索测试 -->
      <el-card shadow="never" class="retrieve-card">
        <div class="retrieve-head">
          <h3 style="margin:0">检索测试</h3>
          <span style="color:#909399;font-size:13px;margin-left:12px">按当前登录部门自动隔离，management 可见全部</span>
        </div>
        <div class="retrieve-input">
          <el-input v-model="query" placeholder="输入问题测试知识库检索，如：新员工入职要走什么流程？" @keyup.enter="doRetrieve" clearable />
          <el-button type="primary" @click="doRetrieve" :loading="searching">检索</el-button>
        </div>
        <div v-if="retrieveResults.length" class="retrieve-results">
          <div v-for="(r, i) in retrieveResults" :key="i" class="retrieve-item">
            <div class="ri-head">
              <el-tag size="small" :type="r.score > 3 ? 'danger' : 'warning'">相关度 {{ r.score }}</el-tag>
              <span class="ri-title">{{ r.title }}</span>
              <el-tag size="small" type="info" v-if="r.sectionPath">{{ r.sectionPath }}</el-tag>
            </div>
            <div class="ri-content">{{ r.content.slice(0, 300) }}{{ r.content.length > 300 ? '...' : '' }}</div>
          </div>
        </div>
      </el-card>

      <!-- 文档列表 -->
      <el-card shadow="never" class="list-card">
        <div class="list-head">
          <h3 style="margin:0">文档片段</h3>
          <div class="list-filters">
            <el-select v-model="filterType" placeholder="来源类型" clearable size="small" style="width:140px" @change="loadList">
              <el-option label="SOP文件" value="sop_file" />
              <el-option label="飞书群消息" value="feishu_group" />
              <el-option label="飞书多维表" value="feishu_base" />
              <el-option label="人工录入" value="manual" />
            </el-select>
            <el-input v-model="filterSearch" placeholder="搜索标题" size="small" style="width:180px" clearable @change="loadList" />
          </div>
        </div>
        <el-table :data="list" v-loading="loading" stripe size="small" style="margin-top:12px">
          <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="sourceType" label="来源" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ typeLabel(row.sourceType) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="sectionPath" label="章节" width="150" show-overflow-tooltip>
            <template #default="{ row }">{{ row.sectionPath || '—' }}</template>
          </el-table-column>
          <el-table-column prop="chunkIndex" label="块" width="60" />
          <el-table-column prop="content" label="内容预览" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">{{ row.content.slice(0, 100) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" v-if="canDelete">
            <template #default="{ row }">
              <el-button size="small" type="danger" link @click="doDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-card>

    <!-- 录入文档弹窗 -->
    <el-dialog v-model="ingestVisible" title="录入知识文档" width="640px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="来源类型">
          <el-select v-model="form.sourceType">
            <el-option label="SOP文件" value="sop_file" />
            <el-option label="飞书群消息" value="feishu_group" />
            <el-option label="飞书多维表" value="feishu_base" />
            <el-option label="人工录入" value="manual" />
          </el-select>
        </el-form-item>
        <el-form-item label="来源标识"><el-input v-model="form.sourceRef" placeholder="文件名/群ID/表token（可选）" /></el-form-item>
        <el-form-item label="归属部门">
          <el-select v-model="form.departmentId" clearable placeholder="留空=全局文档">
            <el-option v-for="d in deptList" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容"><el-input v-model="form.content" type="textarea" :rows="8" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ingestVisible = false">取消</el-button>
        <el-button type="primary" @click="doIngest" :loading="ingesting">入库（自动清洗切片）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { knowledgeApi } from '../../api';
import { agentApi } from '../../api';
import { useAuthStore } from '../../store/auth';

const auth = useAuthStore();
const canDelete = computed(() => ['admin', 'super_admin'].includes(auth.role));

const loading = ref(false);
const list = ref<any[]>([]);
const stats = ref<any>({ total: 0, bySource: [], byDept: [] });
const query = ref('');
const searching = ref(false);
const retrieveResults = ref<any[]>([]);
const filterType = ref('');
const filterSearch = ref('');
const seeding = ref(false);

const ingestVisible = ref(false);
const ingesting = ref(false);
const deptList = ref<any[]>([]);
const form = reactive({ title: '', sourceType: 'manual', sourceRef: '', departmentId: null, content: '' });

const sopCount = computed(() => stats.value.bySource?.find((s: any) => s.sourceType === 'sop_file')?.count || 0);
const feishuCount = computed(() => (stats.value.bySource || []).filter((s: any) => s.sourceType.startsWith('feishu')).reduce((a: number, b: any) => a + b.count, 0));
const deptCount = computed(() => (stats.value.byDept || []).filter((d: any) => d.departmentId).length);

async function loadStats() { stats.value = await knowledgeApi.stats(); }
async function loadList() {
  loading.value = true;
  try {
    list.value = await knowledgeApi.list({ sourceType: filterType.value || undefined, search: filterSearch.value || undefined });
  } finally { loading.value = false; }
}
async function doRetrieve() {
  if (!query.value.trim()) return;
  searching.value = true;
  try { retrieveResults.value = await knowledgeApi.retrieve(query.value, 5); }
  finally { searching.value = false; }
}
function openIngest() {
  form.title = ''; form.content = ''; form.sourceRef = ''; form.departmentId = null;
  ingestVisible.value = true;
}
async function doIngest() {
  if (!form.title || !form.content) return;
  ingesting.value = true;
  try {
    await knowledgeApi.ingest({ ...form });
    ingestVisible.value = false;
    await loadList(); await loadStats();
  } finally { ingesting.value = false; }
}
async function doSeed() {
  seeding.value = true;
  try { await knowledgeApi.seed(); await loadList(); await loadStats(); }
  finally { seeding.value = false; }
}
async function doDelete(row: any) {
  await knowledgeApi.remove(row.id);
  await loadList(); await loadStats();
}
function typeLabel(t: string) {
  return { sop_file: 'SOP', feishu_group: '群消息', feishu_base: '多维表', manual: '人工' }[t] || t;
}

onMounted(async () => {
  await loadStats();
  await loadList();
  try { deptList.value = await agentApi.departments(); } catch {}
});
</script>

<style scoped>
.knowledge-page { padding: 0; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.stat-row { margin-bottom: 16px; }
.stat-card { text-align: center; padding: 8px 0; }
.stat-num { font-size: 28px; font-weight: 700; color: #409eff; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
.retrieve-card { margin-bottom: 16px; }
.retrieve-head { display: flex; align-items: center; }
.retrieve-input { display: flex; gap: 8px; margin-top: 12px; }
.retrieve-input .el-input { flex: 1; }
.retrieve-results { margin-top: 12px; }
.retrieve-item { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; }
.ri-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ri-title { font-weight: 600; font-size: 14px; }
.ri-content { color: #606266; font-size: 13px; line-height: 1.6; }
.list-head { display: flex; justify-content: space-between; align-items: center; }
.list-filters { display: flex; gap: 8px; }
</style>
