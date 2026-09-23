<template>
  <div class="page-container">
    <div class="kpi-grid">
      <div class="kpi-card" v-for="k in kpis" :key="k.label">
        <div class="label">{{ k.label }}</div>
        <div class="value" :class="k.cls">{{ k.value }}</div>
      </div>
    </div>

    <div class="chart-grid">
      <div class="chart-box">
        <h3>近 6 个月订单金额趋势（元）</h3>
        <div ref="orderChart" class="chart"></div>
      </div>
      <div class="chart-box">
        <h3>工单状态分布</h3>
        <div ref="statusChart" class="chart"></div>
      </div>
      <div class="chart-box">
        <h3>近 6 个月产量趋势（合格 / 不良）</h3>
        <div ref="outputChart" class="chart"></div>
      </div>
      <div class="chart-box">
        <h3>客户订单金额 Top（元）</h3>
        <div ref="customerChart" class="chart"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, nextTick } from 'vue';
import * as echarts from 'echarts';
import { getOverview, getSalesBoard, getProductionBoard } from '../../api';

const overview = ref<any>({ kpi: {} });
const sales = ref<any>({ amountByMonth: [], topCustomers: [] });
const prod = ref<any>({ statusDist: [], outputByMonth: [], qualityByType: [] });

const orderChart = ref<HTMLElement>();
const statusChart = ref<HTMLElement>();
const outputChart = ref<HTMLElement>();
const customerChart = ref<HTMLElement>();

const kpis = computed(() => {
  const k = overview.value.kpi || {};
  const money = (n: number) => '¥' + Number(n || 0).toLocaleString();
  return [
    { label: '订单总额', value: money(k.orderAmount), cls: 'primary' },
    { label: '订单数 / 生产中', value: `${k.orderCount} / ${k.producingOrders}` },
    { label: '工单完工率', value: k.completionRate + '%' },
    { label: '延期工单', value: k.overdueWo, cls: k.overdueWo ? 'danger' : '' },
    { label: '产品合格率', value: k.yieldRate + '%', cls: k.yieldRate < 95 ? 'warn' : 'primary' },
    { label: '库存金额', value: money(k.stockValue) },
    { label: '低库存预警', value: k.lowStockCount, cls: k.lowStockCount ? 'warn' : '' },
    { label: '应收 / 已收', value: `${money(k.uncollected)} / ${money(k.received)}` },
    { label: '待审批', value: k.pendingApprovals, cls: k.pendingApprovals ? 'warn' : '' },
  ];
});

function renderCharts() {
  const months = sales.value.amountByMonth.map((m: any) => m.month.slice(5));

  echarts.init(orderChart.value!).setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value' },
    series: [
      {
        name: '订单金额',
        type: 'bar',
        data: sales.value.amountByMonth.map((m: any) => m.amount),
        itemStyle: { color: '#3370ff', borderRadius: [4, 4, 0, 0] },
      },
    ],
  });

  const statusMap: Record<string, string> = { pending: '待派工', 生产中: '生产中', 已完工: '已完工', 延期: '延期' };
  echarts.init(statusChart.value!).setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['40%', '68%'],
        data: prod.value.statusDist
          .filter((s: any) => s.count > 0)
          .map((s: any) => ({ name: statusMap[s.status] || s.status, value: s.count })),
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        color: ['#86909c', '#3370ff', '#00b42a', '#f54a45'],
      },
    ],
  });

  echarts.init(outputChart.value!).setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['合格', '不良'], top: 0 },
    grid: { left: 50, right: 20, top: 36, bottom: 30 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value' },
    series: [
      { name: '合格', type: 'bar', stack: 'q', data: prod.value.outputByMonth.map((m: any) => m.good), itemStyle: { color: '#00b42a' } },
      { name: '不良', type: 'bar', stack: 'q', data: prod.value.outputByMonth.map((m: any) => m.bad), itemStyle: { color: '#f54a45' } },
    ],
  });

  const top = [...sales.value.topCustomers].reverse();
  echarts.init(customerChart.value!).setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 150, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: top.map((t: any) => t.name) },
    series: [
      { type: 'bar', data: top.map((t: any) => t.amount), itemStyle: { color: '#3370ff', borderRadius: [0, 4, 4, 0] } },
    ],
  });
}

onMounted(async () => {
  const [o, s, p] = await Promise.all([getOverview(), getSalesBoard(), getProductionBoard()]);
  overview.value = o;
  sales.value = s;
  prod.value = p;
  await nextTick();
  renderCharts();
  window.addEventListener('resize', () => {
    [orderChart, statusChart, outputChart, customerChart].forEach((r) => {
      const el = r.value;
      if (el) echarts.getInstanceByDom(el)?.resize();
    });
  });
});
</script>
