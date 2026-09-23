<template>
  <div class="token-stats-page">
    <!-- KPI 卡片 -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#3370ff,#5b8def)"><el-icon><Coin /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ formatNum(data.kpi?.totalTokens) }}</div>
          <div class="kpi-label">总 Token 消耗</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#00b42a,#23c343)"><el-icon><QuestionFilled /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ data.kpi?.totalQuestions || 0 }}</div>
          <div class="kpi-label">总提问数</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#722ed1,#9254de)"><el-icon><ChatDotRound /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ data.kpi?.totalAnswers || 0 }}</div>
          <div class="kpi-label">AI 回答数</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#ff7d00,#ff9a2e)"><el-icon><TrendCharts /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ formatNum(data.kpi?.avgTokensPerAnswer) }}</div>
          <div class="kpi-label">平均每次回答 Token</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#f53f3f,#f76560)"><el-icon><User /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ data.kpi?.activeUsers || 0 }}</div>
          <div class="kpi-label">活跃用户</div>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-icon" style="background: linear-gradient(135deg,#0fb985,#23c38d)"><el-icon><OfficeBuilding /></el-icon></div>
        <div class="kpi-info">
          <div class="kpi-value">{{ data.kpi?.activeDepartments || 0 }}</div>
          <div class="kpi-label">活跃部门</div>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <!-- 部门 Token 分布 -->
      <div class="panel">
        <div class="panel-title">
          <el-icon><PieChart /></el-icon>
          <span>各部门 Token 消耗</span>
        </div>
        <div class="bar-chart">
          <div v-for="(d, i) in data.byDepartment" :key="i" class="bar-row">
            <div class="bar-label">{{ d.departmentName }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: barWidth(d.tokens) + '%', background: deptColor(i) }"></div>
            </div>
            <div class="bar-value">{{ formatNum(d.tokens) }}</div>
          </div>
          <el-empty v-if="!data.byDepartment?.length" description="暂无数据" :image-size="60" />
        </div>
      </div>

      <!-- 近14天趋势 -->
      <div class="panel">
        <div class="panel-title">
          <el-icon><DataLine /></el-icon>
          <span>近 14 天 Token 趋势</span>
        </div>
        <div class="trend-chart">
          <svg :viewBox="`0 0 ${trendW} ${trendH}`" preserveAspectRatio="none" class="trend-svg">
            <polyline
              :points="tokenPoints"
              fill="none"
              stroke="#3370ff"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <polyline
              :points="tokenArea"
              fill="url(#tokenGrad)"
              stroke="none"
            />
            <defs>
              <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#3370ff" stop-opacity="0.3" />
                <stop offset="100%" stop-color="#3370ff" stop-opacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div class="trend-x">
            <span v-for="(d, i) in data.trend?.days" :key="i" v-show="i % 2 === 0">{{ d }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <!-- 用户 Token 排行 -->
      <div class="panel wide">
        <div class="panel-title">
          <el-icon><Trophy /></el-icon>
          <span>用户 Token 消耗排行</span>
        </div>
        <el-table :data="data.byUser" stripe style="width: 100%" max-height="400">
          <el-table-column type="index" label="排名" width="70" align="center">
            <template #default="{ $index }">
              <span :class="'rank rank-' + ($index + 1)">{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="userName" label="用户" min-width="120" />
          <el-table-column prop="departmentName" label="所属部门" width="120" />
          <el-table-column prop="questions" label="提问数" width="90" align="center" />
          <el-table-column prop="answers" label="回答数" width="90" align="center" />
          <el-table-column label="Token 消耗" width="160" align="right">
            <template #default="{ row }">
              <span class="token-num">{{ formatNum(row.tokens) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="占比" min-width="150">
            <template #default="{ row }">
              <div class="table-bar">
                <div class="table-bar-fill" :style="{ width: pct(row.tokens) + '%' }"></div>
                <span class="table-bar-text">{{ pct(row.tokens) }}%</span>
              </div>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!data.byUser?.length" description="暂无数据" :image-size="60" />
      </div>

      <!-- 渠道分布 -->
      <div class="panel">
        <div class="panel-title">
          <el-icon><Connection /></el-icon>
          <span>接入渠道分布</span>
        </div>
        <div class="channel-list">
          <div v-for="(c, i) in data.byChannel" :key="i" class="channel-item">
            <div class="channel-dot" :style="{ background: channelColor(i) }"></div>
            <span class="channel-name">{{ c.channel }}</span>
            <span class="channel-count">{{ c.conversations }} 个会话</span>
          </div>
          <el-empty v-if="!data.byChannel?.length" description="暂无数据" :image-size="60" />
        </div>
        <div class="tip">
          <el-icon><InfoFilled /></el-icon>
          <span>数据按会话聚合，群会话计入对应部门</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { agentApi } from '../../api';

const data = ref<any>({ kpi: {}, byDepartment: [], byUser: [], trend: { days: [], tokens: [] }, byChannel: [] });

onMounted(async () => {
  data.value = await agentApi.tokenStats();
});

function formatNum(n: number) {
  if (!n) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

const maxDeptTokens = computed(() => Math.max(...(data.value.byDepartment || []).map((d: any) => d.tokens), 1));
function barWidth(tokens: number) {
  return Math.max((tokens / maxDeptTokens.value) * 100, 2);
}

const maxUserTokens = computed(() => Math.max(...(data.value.byUser || []).map((u: any) => u.tokens), 1));
function pct(tokens: number) {
  return Math.round((tokens / maxUserTokens.value) * 100);
}

const DEPT_COLORS = ['#3370ff', '#00b42a', '#ff7d00', '#722ed1', '#f53f3f', '#0fb985', '#f7ba1e', '#14c9c9'];
function deptColor(i: number) { return DEPT_COLORS[i % DEPT_COLORS.length]; }
function channelColor(i: number) { return DEPT_COLORS[i % DEPT_COLORS.length]; }

// 趋势图 SVG
const trendW = 600;
const trendH = 180;
const tokenPoints = computed(() => {
  const arr = data.value.trend?.tokens || [];
  if (!arr.length) return '';
  const max = Math.max(...arr, 1);
  const step = trendW / Math.max(arr.length - 1, 1);
  return arr.map((v: number, i: number) => `${i * step},${trendH - (v / max) * (trendH - 20) - 10}`).join(' ');
});
const tokenArea = computed(() => {
  const arr = data.value.trend?.tokens || [];
  if (!arr.length) return '';
  const max = Math.max(...arr, 1);
  const step = trendW / Math.max(arr.length - 1, 1);
  const pts = arr.map((v: number, i: number) => `${i * step},${trendH - (v / max) * (trendH - 20) - 10}`);
  return `0,${trendH} ${pts.join(' ')} ${trendW},${trendH}`;
});
</script>

<style scoped>
.token-stats-page {
  padding: 16px;
}
.kpi-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.kpi-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 22px;
  flex-shrink: 0;
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: #1f2329;
  line-height: 1.2;
}
.kpi-label {
  font-size: 12px;
  color: #8f959e;
  margin-top: 2px;
}
.charts-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.panel {
  background: #fff;
  border-radius: 10px;
  padding: 16px 20px;
  flex: 1;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  min-width: 0;
}
.panel.wide {
  flex: 2;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 16px;
}
.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar-label {
  width: 80px;
  font-size: 13px;
  color: #4e5969;
  text-align: right;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-track {
  flex: 1;
  height: 20px;
  background: #f2f3f5;
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
.bar-value {
  width: 70px;
  font-size: 13px;
  font-weight: 600;
  color: #1f2329;
  text-align: right;
  flex-shrink: 0;
}
.trend-chart {
  position: relative;
}
.trend-svg {
  width: 100%;
  height: 180px;
}
.trend-x {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #8f959e;
  margin-top: 4px;
  padding: 0 2px;
}
.rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  background: #f2f3f5;
  color: #8f959e;
}
.rank-1 { background: linear-gradient(135deg,#ffd700,#ffb800); color: #fff; }
.rank-2 { background: linear-gradient(135deg,#c0c0c0,#a8a8a8); color: #fff; }
.rank-3 { background: linear-gradient(135deg,#cd7f32,#b87333); color: #fff; }
.token-num {
  font-weight: 600;
  color: #3370ff;
}
.table-bar {
  position: relative;
  height: 18px;
  background: #f2f3f5;
  border-radius: 4px;
  overflow: hidden;
}
.table-bar-fill {
  height: 100%;
  background: linear-gradient(90deg,#3370ff,#5b8def);
  border-radius: 4px;
}
.table-bar-text {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #4e5969;
}
.channel-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.channel-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f2f3f5;
}
.channel-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.channel-name {
  flex: 1;
  font-size: 14px;
  color: #1f2329;
}
.channel-count {
  font-size: 13px;
  color: #8f959e;
}
.tip {
  margin-top: 16px;
  padding: 10px 12px;
  background: #f7f8fa;
  border-radius: 6px;
  font-size: 12px;
  color: #8f959e;
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
