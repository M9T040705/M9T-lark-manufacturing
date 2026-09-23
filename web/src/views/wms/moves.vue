<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-radio-group v-model="typeFilter" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="in">入库</el-radio-button>
          <el-radio-button value="out">出库</el-radio-button>
          <el-radio-button value="pick">领料</el-radio-button>
        </el-radio-group>
        <el-button type="primary" @click="load">刷新</el-button>
        <div class="spacer"></div>
        <el-button type="success" :icon="Plus" @click="openDialog('in')">采购入库</el-button>
        <el-button type="warning" :icon="Plus" @click="openDialog('out')">销售出库</el-button>
        <el-button type="danger" :icon="Plus" @click="openDialog('pick')">生产领料</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column prop="moveNo" label="单据号" width="160" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="typeMap[row.type]?.[1]">{{ typeMap[row.type]?.[0] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="物料" min-width="180">
          <template #default="{ row }">{{ row.product?.code }} / {{ row.product?.name }}</template>
        </el-table-column>
        <el-table-column prop="qty" label="数量" width="90" />
        <el-table-column prop="batchNo" label="批次" width="120" />
        <el-table-column prop="warehouse" label="仓库" width="100" />
        <el-table-column prop="refNo" label="关联单号" width="150" />
        <el-table-column prop="remark" label="备注" min-width="120" />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" :title="typeMap[form.type]?.[0] + '操作'" width="500px">
      <el-form :model="form" label-width="92px">
        <el-form-item label="物料">
          <el-select v-model="form.productId" filterable placeholder="选择物料" style="width: 100%">
            <el-option v-for="p in products" :key="p.id" :label="`${p.code} ${p.name}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量"><el-input-number v-model="form.qty" :min="0.01" /></el-form-item>
        <el-form-item label="批次号"><el-input v-model="form.batchNo" placeholder="扫码/录入批次（领料时用于上料防错）" /></el-form-item>
        <el-form-item label="仓库"><el-input v-model="form.warehouse" placeholder="默认仓" /></el-form-item>
        <el-form-item label="关联单号"><el-input v-model="form.refNo" placeholder="如工单号/订单号（选填）" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { createStockMove, listProducts, listStockMoves } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const products = ref<any[]>([]);
const typeFilter = ref('');
const dialog = ref(false);
const form = ref<any>({ type: 'in', qty: 1, warehouse: '默认仓' });
const typeMap: Record<string, [string, string]> = {
  in: ['入库', 'success'],
  out: ['出库', 'warning'],
  pick: ['领料', 'danger'],
};

async function load() {
  loading.value = true;
  try {
    rows.value = await listStockMoves({ type: typeFilter.value });
  } finally {
    loading.value = false;
  }
}

function openDialog(type: string) {
  form.value = { type, qty: 1, warehouse: '默认仓' };
  dialog.value = true;
}

async function submit() {
  if (!form.value.productId) return ElMessage.warning('请选择物料');
  await createStockMove(form.value);
  ElMessage.success('库存已更新');
  dialog.value = false;
  load();
}

onMounted(async () => {
  load();
  products.value = await listProducts({ pageSize: 200 });
});
</script>
