<template>
  <div class="cb-bg">
    <div class="cb-card">
      <Loading v-if="!errorMsg" class="spin" :size="38" color="#3370ff" />
      <h3 style="margin: 16px 0 8px">{{ errorMsg ? '飞书登录失败' : '正在登录…' }}</h3>
      <p class="cb-tip">{{ errorMsg || '正在通过飞书身份进入系统，请稍候' }}</p>
      <el-button v-if="errorMsg" type="primary" @click="backLogin">返回登录页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import { feishuSso } from '../../api';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const errorMsg = ref('');

onMounted(async () => {
  const code = route.query.code as string;
  const tenantCode = (route.query.state as string) || '';
  if (!code) {
    errorMsg.value = '未获取到飞书授权码（code），请重新发起登录。';
    return;
  }
  try {
    const data: any = await feishuSso({ code, tenantCode });
    auth.setSession(data);
    ElMessage.success('飞书登录成功');
    router.replace('/dashboard');
  } catch (e: any) {
    errorMsg.value =
      e?.response?.data?.message || e?.message || '登录失败，请改用账号密码登录。';
  }
});

function backLogin() {
  router.replace('/login');
}
</script>

<style scoped>
.cb-bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e8f0ff 0%, #f5f8ff 100%);
}
.cb-card {
  width: 380px;
  padding: 40px 32px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(51, 112, 255, 0.12);
  text-align: center;
}
.spin {
  animation: rotate 1s linear infinite;
}
.cb-tip {
  color: #86909c;
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 18px;
  word-break: break-all;
}
@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
