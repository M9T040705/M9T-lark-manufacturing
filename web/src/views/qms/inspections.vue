<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 140px" @change="load">
          <el-option label="来料检验 IQC" value="incoming" />
          <el-option label="工序检验 IPQC" value="process" />
          <el-option label="成品检验 FQC" value="final" />
        </el-select>
        <el-select v-model="resultFilter" placeholder="全部结果" clearable style="width: 130px" @change="load">
          <el-option label="合格" value="pass" />
          <el-option label="不合格" value="fail" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增检验单</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column prop="inspNo" label="检验单号" width="160" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag>{{ typeMap[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="productName" label="产品" min-width="130" />
        <el-table-column prop="batchNo" label="批次" width="120" />
        <el-table-column label="工单" width="150">
          <template #default="{ row }">{{ row.workOrder?.woNo || '—' }}</template>
        </el-table-column>
        <el-table-column prop="qty" label="检验数" width="80" />
        <el-table-column prop="defectQty" label="不良数" width="80">
          <template #default="{ row }">
            <span :style="{ color: row.defectQty ? '#f54a45' : '' }">{{ row.defectQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.result === 'pass' ? 'success' : 'danger'">{{ row.result === 'pass' ? '合格' : '不合格' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="检验员" width="100">
          <template #default="{ row }">{{ row.inspector?.name }}</template>
        </el-table-column>
        <el-table-column label="不良处理" width="110">
          <template #default="{ row }">
            <el-button v-if="row.defects?.some((d: any) => !d.closed)" link type="warning" @click="openDefect(row)">处理</el-button>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" title="新增检验单" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="检验类型">
          <el-radio-group v-model="form.type">
            <el-radio-button value="incoming">来料 IQC</el-radio-button>
            <el-radio-button value="process">工序 IPQC</el-radio-button>
            <el-radio-button value="final">成品 FQC</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关联工单">
          <el-select v-model="form.workOrderId" clearable filterable placeholder="工序/成品检验可选" style="width: 100%">
            <el-option v-for="w in workOrders" :key="w.id" :label="`${w.woNo} ${w.productName}`" :value="w.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品名称"><el-input v-model="form.productName" /></el-form-item>
        <el-form-item label="批次号"><el-input v-model="form.batchNo" /></el-form-item>
        <el-form-item label="检验数量"><el-input-number v-model="form.qty" :min="1" /></el-form-item>
        <el-form-item label="不良数量"><el-input-number v-model="form.defectQty" :min="0" /></el-form-item>
        <el-form-item label="检验结果">
          <el-radio-group v-model="form.result">
            <el-radio value="pass">合格</el-radio>
            <el-radio value="fail">不合格</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="缺陷分类">
          <el-input v-model="defectCategory" placeholder="如有不良，填写缺陷分类（如尺寸超差）" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">提交检验</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="defectDialog" title="不良处理" width="460px">
      <el-form label-width="100px">
        <el-form-item label="缺陷">
          <el-select v-model="defectForm.defectId" style="width: 100%">
            <el-option v-for="d in pendingDefects" :key="d.id" :label="`${d.category} × ${d.qty}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="处理方式">
          <el-radio-group v-model="defectForm.handle">
            <el-radio value="rework">返工</el-radio>
            <el-radio value="scrap">报废</el-radio>
            <el-radio value="accept">让步接收</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="处理说明"><el-input v-model="defectForm.note" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="defectDialog = false">取消</el-button>
        <el-button type="primary" @click="submitDefect">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { createInspection, handleDefect, listInspections, listWorkOrders } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const workOrders = ref<any[]>([]);
const typeFilter = ref('');
const resultFilter = ref('');
const dialog = ref(false);
const form = ref<any>({ type: 'incoming', qty: 1, defectQty: 0, result: 'pass' });
const defectCategory = ref('');
const typeMap: Record<string, string> = { incoming: '来料 IQC', process: '工序 IPQC', final: '成品 FQC' };

const defectDialog = ref(false);
const defectForm = ref<any>({ defectId: '', handle: 'rework', note: '' });
const pendingDefects = ref<any[]>([]);

async function load() {
  loading.value = true;
  try {
    rows.value = await listInspections({ type: typeFilter.value, result: resultFilter.value });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { type: 'incoming', qty: 1, defectQty: 0, result: 'pass' };
  defectCategory.value = '';
  dialog.value = true;
}

async function submit() {
  if (!form.value.productName) return ElMessage.warning('请填写产品名称');
  const payload: any = { ...form.value };
  if (form.value.defectQty > 0 && defectCategory.value) {
    payload.defects = [{ category: defectCategory.value, qty: form.value.defectQty, handle: 'rework' }];
  }
  await createInspection(payload);
  ElMessage.success('检验单已提交');
  dialog.value = false;
  load();
}

function openDefect(row: any) {
  pendingDefects.value = row.defects.filter((d: any) => !d.closed);
  defectForm.value = { defectId: pendingDefects.value[0]?.id, handle: 'rework', note: '' };
  defectDialog.value = true;
}

async function submitDefect() {
  if (!defectForm.value.defectId) return ElMessage.warning('请选择缺陷');
  await handleDefect(defectForm.value.defectId, { handle: defectForm.value.handle, note: defectForm.value.note, closed: true });
  ElMessage.success('已处理');
  defectDialog.value = false;
  load();
}

onMounted(async () => {
  load();
  workOrders.value = await listWorkOrders();
});
</script>
