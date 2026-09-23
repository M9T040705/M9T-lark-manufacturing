<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-radio-group v-model="lowOnly" @change="load">
          <el-radio-button :value="false">全部库存</el-radio-button>
          <el-radio-button :value="true">安全库存预警</el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="load">刷新</el-button>
      </div>

      <el-table :data="summary" border stripe v-loading="loading">
        <el-table-column prop="code" label="物料编码" width="110" />
        <el-table-column prop="name" label="物料名称" min-width="180" />
        <el-table-column prop="spec" label="规格" width="130" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="typeMap[row.type]?.[1]">{{ typeMap[row.type]?.[0] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="库存数量" width="120">
          <template #default="{ row }">
            <strong :style="{ color: row.lowStock ? '#f54a45' : '#1f2329' }">{{ row.qty }}</strong>
            {{ row.unit }}
          </template>
        </el-table-column>
        <el-table-column prop="safetyStock" label="安全库存" width="100" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="row.lowStock ? 'danger' : 'success'">{{ row.lowStock ? '库存不足' : '正常' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listInventory } from '../../api';

const loading = ref(false);
const summary = ref<any[]>([]);
const lowOnly = ref(false);
const typeMap: Record<string, [string, string]> = {
  raw: ['原料', 'warning'],
  semi: ['半成品', 'info'],
  finished: ['成品', 'success'],
};

async function load() {
  loading.value = true;
  try {
    const data: any = await listInventory({ lowOnly: lowOnly.value });
    summary.value = data.summary;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
