<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 150px" @change="load">
          <el-option v-for="s in statusList" :key="s" :label="s" :value="s" />
        </el-select>
        <el-input v-model="keyword" placeholder="订单号/产品" clearable style="width: 200px" @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增订单</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column prop="orderNo" label="订单号" width="150" />
        <el-table-column label="客户" min-width="200">
          <template #default="{ row }">{{ row.customer?.name }}</template>
        </el-table-column>
        <el-table-column prop="productName" label="产品" min-width="140" />
        <el-table-column prop="spec" label="规格" width="120" />
        <el-table-column prop="qty" label="数量" width="80" />
        <el-table-column prop="amount" label="金额(元)" width="110">
          <template #default="{ row }">{{ Number(row.amount).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="deliveryDate" label="交货期" width="120">
          <template #default="{ row }">{{ fmt(row.deliveryDate) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ row.status === 'pending' ? '待生产' : row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="工单" width="90">
          <template #default="{ row }">{{ row.workOrders?.length ? row.workOrders[0].woNo : '—' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :disabled="!!row.workOrders?.length || row.status !== 'pending'"
              @click="toWorkOrder(row)"
            >转工单</el-button>
            <el-button
              link
              type="success"
              :disabled="row.status === '已发货' || row.status === '已对账'"
              @click="ship(row)"
            >发货</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" title="新增销售订单" width="560px">
      <el-form :model="form" label-width="92px">
        <el-form-item label="客户">
          <el-select v-model="form.customerId" filterable placeholder="选择客户" style="width: 100%">
            <el-option v-for="c in customers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品名称"><el-input v-model="form.productName" /></el-form-item>
        <el-form-item label="规格"><el-input v-model="form.spec" /></el-form-item>
        <el-form-item label="数量"><el-input-number v-model="form.qty" :min="1" /></el-form-item>
        <el-form-item label="单价(元)"><el-input-number v-model="form.unitPrice" :min="0" /></el-form-item>
        <el-form-item label="交货期"><el-date-picker v-model="form.deliveryDate" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { createOrder, createWoFromOrder, listCustomers, listOrders, updateOrderStatus } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const customers = ref<any[]>([]);
const keyword = ref('');
const statusFilter = ref('');
const dialog = ref(false);
const statusList = ['pending', '生产中', '已完工', '已发货', '已对账'];
const form = ref<any>({ qty: 1, unitPrice: 0 });

const fmt = (d: string) => (d ? d.slice(0, 10) : '—');
function statusType(s: string) {
  return { pending: 'info', 生产中: 'warning', 已完工: 'success', 已发货: 'success', 已对账: 'primary', 延期: 'danger' }[s] || 'info';
}

async function load() {
  loading.value = true;
  try {
    rows.value = await listOrders({ status: statusFilter.value, keyword: keyword.value });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { qty: 1, unitPrice: 0 };
  dialog.value = true;
}

async function save() {
  if (!form.value.customerId || !form.value.productName) {
    ElMessage.warning('请选择客户并填写产品名称');
    return;
  }
  await createOrder(form.value);
  ElMessage.success('订单已创建');
  dialog.value = false;
  load();
}

async function toWorkOrder(row: any) {
  const { value } = await ElMessageBox.prompt('请输入计划完工日期（YYYY-MM-DD，可留空）', '订单转工单', {
    confirmButtonText: '生成工单',
    cancelButtonText: '取消',
    inputValue: '',
  });
  await createWoFromOrder(row.id, value ? { planEnd: value } : {});
  ElMessage.success('已生成工单并派发到生产');
  load();
}

async function ship(row: any) {
  await ElMessageBox.confirm(`确认订单 ${row.orderNo} 已发货？`, '发货确认', { type: 'warning' });
  await updateOrderStatus(row.id, '已发货');
  ElMessage.success('已标记发货');
  load();
}

onMounted(async () => {
  load();
  customers.value = (await listCustomers({ pageSize: 200 })).list;
});
</script>
