<template>
  <div class="page-container">
    <div class="card">
      <div class="page-toolbar">
        <el-input v-model="keyword" placeholder="搜索客户名称/编号" clearable style="width: 240px" @keyup.enter="load" />
        <el-button type="primary" @click="load">查询</el-button>
        <div class="spacer"></div>
        <el-button type="primary" :icon="Plus" @click="openCreate">新增客户</el-button>
      </div>

      <el-table :data="rows" border stripe v-loading="loading">
        <el-table-column prop="code" label="客户编号" width="110" />
        <el-table-column prop="name" label="客户名称" min-width="220" />
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag :type="row.type === 'end' ? 'primary' : 'warning'">{{ row.type === 'end' ? '终端' : '经销商' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="等级" width="70" />
        <el-table-column prop="settlementType" label="结算方式" width="100" />
        <el-table-column prop="contact" label="联系人" width="100" />
        <el-table-column prop="phone" label="电话" width="130" />
        <el-table-column prop="address" label="地址" min-width="150" />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        style="margin-top: 14px; justify-content: flex-end"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPage"
      />
    </div>

    <el-dialog v-model="dialog" :title="form.id ? '编辑客户' : '新增客户'" width="560px">
      <el-form :model="form" label-width="92px">
        <el-form-item label="客户编号"><el-input v-model="form.code" :disabled="!!form.id" /></el-form-item>
        <el-form-item label="客户名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="客户类型">
          <el-select v-model="form.type">
            <el-option label="终端客户" value="end" />
            <el-option label="经销商" value="dealer" />
          </el-select>
        </el-form-item>
        <el-form-item label="客户等级">
          <el-select v-model="form.level">
            <el-option v-for="l in ['A', 'B', 'C']" :key="l" :label="l + ' 类'" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式"><el-input v-model="form.settlementType" placeholder="如 月结 / 现结" /></el-form-item>
        <el-form-item label="对账周期"><el-input v-model="form.billingCycle" placeholder="如 30天" /></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="地址"><el-input v-model="form.address" /></el-form-item>
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
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { createCustomer, listCustomers, updateCustomer } from '../../api';

const loading = ref(false);
const rows = ref<any[]>([]);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const dialog = ref(false);
const form = ref<any>({ type: 'end', level: 'B' });

async function load() {
  loading.value = true;
  try {
    const data: any = await listCustomers({ keyword: keyword.value, page: page.value, pageSize: pageSize.value });
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function onPage(p: number) {
  page.value = p;
  load();
}

function openCreate() {
  form.value = { type: 'end', level: 'B' };
  dialog.value = true;
}
function openEdit(row: any) {
  form.value = { ...row };
  dialog.value = true;
}

async function save() {
  if (!form.value.code || !form.value.name) {
    ElMessage.warning('请填写客户编号和名称');
    return;
  }
  if (form.value.id) {
    await updateCustomer(form.value.id, form.value);
  } else {
    await createCustomer(form.value);
  }
  ElMessage.success('保存成功');
  dialog.value = false;
  load();
}

onMounted(load);
</script>
