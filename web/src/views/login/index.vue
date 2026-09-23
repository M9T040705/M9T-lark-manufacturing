<template>
  <div class="login-bg">
    <div class="login-card">
      <div class="login-logo">飞书智造云</div>
      <div class="login-sub">中小机械制造业 · CRM + ERP/MES 一体化平台</div>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @submit.prevent="onLogin">
        <el-form-item label="企业编码" prop="tenantCode">
          <el-input v-model="form.tenantCode" placeholder="演示企业编码：demo" :prefix-icon="OfficeBuilding" />
        </el-form-item>
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="如 admin" :prefix-icon="User" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="演示密码：123456" :prefix-icon="Lock" show-password @keyup.enter="onLogin" />
        </el-form-item>
        <el-button type="primary" style="width: 100%" :loading="loading" @click="onLogin">登 录</el-button>
        <div class="sso-divider"><span>或</span></div>
        <el-button class="feishu-btn" style="width: 100%" :loading="ssoLoading" @click="onFeishuLogin">
          飞书一键登录
        </el-button>
      </el-form>
      <div class="tip">
        演示账号：admin / sales01 / manager01 / worker01 / warehouse01 / quality01 / hr01 / finance01，密码均为 123456
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance } from 'element-plus';
import { OfficeBuilding, User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '../../store/auth';
import { getFeishuPublicConfig } from '../../api';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);
const ssoLoading = ref(false);
const form = ref({ tenantCode: 'demo', username: 'admin', password: '123456' });
const rules = {
  tenantCode: [{ required: true, message: '请输入企业编码', trigger: 'blur' }],
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function onLogin() {
  await formRef.value?.validate();
  loading.value = true;
  try {
    await auth.doLogin({ ...form.value });
    ElMessage.success('登录成功');
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}

// 飞书网页授权：按企业编码取 appId，再跳转飞书授权页（回调由 /feishu/callback 处理）
async function onFeishuLogin() {
  const tenantCode = form.value.tenantCode.trim();
  if (!tenantCode) {
    ElMessage.warning('请先输入企业编码');
    return;
  }
  ssoLoading.value = true;
  try {
    const cfg: any = await getFeishuPublicConfig(tenantCode);
    if (!cfg?.ssoEnabled || !cfg.appId) {
      ElMessage.warning('该企业未启用飞书登录或配置不完整，请使用账号密码登录');
      return;
    }
    const redirectUri = `${location.origin}/feishu/callback`;
    // 申请手机号/邮箱授权：员工首次登录可按手机号自动匹配系统账号并绑定 open_id；
    // 前置条件：飞书开放平台已开通 contact:user.phone:readonly / contact:user.email:readonly 并发版。
    const scope = encodeURIComponent('contact:user.phone:readonly contact:user.email:readonly');
    const url =
      `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${cfg.appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code` +
      `&state=${encodeURIComponent(tenantCode)}&scope=${scope}`;
    location.href = url;
  } finally {
    ssoLoading.value = false;
  }
}
</script>

<style scoped>
.tip {
  margin-top: 16px;
  font-size: 12px;
  color: #86909c;
  line-height: 1.6;
  text-align: center;
}
.sso-divider {
  display: flex;
  align-items: center;
  margin: 14px 0;
  color: #a0a6b0;
  font-size: 12px;
}
.sso-divider::before,
.sso-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e6eb;
}
.sso-divider span {
  padding: 0 12px;
}
.feishu-btn {
  border-color: #3370ff;
  color: #3370ff;
  background: #f0f5ff;
}
.feishu-btn:hover {
  background: #e1ecff;
}
</style>
