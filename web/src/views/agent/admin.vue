<template>
  <div class="page-container">
    <el-alert type="info" :closable="false" class="tip">
      <template #title>
        部门是数据隔离单元。后续建好「部门群 / 部门多维表」后，把对应标识填入即可生效，无需改代码：
        群 open_chat_id（形如 oc_xxx，把机器人拉入群后获取）；多维表 app_token / table_id（打开多维表，网址 /base/{app_token}/table/{table_id}）。
      </template>
    </el-alert>

    <el-tabs v-model="tab" class="card">
      <!-- ============ 部门与群 ============ -->
      <el-tab-pane label="部门与群配置" name="dept">
        <div class="page-toolbar">
          <el-button type="primary" @click="openDept(null)">新增部门</el-button>
        </div>
        <el-table :data="departments" border stripe>
          <el-table-column prop="code" label="部门编码" width="110" />
          <el-table-column prop="name" label="部门名称" width="130" />
          <el-table-column label="部门群" width="110">
            <template #default="{ row }">
              <el-tag :type="row.feishuChatId ? 'success' : 'info'" size="small">
                {{ row.feishuChatId ? '已绑定' : '未绑定' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="群机器人" width="100">
            <template #default="{ row }">
              <el-tag :type="row.feishuWebhook ? 'success' : 'info'" size="small">
                {{ row.feishuWebhook ? '已配置' : '未配置' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="用户数" width="80">
            <template #default="{ row }">{{ row._count?.users }}</template>
          </el-table-column>
          <el-table-column label="数据源数" width="90">
            <template #default="{ row }">{{ row._count?.dataSources }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.active ? 'success' : 'danger'" size="small">
                {{ row.active ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDept(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ============ 数据源 / 多维表 ============ -->
      <el-tab-pane label="数据源（多维表）" name="ds">
        <div class="page-toolbar">
          <el-button type="primary" @click="openDs(null)">新增数据源</el-button>
        </div>
        <el-table :data="dataSources" border stripe>
          <el-table-column prop="name" label="数据源名称" min-width="150" />
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.type === 'FEISHU_BASE' ? 'warning' : ''">{{ typeLabel(row.type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="所属部门" width="120">
            <template #default="{ row }">{{ row.department?.name || '全局' }}</template>
          </el-table-column>
          <el-table-column prop="feishuAppToken" label="app_token" min-width="140">
            <template #default="{ row }">{{ row.feishuAppToken || '-' }}</template>
          </el-table-column>
          <el-table-column prop="feishuTableId" label="table_id" width="120">
            <template #default="{ row }">{{ row.feishuTableId || '-' }}</template>
          </el-table-column>
          <el-table-column prop="feishuViewId" label="view_id" width="110">
            <template #default="{ row }">{{ row.feishuViewId || '-' }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
                {{ row.enabled ? '启用' : '停用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDs(row)">编辑</el-button>
              <el-button link type="danger" @click="removeDs(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 部门编辑 -->
    <el-dialog v-model="deptDialog" :title="deptForm.id ? '编辑部门' : '新增部门'" width="520px">
      <el-form :model="deptForm" label-width="120px">
        <el-form-item label="部门编码">
          <el-input v-model="deptForm.code" :disabled="!!deptForm.id" placeholder="如 production" />
        </el-form-item>
        <el-form-item label="部门名称">
          <el-input v-model="deptForm.name" placeholder="如 生产部" />
        </el-form-item>
        <el-form-item label="部门群 chat_id">
          <el-input v-model="deptForm.feishuChatId" placeholder="oc_xxx（后续建群后填）" />
        </el-form-item>
        <el-form-item label="部门群 webhook">
          <el-input v-model="deptForm.feishuWebhook" placeholder="部门群机器人 webhook（可选）" />
        </el-form-item>
        <el-form-item label="负责人 userId">
          <el-input v-model="deptForm.managerId" placeholder="可选" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="deptForm.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDept">保存</el-button>
      </template>
    </el-dialog>

    <!-- 数据源编辑 -->
    <el-dialog v-model="dsDialog" :title="dsForm.id ? '编辑数据源' : '新增数据源'" width="560px">
      <el-form :model="dsForm" label-width="120px">
        <el-form-item label="数据源名称">
          <el-input v-model="dsForm.name" placeholder="如 生产部-生产计划智能表" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="dsForm.type">
            <el-option label="飞书多维表 FEISHU_BASE" value="FEISHU_BASE" />
            <el-option label="业务库 BIZ_DB" value="BIZ_DB" />
            <el-option label="文档 DOC（预留）" value="DOC" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属部门">
          <el-select v-model="dsForm.departmentId" clearable placeholder="不选为全局（仅总经办可见）">
            <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <template v-if="dsForm.type === 'FEISHU_BASE'">
          <el-form-item label="app_token">
            <el-input v-model="dsForm.feishuAppToken" placeholder="多维表 app_token" />
          </el-form-item>
          <el-form-item label="table_id">
            <el-input v-model="dsForm.feishuTableId" placeholder="table_id" />
          </el-form-item>
          <el-form-item label="view_id">
            <el-input v-model="dsForm.feishuViewId" placeholder="可选，限定视图" />
          </el-form-item>
          <el-form-item label="业务主键字段">
            <el-input v-model="dsForm.syncKeyField" placeholder="可选，用于回写/对齐" />
          </el-form-item>
        </template>
        <el-form-item label="启用">
          <el-switch v-model="dsForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dsDialog = false">取消</el-button>
        <el-button type="primary" @click="saveDs">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { agentApi } from '../../api';

const tab = ref('dept');
const departments = ref<any[]>([]);
const dataSources = ref<any[]>([]);

const deptDialog = ref(false);
const deptForm = ref<any>({});
const dsDialog = ref(false);
const dsForm = ref<any>({});

onMounted(loadAll);

async function loadAll() {
  departments.value = await agentApi.departments();
  dataSources.value = await agentApi.dataSources();
}

function typeLabel(t: string) {
  return { FEISHU_BASE: '飞书多维表', BIZ_DB: '业务库', DOC: '文档' }[t] || t;
}

function openDept(row: any) {
  deptForm.value = row
    ? { ...row }
    : { code: '', name: '', feishuChatId: '', feishuWebhook: '', managerId: '', active: true };
  deptDialog.value = true;
}

async function saveDept() {
  const f = deptForm.value;
  if (!f.code || !f.name) return ElMessage.warning('请填写部门编码与名称');
  if (f.id) await agentApi.updateDepartment(f.id, f);
  else await agentApi.createDepartment(f);
  deptDialog.value = false;
  ElMessage.success('已保存');
  await loadAll();
}

function openDs(row: any) {
  dsForm.value = row
    ? { ...row }
    : {
        name: '', type: 'FEISHU_BASE', departmentId: '', enabled: true,
        feishuAppToken: '', feishuTableId: '', feishuViewId: '', syncKeyField: '', config: '',
      };
  dsDialog.value = true;
}

async function saveDs() {
  const f = dsForm.value;
  if (!f.name) return ElMessage.warning('请填写数据源名称');
  if (f.type === 'FEISHU_BASE' && (!f.feishuAppToken || !f.feishuTableId)) {
    return ElMessage.warning('飞书多维表需填写 app_token 与 table_id');
  }
  if (f.id) await agentApi.updateDataSource(f.id, f);
  else await agentApi.createDataSource(f);
  dsDialog.value = false;
  ElMessage.success('已保存');
  await loadAll();
}

async function removeDs(row: any) {
  await ElMessageBox.confirm(`确认删除数据源「${row.name}」？`, '提示', { type: 'warning' });
  await agentApi.removeDataSource(row.id);
  ElMessage.success('已删除');
  await loadAll();
}
</script>

<style scoped>
.tip {
  margin-bottom: 12px;
}
</style>
