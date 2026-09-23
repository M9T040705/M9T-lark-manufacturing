<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增账号</el-button>
        <el-alert type="info" :closable="false" title="角色即权限：老板/销售/生产经理/操作工/仓管/质检/人事/财务" />
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column prop="username" label="账号" width="130" />
        <el-table-column prop="name" label="姓名" width="130" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag type="primary">{{ roleMap[row.role] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="150" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.active" @change="(v) => toggle(row, v)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" @click="resetPwd(row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialog" :title="form.id ? '编辑账号' : '新增账号'" width="480px">
      <el-form :model="form" label-width="92px">
        <el-form-item v-if="!form.id" label="账号"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="(v, k) in roleMap" :key="k" :label="v" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" placeholder="用于飞书 SSO 匹配" /></el-form-item>
        <el-form-item v-if="!form.id" label="初始密码">
          <el-input v-model="form.password" placeholder="留空默认为 123456" />
        </el-form-item>
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
import { createUser, listUsers, resetPassword, updateUser } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const dialog = ref(false);
const form = ref<any>({ role: 'worker' });
const roleMap: Record<string, string> = {
  super_admin: '超级管理员',
  boss: '老板',
  sales: '销售',
  manager: '生产经理',
  worker: '操作工',
  warehouse: '仓管',
  quality: '质检',
  hr: '人事',
  finance: '财务',
};

async function load() {
  loading.value = true;
  try {
    rows.value = await listUsers();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = { role: 'worker' };
  dialog.value = true;
}
function openEdit(row: any) {
  form.value = { ...row };
  dialog.value = true;
}

async function save() {
  if (!form.value.name || (!form.value.id && !form.value.username)) {
    return ElMessage.warning('请填写账号和姓名');
  }
  if (form.value.id) {
    await updateUser(form.value.id, { name: form.value.name, role: form.value.role, phone: form.value.phone });
  } else {
    await createUser(form.value);
  }
  ElMessage.success('保存成功');
  dialog.value = false;
  load();
}

async function toggle(row: any, active: boolean) {
  await updateUser(row.id, { active });
  ElMessage.success('已更新');
  load();
}

async function resetPwd(row: any) {
  const { value } = await ElMessageBox.prompt('请输入新密码（至少 6 位）', '重置密码', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    inputValue: '123456',
  });
  await resetPassword(row.id, value);
  ElMessage.success('密码已重置');
}

onMounted(load);
</script>
