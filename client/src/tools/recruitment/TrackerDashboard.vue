<template>
  <div>
    <div class="tk-toolbar">
      <h3 class="db-title">求职数据仪表盘</h3>
      <span style="flex: 1"></span>
      <div class="db-range">
        <button class="tk-chip db-range-trigger" :class="{ active: rangeOpen }" @click="toggleRange">
          {{ rangeLabel }}
        </button>
        <div v-if="rangeOpen" class="db-range-pop" @click.stop>
          <div class="db-calendars">
            <div v-for="(cal, ci) in calendars" :key="ci" class="db-cal">
              <div class="db-cal-head">
                <button v-if="ci === 0" class="db-cal-nav" @click="shiftMonth(-1)">‹</button>
                <span class="db-cal-title">{{ cal.title }}</span>
                <button v-if="ci === 1" class="db-cal-nav" @click="shiftMonth(1)">›</button>
              </div>
              <div class="db-cal-week">
                <span v-for="w in WEEK_LABELS" :key="w">{{ w }}</span>
              </div>
              <div class="db-cal-days">
                <button
                  v-for="(d, di) in cal.days"
                  :key="di"
                  class="db-day"
                  :class="dayClass(d)"
                  :disabled="!d"
                  @click="pickDate(d)"
                >
                  {{ d ? Number(d.slice(8)) : '' }}
                </button>
              </div>
            </div>
          </div>
          <div class="db-range-footer">
            <button class="db-range-quick" @click="quickRange('week')">近一周</button>
            <button class="db-range-quick" @click="quickRange('month')">近一月</button>
            <button class="db-range-quick" @click="quickRange('all')">全部</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!stats" class="tk-card tk-empty">加载中…</div>

    <template v-else>
      <div class="db-kpis">
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">总数量</div>
          <div class="db-kpi-value" style="color: #3d6ee0">{{ stats.total }}</div>
          <div class="db-kpi-sub">{{ rangeLabelShort }}创建</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">进行中</div>
          <div class="db-kpi-value" style="color: #f59e0b">{{ stats.active }}</div>
          <div class="db-kpi-sub">已投递 / 笔试 / 面试</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">已获 Offer</div>
          <div class="db-kpi-value" style="color: #10b981">{{ stats.offers }}</div>
          <div class="db-kpi-sub">已淘汰 {{ stats.rejected }}</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">投递 → 面试</div>
          <div class="db-kpi-value" style="color: #4a90d9">{{ fmtRate(stats.applyToInterviewRate) }}</div>
          <div class="db-kpi-sub">转化率</div>
        </div>
        <div class="tk-card db-kpi">
          <div class="db-kpi-label">面试 → Offer</div>
          <div class="db-kpi-value" style="color: #8b5cf6">{{ fmtRate(stats.interviewToOfferRate) }}</div>
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
              :stroke-dashoffset="-seg.offset * C"
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
          <div class="db-panel-title">平均各阶段耗时</div>
          <div class="db-duration-rows">
            <div class="db-dur-row">
              <span class="db-dur-name">投递 → 笔试</span>
              <span class="db-dur-value">{{ fmtDuration(stats.durations.apply_to_exam) }}</span>
            </div>
            <div class="db-dur-row">
              <span class="db-dur-name">笔试 → 面试</span>
              <span class="db-dur-value">{{ fmtDuration(stats.durations.exam_to_interview) }}</span>
            </div>
            <div class="db-dur-row">
              <span class="db-dur-name">面试 → Offer</span>
              <span class="db-dur-value">{{ fmtDuration(stats.durations.interview_to_offer) }}</span>
            </div>
            <div class="db-dur-row">
              <span class="db-dur-name">投递 → Offer</span>
              <span class="db-dur-value">{{ fmtDuration(stats.durations.apply_to_offer) }}</span>
            </div>
            <div class="db-dur-row">
              <span class="db-dur-name">平均每环节</span>
              <span class="db-dur-value">{{ fmtDuration(stats.durations.avg_per_stage) }}</span>
            </div>
          </div>
          <p class="db-note">* 基于节点时间计算，样本不足时显示 —</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, STATUSES, STATUS_COLORS } from '../../api'

const C = 2 * Math.PI * 76
const range = ref('custom')
const rangeOpen = ref(false)
const now = new Date()
const customFrom = ref('2026-08-01')
const customTo = ref(fmtDate(now))
const viewYear = ref(null)
const viewMonth = ref(null)
const pendingStart = ref('')
const stats = ref(null)
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

onMounted(load)

async function load() {
  stats.value = null
  let url = `/api/recruitment/stats?range=${range.value}`
  if (range.value === 'custom') {
    url += `&from=${customFrom.value}&to=${customTo.value}`
  }
  stats.value = await api(url)
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function initView() {
  const base = customFrom.value
    ? new Date(customFrom.value)
    : new Date()
  viewYear.value = base.getFullYear()
  viewMonth.value = base.getMonth()
  pendingStart.value = ''
}

function toggleRange() {
  rangeOpen.value = !rangeOpen.value
  if (rangeOpen.value) initView()
}

function shiftMonth(delta) {
  const d = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = d.getFullYear()
  viewMonth.value = d.getMonth()
}

function buildCalendar(year, month) {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let i = 0; i < startWeekday; i++) days.push('')
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return { title: `${year}年${month + 1}月`, days }
}

const calendars = computed(() => {
  const y = viewYear.value
  const m = viewMonth.value
  return [buildCalendar(y, m), buildCalendar(m === 11 ? y + 1 : y, (m + 1) % 12)]
})

function dayClass(date) {
  if (!date) return 'db-day-empty'
  const cls = ['db-day']
  const inRange =
    customFrom.value &&
    customTo.value &&
    date > customFrom.value &&
    date < customTo.value
  if (inRange) cls.push('db-day-in')
  if (date === customFrom.value || date === customTo.value) cls.push('db-day-edge')
  if (pendingStart.value && date === pendingStart.value) cls.push('db-day-edge')
  return cls.join(' ')
}

function pickDate(date) {
  if (!date) return
  if (!pendingStart.value) {
    pendingStart.value = date
    return
  }
  let from = pendingStart.value
  let to = date
  if (to < from) {
    const tmp = from
    from = to
    to = tmp
  }
  customFrom.value = from
  customTo.value = to
  pendingStart.value = ''
  range.value = 'custom'
  rangeOpen.value = false
  load()
}

function quickRange(kind) {
  const now = new Date()
  if (kind === 'week') {
    const from = new Date(now)
    from.setDate(now.getDate() - 6)
    customFrom.value = fmtDate(from)
    customTo.value = fmtDate(now)
    range.value = 'custom'
  } else if (kind === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
    customFrom.value = fmtDate(from)
    customTo.value = fmtDate(now)
    range.value = 'custom'
  } else {
    // 全部 = 2026-08-01（软件起始日期）至 今天
    customFrom.value = '2026-08-01'
    customTo.value = fmtDate(now)
    range.value = 'custom'
  }
  pendingStart.value = ''
  rangeOpen.value = false
  load()
}

const rangeLabel = computed(() =>
  range.value === 'week'
    ? '近一周'
    : range.value === 'month'
    ? '近一月'
    : range.value === 'custom' && customFrom.value && customTo.value
    ? `${customFrom.value} 至 ${customTo.value}`
    : range.value === 'custom'
    ? '选择日期范围'
  : '全部'
)

const rangeLabelShort = computed(() =>
  range.value === 'week' ? '近一周' : range.value === 'month' ? '近一月' : '所选范围'
)

function pct(n) {
  if (!stats.value || !stats.value.total) return 0
  return Math.round((n / stats.value.total) * 1000) / 10
}

function fmtRate(v) {
  return v === null || v === undefined ? '—' : v + '%'
}

function fmtDuration(v) {
  if (v === null || v === undefined) return '—'
  if (v >= 24) return Math.round((v / 24) * 10) / 10 + ' 天'
  if (v >= 1) return Math.round(v) + ' 小时'
  if (v > 0) return '不足 1 小时'
  return '—'
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
.db-range { position: relative; }
.db-range-trigger { min-width: 150px; }
.db-range-pop {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 14px;
  box-shadow: var(--tk-shadow-md);
  padding: 14px;
  width: 620px;
}
.db-calendars {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.db-cal { min-width: 0; }
.db-cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.db-cal-nav {
  border: none;
  background: transparent;
  color: var(--tk-muted);
  font-size: 18px;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  line-height: 1;
}
.db-cal-nav:hover { background: var(--tk-blue-soft); color: var(--tk-blue); }
.db-cal-title { font-size: 13.5px; font-weight: 700; color: var(--tk-text); }
.db-cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 11px;
  color: var(--tk-faint);
  margin-bottom: 4px;
}
.db-cal-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.db-day {
  border: none;
  background: transparent;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--tk-text);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.db-day:hover:not(.db-day-empty) { background: var(--tk-blue-soft); color: var(--tk-blue); }
.db-day-empty { cursor: default; }
.db-day-in { background: #eaf1fd; color: var(--tk-blue); }
.db-day-edge {
  background: var(--tk-blue);
  color: #fff;
  font-weight: 700;
}
.db-day-edge:hover { background: var(--tk-blue); color: #fff; }
.db-range-footer {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e4e9f1;
}
.db-range-quick {
  border: 1px solid var(--tk-border);
  background: #fff;
  color: var(--tk-muted);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.db-range-quick:hover {
  border-color: var(--tk-blue);
  color: var(--tk-blue);
  background: var(--tk-blue-soft);
}
.db-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.db-kpi {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.db-kpi-label { font-size: 12px; color: #6b7280; text-align: left; }
.db-kpi-value { font-size: 26px; font-weight: 800; margin: 6px 0 2px; color: #1f2937; text-align: center; }
.db-kpi-sub { font-size: 11px; color: #9ca3af; text-align: center; }
.db-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}
.db-panel { padding: 18px; }
.db-panel-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
.db-panel { display: flex; flex-direction: column; }
.db-bars {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
}
.db-bar-row { display: flex; align-items: center; gap: 10px; }
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
  padding: 8px 0;
  border-bottom: 1px dashed #eef1f5;
  font-size: 13px;
}
.db-dur-row:last-of-type { border-bottom: none; }
.db-dur-name { color: #6b7280; }
.db-dur-value { font-weight: 700; color: #1f2937; }
.db-note { font-size: 11px; color: #b0b7c2; margin-top: 8px; }
.db-duration { display: flex; flex-direction: column; }
.db-duration-rows { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; }

@media (max-width: 900px) {
  .db-grid { grid-template-columns: 1fr; }
}
</style>
