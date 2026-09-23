<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 150px" @change="load">
          <el-option v-for="s in statusList" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建工单</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading" :row-class-name="rowClass">
        <el-table-column prop="woNo" label="工单号" width="150" />
        <el-table-column prop="productName" label="产品" min-width="130" />
        <el-table-column prop="qty" label="计划量" width="80" />
        <el-table-column label="完成/不良" width="110">
          <template #default="{ row }">
            <span style="color: #00b42a">{{ row.finishedQty }}</span>
            / <span :style="{ color: row.badQty ? '#f54a45' : '' }">{{ row.badQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="160">
          <template #default="{ row }">
            <el-progress :percentage="percent(row)" :status="row.status === '已完工' ? 'success' : row.overdue ? 'exception' : ''" />
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="100">
          <template #default="{ row }">{{ row.assignee?.name || '未派工' }}</template>
        </el-table-column>
        <el-table-column prop="team" label="班组" width="80" />
        <el-table-column label="计划完工" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.overdue ? '#f54a45' : '' }">{{ fmt(row.planEnd) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.overdue ? 'danger' : statusType(row.status)">
              {{ row.overdue ? '延期' : row.status === 'pending' ? '待派工' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="!!row.assigneeId" @click="openAssign(row)">派工</el-button>
            <el-button link type="success" :disabled="row.status === '已完工'" @click="openReport(row)">报工</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新建工单 -->
    <el-dialog v-model="createDialog" title="新建工单" width="520px">
      <el-form :model="form" label-width="92px">
        <el-form-item label="产品名称"><el-input v-model="form.productName" /></el-form-item>
        <el-form-item label="规格"><el-input v-model="form.spec" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="form.qty" :min="1" /></el-form-item>
        <el-form-item label="计划开始"><el-date-picker v-model="form.planStart" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="计划完工"><el-date-picker v-model="form.planEnd" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="班组"><el-input v-model="form.team" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" @click="saveWo">创建</el-button>
      </template>
    </el-dialog>

    <!-- 派工 -->
    <el-dialog v-model="assignDialog" title="派工" width="460px">
      <el-form label-width="92px">
        <el-form-item label="负责人">
          <el-select v-model="assignForm.assigneeId" filterable placeholder="选择操作工" style="width: 100%">
            <el-option v-for="u in workers" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="班组"><el-input v-model="assignForm.team" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialog = false">取消</el-button>
        <el-button type="primary" @click="doAssign">确认派工</el-button>
      </template>
    </el-dialog>

    <!-- 报工 -->
    <el-dialog v-model="reportDialog" title="扫码报工" width="480px">
      <el-alert :title="`工单 ${current?.woNo} · 计划 ${current?.qty}，已完成 ${current?.finishedQty}`" type="info" :closable="false" style="margin-bottom: 14px" />
      <el-form :model="reportForm" label-width="92px">
        <el-form-item label="工序">
          <el-select v-model="reportForm.process" allow-create filterable placeholder="选择/输入工序" style="width: 100%">
            <el-option v-for="p in (current?.order ? [] : processList)" :key="p" :label="p" :value="p" />
            <el-option v-for="p in processList" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="合格数量"><el-input-number v-model="reportForm.goodQty" :min="0" /></el-form-item>
        <el-form-item label="不良数量"><el-input-number v-model="reportForm.badQty" :min="0" /></el-form-item>
        <el-form-item label="工时(h)"><el-input-number v-model="reportForm.workHours" :min="0" /></el-form-item>
        <el-form-item label="机台"><el-input v-model="reportForm.machine" placeholder="如 CNC-01" /></el-form-item>
        <el-form-item label="原料批次"><el-input v-model="reportForm.batchNo" placeholder="扫码/录入批次" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reportDialog = false">取消</el-button>
        <el-button type="primary" @click="doReport">提交报工</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { assignWorkOrder, createWorkOrder, listUsers, listWorkOrders, reportWorkOrder } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const workers = ref<any[]>([]);
const statusFilter = ref('');
const statusList = ['pending', '生产中', '已完工', '延期'];
const processList = ['下料', '车削', '铣削', '滚齿', '磨削', '热处理', '检验'];

const createDialog = ref(false);
const form = ref<any>({ qty: 1 });
const assignDialog = ref(false);
const assignForm = ref<any>({});
const reportDialog = ref(false);
const reportForm = ref<any>({ goodQty: 0, badQty: 0, workHours: 0 });
const current = ref<any>(null);

const fmt = (d: string) => (d ? d.slice(0, 10) : '—');
const percent = (row: any) => Math.min(100, Math.round((row.finishedQty / row.qty) * 100));
function statusType(s: string) {
  return { pending: 'info', 生产中: 'warning', 已完工: 'success', 延期: 'danger' }[s] || 'info';
}
function rowClass({ row }: any) {
  return row.overdue ? 'row-overdue' : '';
}

async function load() {
  loading.value = true;
  try {
    rows.value = await listWorkOrders({ status: statusFilter.value });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { qty: 1 };
  createDialog.value = true;
}
async function saveWo() {
  if (!form.value.productName) return ElMessage.warning('请填写产品名称');
  await createWorkOrder(form.value);
  ElMessage.success('工单已创建');
  createDialog.value = false;
  load();
}

function openAssign(row: any) {
  current.value = row;
  assignForm.value = { assigneeId: '', team: row.team || '' };
  assignDialog.value = true;
}
async function doAssign() {
  if (!assignForm.value.assigneeId) return ElMessage.warning('请选择负责人');
  await assignWorkOrder(current.value.id, assignForm.value);
  ElMessage.success('派工成功');
  assignDialog.value = false;
  load();
}

function openReport(row: any) {
  current.value = row;
  reportForm.value = { goodQty: 0, badQty: 0, workHours: 0, process: '' };
  reportDialog.value = true;
}
async function doReport() {
  if (reportForm.value.goodQty <= 0 && reportForm.value.badQty <= 0) return ElMessage.warning('请填写数量');
  await reportWorkOrder(current.value.id, reportForm.value);
  ElMessage.success('报工成功，产量已回写');
  reportDialog.value = false;
  load();
}

onMounted(async () => {
  load();
  try {
    workers.value = (await listUsers()).filter((u: any) => ['worker', 'manager'].includes(u.role));
  } catch {
    workers.value = [];
  }
});
</script>

<style>
.row-overdue {
  background-color: #fff1f0 !important;
}
</style>
