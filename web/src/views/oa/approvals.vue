<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-radio-group v-model="scope" @change="load">
          <el-radio-button value="all">待我审批 / 全部</el-radio-button>
          <el-radio-button value="mine">我发起的</el-radio-button>
        </el-radio-group>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px" @change="load">
          <el-option label="待审批" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">发起审批</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="typeMap[row.type]?.[1]">{{ typeMap[row.type]?.[0] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="事由" min-width="220" />
        <el-table-column label="申请人" width="110">
          <template #default="{ row }">{{ row.applicant?.name }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]?.[1]">{{ statusMap[row.status]?.[0] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="审批人" width="110">
          <template #default="{ row }">{{ row.approver?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="发起时间" width="170">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending' && canApprove">
              <el-button link type="success" @click="decide(row, 'approve')">通过</el-button>
              <el-button link type="danger" @click="decide(row, 'reject')">驳回</el-button>
            </template>
            <span v-else>—</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" title="发起审批" width="500px">
      <el-form :model="form" label-width="92px">
        <el-form-item label="审批类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="(v, k) in typeMap" :key="k" :label="v[0]" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="事由"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="明细">
          <el-input v-model="detail" type="textarea" :rows="3" placeholder="如：事假 1 天、采购数量金额等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { approveApproval, createApproval, listApprovals, rejectApproval } from '../../api';
import { useAuthStore } from '../../store/auth';

const auth = useAuthStore();
const loading = ref(false);
const rows = ref<any[]>([]);
const scope = ref('all');
const statusFilter = ref('');
const dialog = ref(false);
const form = ref<any>({ type: 'leave', title: '' });
const detail = ref('');

const typeMap: Record<string, [string, string]> = {
  leave: ['请假', 'warning'],
  overtime: ['加班', 'primary'],
  purchase: ['采购', 'success'],
  pick: ['领料', 'info'],
  scrap: ['报废', 'danger'],
  order_change: ['订单变更', 'info'],
  expense: ['费用报销', 'primary'],
};
const statusMap: Record<string, [string, string]> = {
  pending: ['待审批', 'warning'],
  approved: ['已通过', 'success'],
  rejected: ['已驳回', 'danger'],
};
const canApprove = computed(() => ['boss', 'manager', 'hr', 'super_admin'].includes(auth.role));

async function load() {
  loading.value = true;
  try {
    rows.value = await listApprovals({ status: statusFilter.value, scope: scope.value });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { type: 'leave', title: '' };
  detail.value = '';
  dialog.value = true;
}

async function submit() {
  if (!form.value.title) return ElMessage.warning('请填写事由');
  await createApproval({ ...form.value, payload: { detail: detail.value } });
  ElMessage.success('审批已提交');
  dialog.value = false;
  load();
}

async function decide(row: any, action: 'approve' | 'reject') {
  const { value } = await ElMessageBox.prompt('请输入审批意见（可留空）', action === 'approve' ? '通过审批' : '驳回审批', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
  });
  if (action === 'approve') await approveApproval(row.id, value);
  else await rejectApproval(row.id, value);
  ElMessage.success(action === 'approve' ? '已通过' : '已驳回');
  load();
}

onMounted(load);
</script>
