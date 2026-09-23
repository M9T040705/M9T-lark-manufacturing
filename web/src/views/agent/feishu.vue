<template>
  <div class="page-container">
    <el-row :gutter="16">
      <el-col :span="14">
        <div class="card">
          <div class="page-toolbar">
            <h3 style="margin: 0">飞书集成配置</h3>
            <div class="spacer"></div>
            <el-tag :type="cfg.enabled ? 'success' : 'info'">{{ cfg.enabled ? '已启用' : '未启用' }}</el-tag>
          </div>

          <el-form :model="cfg" label-width="130px">
            <!-- 基础配置 -->
            <el-form-item label="启用飞书">
              <el-switch v-model="cfg.enabled" />
              <span class="form-tip">关闭后所有飞书功能暂停，不影响 CRM/ERP/MES 主流程</span>
            </el-form-item>
            <el-form-item label="App ID">
              <el-input v-model="cfg.appId" placeholder="cli_xxxxxx" />
            </el-form-item>
            <el-form-item label="App Secret">
              <el-input v-model="cfg.appSecret" type="password" show-password placeholder="应用密钥" />
            </el-form-item>
            <el-form-item label="群机器人 Webhook">
              <el-input v-model="cfg.webhook" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="save">保存配置</el-button>
              <el-button @click="testWebhook">发送测试消息</el-button>
            </el-form-item>

            <el-divider content-position="left">高级配置</el-divider>

            <el-collapse v-model="activeCollapse">
              <el-collapse-item title="SSO 登录与事件回调（需公网域名）" name="advanced">
                <el-form-item label="启用网页授权 SSO">
                  <el-switch v-model="cfg.ssoEnabled" />
                </el-form-item>
                <el-form-item label="Verification Token">
                  <el-input v-model="cfg.verifyToken" placeholder="事件订阅校验 Token" />
                </el-form-item>
                <el-form-item label="Encrypt Key">
                  <el-input v-model="cfg.encryptKey" placeholder="事件加密 Key（可选）" />
                </el-form-item>
                <el-alert
                  type="info"
                  :closable="false"
                  show-icon
                  title="SSO 回调地址：http://你的域名/feishu/callback；事件回调地址：/api/feishu/event/{企业ID}。本地开发需内网穿透。"
                />
              </el-collapse-item>
            </el-collapse>
          </el-form>
        </div>
      </el-col>

      <el-col :span="10">
        <div class="card">
          <h3>接入说明</h3>
          <el-steps direction="vertical" :active="5">
            <el-step title="创建应用" description="在飞书开放平台创建「企业自建应用」，获取 App ID / App Secret" />
            <el-step title="开通权限" description="开启身份验证、通讯录、消息与机器人、多维表等权限" />
            <el-step title="配置多维表" description="在「智能体管理 → 数据源」中添加飞书多维表，智能体即可查询" />
            <el-step title="绑定部门群" description="在「智能体管理 → 部门与群」中填入各部门群的 open_chat_id" />
            <el-step title="群机器人" description="在飞书群添加自定义机器人，把 Webhook 填入左侧，用于主动推送" />
          </el-steps>
          <el-alert
            style="margin-top: 12px"
            type="warning"
            :closable="false"
            title="未配置飞书应用时，系统全部功能仍可正常使用；飞书为协同入口，不影响主流程。"
          />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getFeishuConfig, saveFeishuConfig, testFeishuWebhook } from '../../api';

const cfg = ref<any>({ enabled: false, ssoEnabled: false });
const activeCollapse = ref<string[]>([]);

async function load() {
  const data = await getFeishuConfig();
  if (data) cfg.value = { ...cfg.value, ...data };
}

async function save() {
  await saveFeishuConfig(cfg.value);
  ElMessage.success('配置已保存');
  load();
}

async function testWebhook() {
  const res: any = await testFeishuWebhook('飞书智造云：测试消息，机器人连通正常。');
  if (res?.skipped) ElMessage.warning(res.reason || '未配置 webhook');
  else ElMessage.success('已发送，请查看飞书群');
}

onMounted(load);
</script>

<style scoped>
.page-container {
  padding: 16px;
}
.card {
  background: #fff;
  border-radius: 10px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.page-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}
.spacer {
  flex: 1;
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #8f959e;
}
</style>
