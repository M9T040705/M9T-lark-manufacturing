<template>
  <div class="page-container">
    <div class="page-toolbar">
      <div class="toolbar-left">
        <span class="label">多维表：</span>
        <el-select
          v-model="selectedId"
          placeholder="选择要浏览的多维表"
          style="width: 280px"
          @change="loadRecords"
        >
          <el-option
            v-for="ds in dataSources"
            :key="ds.id"
            :label="ds.name + (ds.department ? '（' + ds.department.name + '）' : '')"
            :value="ds.id"
          />
        </el-select>
        <el-button @click="loadRecords" :disabled="!selectedId || loading">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
      <div v-if="result" class="toolbar-right">
        <el-tag size="small">{{ result.dataSource?.department?.name || '全局' }}</el-tag>
        <span class="count">共 {{ result.total }} 条记录</span>
      </div>
    </div>

    <div class="card">
      <el-table
        v-if="result?.fields?.length"
        :data="result.rows"
        border
        stripe
        v-loading="loading"
        max-height="600"
      >
        <el-table-column
          v-for="f in result.fields"
          :key="f"
          :prop="f"
          :label="f"
          min-width="140"
          show-overflow-tooltip
        />
      </el-table>
      <el-empty v-else-if="!loading" description="请选择一个多维表进行浏览" :image-size="80" />
    </div>

    <el-alert
      v-if="error"
      type="error"
      :closable="false"
      style="margin-top: 12px"
      :title="error"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { agentApi } from '../../api';

const dataSources = ref<any[]>([]);
const selectedId = ref('');
const result = ref<any>(null);
const loading = ref(false);
const error = ref('');

onMounted(async () => {
  dataSources.value = await agentApi.visibleDataSources();
  if (dataSources.value.length) {
    selectedId.value = dataSources.value[0].id;
    await loadRecords();
  }
});

async function loadRecords() {
  if (!selectedId.value) return;
  loading.value = true;
  error.value = '';
  try {
    result.value = await agentApi.browseDataSource(selectedId.value);
  } catch (e: any) {
    error.value = e?.message || '读取失败';
    result.value = null;
    ElMessage.error('读取多维表失败：' + (e?.message || e));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.label {
  font-size: 14px;
  color: #646a73;
}
.count {
  font-size: 13px;
  color: #646a73;
}
</style>
