<template>
  <div class="agent-page">
    <!-- 会话历史 -->
    <div class="side">
      <el-button type="primary" class="new-btn" @click="newConversation">+ 新会话</el-button>
      <el-scrollbar class="conv-list">
        <div
          v-for="c in conversations"
          :key="c.id"
          class="conv-item"
          :class="{ active: c.id === conversationId }"
          @click="switchConversation(c.id)"
        >
          <div class="conv-title">{{ c.title || '（无标题）' }}</div>
          <div class="conv-dept">{{ c.department?.name || '' }}</div>
        </div>
        <el-empty v-if="!conversations.length" description="暂无会话" :image-size="60" />
      </el-scrollbar>
    </div>

    <!-- 对话主区 -->
    <div class="chat">
      <div class="chat-head">
        <div class="head-line">
          <el-tag size="small" type="primary">{{ scope?.name || '部门' }}</el-tag>
          <span class="provider">数据模式：{{ provider }}</span>
          <div class="think-switch">
            <el-switch
              v-model="enableThinking"
              size="small"
              active-text="深度思考"
              inline-prompt
              @change="onThinkToggle"
            />
          </div>
        </div>
        <div class="scope-desc">可查询范围：{{ scope?.scopeDesc }}</div>
      </div>

      <el-scrollbar ref="msgScroll" class="msg-wrap" view-class="msg-view">
        <div class="msg-inner">
          <div v-if="!messages.length" class="welcome">
            <el-icon :size="34" color="#3370ff"><ChatDotRound /></el-icon>
            <div class="welcome-title">你好，我是部门数据助手</div>
            <div class="welcome-sub">我只能查询「{{ scope?.name }}」职责范围内的数据，试试下面的问题：</div>
          </div>

          <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
            <el-avatar :size="32" :style="{ background: m.role === 'user' ? '#3370ff' : '#0fb985' }">
              {{ m.role === 'user' ? (auth.user?.name?.[0] || 'U') : 'AI' }}
            </el-avatar>
            <div class="bubble-box">
              <div v-if="m.role === 'assistant' && m.intent" class="intent-row">
                <el-tag size="small" effect="plain" :type="intentType(m.intent?.intent)">
                  {{ intentLabel(m.intent?.intent) }}
                </el-tag>
                <span v-if="m.intent?.summary" class="intent-summary">{{ m.intent.summary }}</span>
              </div>
              <div class="bubble">{{ m.content }}</div>
              <div v-if="Array.isArray(m.toolCalls) && m.toolCalls.length" class="tools">
                <el-icon><Connection /></el-icon>
                <span v-for="(t, j) in m.toolCalls" :key="j" class="tool-tag">
                  {{ t.denied ? '已拒绝: ' + (t.name || '未知') : (t.name || '未知') + '(' + (t.count ?? 0) + ')' }}
                </span>
              </div>
              <!-- 思考记录（可折叠） -->
              <div v-if="m.thinking" class="thinking-block">
                <div class="thinking-toggle" @click="m._showThinking = !m._showThinking">
                  <el-icon class="caret" :class="{ open: m._showThinking }"><CaretRight /></el-icon>
                  <span>思考过程</span>
                  <span class="thinking-hint">{{ m._showThinking ? '收起' : '展开' }}</span>
                </div>
                <div v-show="m._showThinking" class="thinking-content">{{ m.thinking }}</div>
              </div>
              <!-- 执行轨迹（可折叠时间线） -->
              <div v-if="m.trace?.length" class="trace-block">
                <div class="thinking-toggle" @click="m._showTrace = !m._showTrace">
                  <el-icon class="caret" :class="{ open: m._showTrace }"><CaretRight /></el-icon>
                  <span>执行轨迹（{{ m.trace.length }}步）</span>
                  <span class="thinking-hint">{{ m._showTrace ? '收起' : '展开' }}</span>
                </div>
                <div v-show="m._showTrace" class="trace-content">
                  <div v-for="(t, j) in m.trace" :key="j" class="trace-item">
                    <div class="trace-dot" :class="t.type"></div>
                    <div class="trace-body">
                      <div class="trace-head">
                        <span class="trace-label">{{ t.label }}</span>
                        <span class="trace-ms">{{ t.ms }}ms</span>
                      </div>
                      <div v-if="t.summary" class="trace-summary">{{ t.summary }}</div>
                      <div v-if="t.sources?.length" class="trace-sources">
                        <div v-for="(s, k) in t.sources" :key="k" class="trace-source">
                          📄 {{ s.title }} (相关度 {{ s.score }})
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="loading" class="msg assistant">
            <el-avatar :size="32" style="background:#0fb985">AI</el-avatar>
            <div class="bubble thinking">{{ enableThinking ? '正在深度思考并查询数据…' : '正在查询数据…' }}</div>
          </div>
        </div>
      </el-scrollbar>

      <div class="quick" v-if="scope?.examples?.length">
        <el-tag
          v-for="(e, i) in scope.examples"
          :key="i"
          class="quick-tag"
          effect="plain"
          @click="send(e)"
        >
          {{ e }}
        </el-tag>
      </div>

      <div class="input-bar">
        <el-input
          v-model="input"
          :placeholder="enableThinking ? '深度思考模式已开启，Enter 发送' : '输入你的问题，Enter 发送'"
          clearable
          :disabled="loading"
          @keydown.enter="onEnter"
        />
        <el-button type="primary" :loading="loading" @click="send()">发送</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { agentApi } from '../../api';
import { useAuthStore } from '../../store/auth';

const auth = useAuthStore();

const scope = ref<any>(null);
const conversations = ref<any[]>([]);
const messages = ref<any[]>([]);
const conversationId = ref<string | null>(null);
const input = ref('');
const loading = ref(false);
const provider = ref('rule-based');
const msgScroll = ref<any>(null);

// 深度思考开关（持久化到 localStorage）
const enableThinking = ref(localStorage.getItem('agent_thinking') === '1');

function onThinkToggle(v: boolean) {
  localStorage.setItem('agent_thinking', v ? '1' : '0');
}

onMounted(async () => {
  scope.value = await agentApi.scope();
  conversations.value = await agentApi.conversations();
});

function scrollBottom() {
  nextTick(() => {
    const wrap = msgScroll.value?.wrapRef;
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  });
}

function newConversation() {
  conversationId.value = null;
  messages.value = [];
  input.value = '';
}

async function switchConversation(id: string) {
  conversationId.value = id;
  const detail = await agentApi.conversation(id);
  messages.value = (detail?.messages || [])
    .filter((m: any) => m.role === 'user' || m.role === 'assistant')
    .map((m: any) => ({
      ...m,
      intent: m.intent ? safeParse(m.intent) : null,
      trace: m.trace ? safeParse(m.trace) : null,
      toolCalls: parseToolCalls(m.toolCalls),
      _showThinking: false,
      _showTrace: false,
    }));
  scrollBottom();
}

function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return;
  e.preventDefault();
  send();
}

async function send(quickText?: string) {
  const text = (quickText ?? input.value).trim();
  if (!text || loading.value) return;
  messages.value.push({ role: 'user', content: text });
  input.value = '';
  loading.value = true;
  scrollBottom();
  try {
    const res = await agentApi.chat({
      message: text,
      conversationId: conversationId.value || undefined,
      thinking: enableThinking.value,
    });
    conversationId.value = res.conversationId;
    messages.value.push({
      role: 'assistant',
      content: res.content,
      toolCalls: res.toolCalls,
      thinking: res.thinking,
      intent: res.intent,
      trace: res.trace,
      _showThinking: false,
      _showTrace: false,
    });
    provider.value = res.provider;
    conversations.value = await agentApi.conversations();
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: '出错了：' + (e?.message || '请稍后重试') });
  } finally {
    loading.value = false;
    scrollBottom();
  }
}

function intentLabel(intent?: string) {
  return ({ query: '数据查询', stats: '统计分析', create: '创建请求', action: '操作请求', chitchat: '闲聊', unclear: '待明确' } as any)[intent || ''] || '查询';
}
function intentType(intent?: string) {
  return ({ query: 'primary', stats: 'warning', create: 'success', action: 'danger', chitchat: 'info', unclear: 'info' } as any)[intent || ''] || '';
}
function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
function parseToolCalls(v: any): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}
</script>

<style scoped>
.agent-page {
  display: flex;
  height: 100%;
  background: #f5f6f7;
}
.side {
  width: 232px;
  background: #fff;
  border-right: 1px solid #e5e6eb;
  display: flex;
  flex-direction: column;
  padding: 10px;
}
.new-btn {
  width: 100%;
  margin-bottom: 8px;
}
.conv-list {
  flex: 1;
}
.conv-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 2px;
}
.conv-item:hover {
  background: #f2f3f5;
}
.conv-item.active {
  background: #e8f0ff;
}
.conv-title {
  font-size: 13px;
  color: #1f2329;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-dept {
  font-size: 11px;
  color: #8f959e;
  margin-top: 2px;
}
.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chat-head {
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
}
.head-line {
  display: flex;
  align-items: center;
  gap: 10px;
}
.provider {
  font-size: 11px;
  color: #8f959e;
}
.think-switch {
  margin-left: auto;
}
.scope-desc {
  font-size: 12px;
  color: #646a73;
  margin-top: 4px;
}
.msg-wrap {
  flex: 1;
}
.msg-inner {
  padding: 16px;
}
.welcome {
  text-align: center;
  padding: 40px 0 20px;
}
.welcome-title {
  font-size: 17px;
  font-weight: 600;
  margin-top: 10px;
}
.welcome-sub {
  font-size: 13px;
  color: #8f959e;
  margin-top: 6px;
}
.msg {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.msg.user {
  flex-direction: row-reverse;
}
.bubble-box {
  max-width: 72%;
}
.intent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.intent-summary {
  font-size: 11px;
  color: #8f959e;
}
.bubble {
  padding: 9px 12px;
  border-radius: 8px;
  background: #fff;
  line-height: 1.65;
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
.msg.user .bubble {
  background: #3370ff;
  color: #fff;
}
.bubble.thinking {
  color: #8f959e;
}
.tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 5px;
  font-size: 11px;
  color: #8f959e;
}
.tool-tag {
  background: #f2f3f5;
  border-radius: 4px;
  padding: 1px 6px;
}
/* 思考记录 */
.thinking-block {
  margin-top: 6px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;
  background: #fafbfc;
}
.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  color: #646a73;
  user-select: none;
}
.thinking-toggle:hover {
  background: #f2f3f5;
}
.caret {
  transition: transform 0.15s;
  font-size: 11px;
}
.caret.open {
  transform: rotate(90deg);
}
.thinking-hint {
  margin-left: auto;
  font-size: 11px;
  color: #8f959e;
}
.thinking-content {
  padding: 8px 12px;
  border-top: 1px solid #e5e6eb;
  font-size: 12px;
  line-height: 1.7;
  color: #4e5969;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
  font-family: 'SF Mono', Consolas, monospace;
}
/* 执行轨迹时间线 */
.trace-block {
  margin-top: 6px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  overflow: hidden;
  background: #fafbfc;
}
.trace-content {
  padding: 8px 12px;
  border-top: 1px solid #e5e6eb;
  max-height: 350px;
  overflow-y: auto;
}
.trace-item {
  display: flex;
  gap: 10px;
  padding: 4px 0;
}
.trace-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
  background: #c9cdd4;
}
.trace-dot.intent { background: #3370ff; }
.trace-dot.rag { background: #00b42a; }
.trace-dot.plan { background: #722ed1; }
.trace-dot.tool { background: #ff7d00; }
.trace-dot.tool_denied { background: #f53f3f; }
.trace-dot.llm { background: #0fb985; }
.trace-dot.done { background: #165dff; }
.trace-body { flex: 1; min-width: 0; }
.trace-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.trace-label { font-size: 12px; font-weight: 600; color: #1f2329; }
.trace-ms { font-size: 11px; color: #8f959e; }
.trace-summary { font-size: 12px; color: #4e5969; margin-top: 2px; }
.trace-sources { margin-top: 4px; }
.trace-source { font-size: 11px; color: #4e5969; padding: 1px 0; }
.quick {
  padding: 6px 16px;
  background: #fff;
  border-top: 1px solid #f0f1f2;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-tag {
  cursor: pointer;
}
.input-bar {
  padding: 10px 16px;
  background: #fff;
  border-top: 1px solid #e5e6eb;
  display: flex;
  gap: 8px;
}
</style>
