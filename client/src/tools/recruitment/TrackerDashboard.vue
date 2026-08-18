<template>
  <div>
    <div class="tk-toolbar">
      <h3 class="db-title">求职数据仪表盘</h3>
      <span style="flex: 1"></span>
      <button class="tk-chip" :class="{ active: range === 'week' }" @click="setRange('week')">近一周</button>
      <button class="tk-chip" :class="{ active: range === 'month' }" @click="setRange('month')">近一月</button>
      <button class="tk-chip" :class="{ active: range === 'all' }" @click="setRange('all')">全部</button>
    </div>

    <div v-if="!stats" class="tk-card tk-empty">加载中…</div>

    <template v-else>
      <div class="db-kpis">
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">总投递数</div>
          <div class="db-kpi-value">{{ stats.total }}</div>
          <div class="db-kpi-sub">近{{ rangeLabel }}创建</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">进行中</div>
          <div class="db-kpi-value">{{ stats.active }}</div>
          <div class="db-kpi-sub">已投递 / 笔试 / 面试</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">已获 Offer</div>
          <div class="db-kpi-value" style="color: #10b981">{{ stats.offers }}</div>
          <div class="db-kpi-sub">已淘汰 {{ stats.rejected }}</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">投递 → 面试</div>
          <div class="db-kpi-value">{{ fmtRate(stats.applyToInterviewRate) }}</div>
          <div class="db-kpi-sub">转化率</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">面试 → Offer</div>
          <div class="db-kpi-value">{{ fmtRate(stats.interviewToOfferRate) }}</div>
          <div class="db-kpi-sub">转化率</div>
        </div>
      </div>

      <div class="db-grid">
        <div class="tk-card db-panel">
          <div class="db-panel-title">各状态分布</div>
          <div class="db-bars">
            <div class="db-bar-row" v-for="s in STATUSES" :key="s">
              <span class="db-bar-label">{{ s }}</span>
              <div class="db-bar-track">
                <div
                  class="db-bar-fill"
                  :style="{
                    width: pct(stats.byStatus[s]) + '%',
                    background: STATUS_COLORS[s],
                  }"
                ></div>
              </div>
              <span class="db-bar-count">{{ stats.byStatus[s] || 0 }}</span>
            </div>
          </div>
        </div>

        <div class="tk-card db-panel">
          <div class="db-panel-title">占比</div>
          <svg viewBox="0 0 200 200" class="db-donut">
            <circle cx="100" cy="100" r="76" fill="none" stroke="#eef1f5" stroke-width="30" />
            <circle
              v-for="seg in donutSegs"
              :key="seg.status"
              cx="100"
              cy="100"
              r="76"
              fill="none"
              :stroke="seg.color"
              stroke-width="30"
              :stroke-dasharray="`${seg.frac * C} ${C}`"
              :stroke-dashoffset="seg.offset * C"
              transform="rotate(-90 100 100)"
            />
            <text x="100" y="96" text-anchor="middle" class="db-donut-total">{{ stats.total }}</text>
            <text x="100" y="116" text-anchor="middle" class="db-donut-label">总记录</text>
          </svg>
          <div class="db-legend">
            <span v-for="s in STATUSES" :key="s" class="db-legend-item">
              <i :style="{ background: STATUS_COLORS[s] }"></i>{{ s }} {{ stats.byStatus[s] || 0 }}
            </span>
          </div>
        </div>

        <div class="tk-card db-panel db-duration">
          <div class="db-panel-title">平均各阶段耗时（天）</div>
          <div class="db-dur-row">
            <span class="db-dur-name">投递 → 笔试</span>
            <span class="db-dur-value">{{ fmtDays(stats.durations.apply_to_exam) }}</span>
          </div>
          <div class="db-dur-row">
            <span class="db-dur-name">笔试 → 面试</span>
            <span class="db-dur-value">{{ fmtDays(stats.durations.exam_to_interview) }}</span>
          </div>
          <div class="db-dur-row">
            <span class="db-dur-name">面试 → Offer</span>
            <span class="db-dur-value">{{ fmtDays(stats.durations.interview_to_offer) }}</span>
          </div>
          <p class="db-note">* 基于所选范围内记录的节点日期计算，样本不足时显示 —</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, STATUSES, STATUS_COLORS } from '../../api'

const C = 2 * Math.PI * 76
const range = ref('all')
const stats = ref(null)

onMounted(load)

async function load() {
  stats.value = null
  stats.value = await api(`/api/recruitment/stats?range=${range.value}`)
}

function setRange(r) {
  range.value = r
  load()
}

const rangeLabel = computed(() => (range.value === 'week' ? '一周' : range.value === 'month' ? '一月' : '全部'))

function pct(n) {
  if (!stats.value || !stats.value.total) return 0
  return Math.round((n / stats.value.total) * 1000) / 10
}

function fmtRate(v) {
  return v === null || v === undefined ? '—' : v + '%'
}

function fmtDays(v) {
  return v === null || v === undefined ? '—' : v + ' 天'
}

const donutSegs = computed(() => {
  const total = stats.value ? stats.value.total : 0
  if (!total) return []
  let offset = 0
  return STATUSES.map((s) => {
    const frac = (stats.value.byStatus[s] || 0) / total
    const seg = { status: s, color: STATUS_COLORS[s], frac, offset }
    offset += frac
    return seg
  })
})
</script>

<style scoped>
.db-title { font-size: 17px; margin: 0; }
.db-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.db-kpi { padding: 16px 18px; }
.db-kpi-label { font-size: 12px; color: #6b7280; }
.db-kpi-value { font-size: 26px; font-weight: 800; margin: 6px 0 2px; color: #1f2937; }
.db-kpi-sub { font-size: 11px; color: #9ca3af; }
.db-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 16px;
}
.db-panel { padding: 18px; }
.db-panel-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
.db-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
.db-bar-label { width: 56px; font-size: 12px; color: #6b7280; }
.db-bar-track { flex: 1; height: 10px; background: #eef1f5; border-radius: 5px; overflow: hidden; }
.db-bar-fill { height: 100%; border-radius: 5px; transition: width 0.4s ease; min-width: 0; }
.db-bar-count { width: 28px; text-align: right; font-size: 12px; color: #6b7280; }
.db-donut { width: 170px; height: 170px; display: block; margin: 0 auto; }
.db-donut-total { font-size: 28px; font-weight: 800; fill: #1f2937; }
.db-donut-label { font-size: 11px; fill: #9ca3af; }
.db-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; justify-content: center; margin-top: 8px; }
.db-legend-item { font-size: 11px; color: #6b7280; display: inline-flex; align-items: center; gap: 4px; }
.db-legend-item i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.db-dur-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px dashed #eef1f5;
  font-size: 13px;
}
.db-dur-row:last-of-type { border-bottom: none; }
.db-dur-name { color: #6b7280; }
.db-dur-value { font-weight: 700; color: #1f2937; }
.db-note { font-size: 11px; color: #b0b7c2; margin-top: 8px; }

@media (max-width: 900px) {
  .db-grid { grid-template-columns: 1fr; }
}
</style>
