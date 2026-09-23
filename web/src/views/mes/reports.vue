<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-button type="primary" @click="load">刷新</el-button>
        <div class="spacer"></div>
        <el-alert type="info" :closable="false" title="扫码报工数据实时汇总，产量自动回写工单与个人绩效" />
      </div>
      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column label="报工时间" width="170">
          <template #default="{ row }">{{ new Date(row.reportTime).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column label="工单" width="150">
          <template #default="{ row }">{{ row.workOrder?.woNo }}</template>
        </el-table-column>
        <el-table-column label="产品" min-width="140">
          <template #default="{ row }">{{ row.workOrder?.productName }}</template>
        </el-table-column>
        <el-table-column prop="process" label="工序" width="100" />
        <el-table-column prop="machine" label="机台" width="100" />
        <el-table-column prop="batchNo" label="原料批次" width="130" />
        <el-table-column label="操作人" width="110">
          <template #default="{ row }">{{ row.user?.name }}</template>
        </el-table-column>
        <el-table-column prop="workHours" label="工时(h)" width="90" />
        <el-table-column label="合格" width="90">
          <template #default="{ row }"><span style="color: #00b42a">{{ row.goodQty }}</span></template>
        </el-table-column>
        <el-table-column label="不良" width="90">
          <template #default="{ row }"><span :style="{ color: row.badQty ? '#f54a45' : '' }">{{ row.badQty }}</span></template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listWorkReports } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);

async function load() {
  loading.value = true;
  try {
    rows.value = await listWorkReports();
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
