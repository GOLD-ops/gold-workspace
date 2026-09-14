<template>
  <div class="rm-panel rm-overview">
    <div class="rm-section-head">
      <div>
        <h2>生活总览</h2>
        <p class="rm-sub">今天的值日、待结算费用和补货提醒都在这里</p>
      </div>
      <div class="rm-head-actions">
        <button class="rm-btn" @click="emit('navigate', 'chores')">查看本周排班</button>
        <button class="rm-btn primary" @click="emit('navigate', 'expenses')">+ 记一笔费用</button>
      </div>
    </div>

    <div v-if="loading" class="rm-overview-loading">正在整理合租生活数据…</div>

    <template v-else>
      <div class="rm-summary-grid">
        <button class="rm-summary-card" @click="emit('navigate', 'roommates')">
          <span class="rm-summary-icon blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
          </span>
          <span class="rm-summary-copy"><small>合租成员</small><strong>{{ roommates.length }} 人</strong></span>
          <span class="rm-summary-link">管理</span>
        </button>
        <button class="rm-summary-card" @click="emit('navigate', 'expenses')">
          <span class="rm-summary-icon orange">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </span>
          <span class="rm-summary-copy"><small>待结算金额</small><strong>¥{{ centsToYuan(unsettledCents) }}</strong></span>
          <span class="rm-summary-link">去结算</span>
        </button>
        <button class="rm-summary-card" @click="emit('navigate', 'chores')">
          <span class="rm-summary-icon green">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <span class="rm-summary-copy"><small>待完成值日</small><strong>{{ pendingChores.length }} 项</strong></span>
          <span class="rm-summary-link">看排班</span>
        </button>
        <button class="rm-summary-card" @click="emit('navigate', 'items')">
          <span class="rm-summary-icon red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <path d="M3.3 7L12 12l8.7-5" />
            </svg>
          </span>
          <span class="rm-summary-copy"><small>需要补货</small><strong>{{ lowItems.length }} 件</strong></span>
          <span class="rm-summary-link">去补货</span>
        </button>
      </div>

      <div class="rm-overview-grid">
        <section class="rm-overview-card rm-overview-main">
          <div class="rm-card-head">
            <div>
              <h3>近期值日</h3>
              <p>优先显示今天和即将到期的任务</p>
            </div>
            <button class="rm-text-btn" @click="emit('navigate', 'chores')">全部排班 →</button>
          </div>

          <div v-if="upcomingChores.length" class="rm-agenda">
            <label v-for="c in upcomingChores" :key="c.id" class="rm-agenda-row">
              <input type="checkbox" :checked="!!c.done" @change="toggleChore(c)" />
              <span class="rm-checkmark"></span>
              <span class="rm-avatar sm" :style="{ background: assigneeColor(c) }">
                {{ initial(assigneeName(c)) }}
              </span>
              <span class="rm-agenda-copy">
                <strong :class="{ strike: c.done }">{{ c.title }}</strong>
                <small>{{ assigneeName(c) || '未指定负责人' }} · {{ dateLabel(c.due_date) }}</small>
              </span>
              <span class="rm-status-badge" :class="choreStatus(c).className">
                {{ choreStatus(c).label }}
              </span>
            </label>
          </div>
          <div v-else class="rm-card-empty">近期没有待办值日，可以轻松一下</div>
        </section>

        <section class="rm-overview-card">
          <div class="rm-card-head">
            <div>
              <h3>建议转账</h3>
              <p>已自动抵消相互欠款</p>
            </div>
            <button class="rm-text-btn" @click="emit('navigate', 'expenses')">费用明细 →</button>
          </div>
          <div v-if="settlement.transfers.length" class="rm-overview-transfers">
            <div v-for="(t, i) in settlement.transfers.slice(0, 4)" :key="i" class="rm-overview-transfer">
              <span class="rm-transfer-people">
                <b>{{ roommateName(t.from) }}</b>
                <span>转给</span>
                <b>{{ roommateName(t.to) }}</b>
              </span>
              <strong>¥{{ centsToYuan(t.cents) }}</strong>
            </div>
          </div>
          <div v-else class="rm-card-empty compact">目前账目已结清</div>
        </section>

        <section class="rm-overview-card">
          <div class="rm-card-head">
            <div>
              <h3>补货提醒</h3>
              <p>库存低于设定阈值时出现</p>
            </div>
            <button class="rm-text-btn" @click="emit('navigate', 'items')">物品清单 →</button>
          </div>
          <div v-if="lowItems.length" class="rm-overview-items">
            <div v-for="i in lowItems.slice(0, 4)" :key="i.id" class="rm-overview-item">
              <span class="rm-stock-dot"></span>
              <span><strong>{{ i.name }}</strong><small>{{ i.note || '暂无备注' }}</small></span>
              <b>剩 {{ i.quantity }}{{ i.unit }}</b>
            </div>
          </div>
          <div v-else class="rm-card-empty compact">公共物品库存充足</div>
        </section>

        <section class="rm-overview-card">
          <div class="rm-card-head">
            <div>
              <h3>最近公约</h3>
              <p>共同约定，减少生活摩擦</p>
            </div>
            <button class="rm-text-btn" @click="emit('navigate', 'rules')">全部公约 →</button>
          </div>
          <div v-if="rules.length" class="rm-overview-rules">
            <div v-for="(r, index) in rules.slice(0, 3)" :key="r.id">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <p><strong>{{ r.title }}</strong><small>{{ r.content || '暂无详细内容' }}</small></p>
            </div>
          </div>
          <div v-else class="rm-card-empty compact">还没有室友公约</div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api'
import { roommateColor, centsToYuan, todayStr } from './roomie'

const props = defineProps({ roommates: { type: Array, default: () => [] } })
const emit = defineEmits(['navigate', 'notify'])

const loading = ref(true)
const chores = ref([])
const items = ref([])
const rules = ref([])
const settlement = ref({ balances: [], transfers: [] })

const pendingChores = computed(() => chores.value.filter((c) => !c.done))
const upcomingChores = computed(() => chores.value.slice(0, 5))
const lowItems = computed(() =>
  items.value.filter((i) => Number(i.low_threshold) > 0 && Number(i.quantity) <= Number(i.low_threshold))
)
const unsettledCents = computed(() =>
  settlement.value.transfers.reduce((sum, transfer) => sum + Number(transfer.cents || 0), 0)
)

function initial(name) {
  return (name || '?').slice(0, 1)
}

function roommateOf(id) {
  return props.roommates.find((r) => r.id === Number(id))
}

function roommateName(id) {
  return roommateOf(id)?.name || '已移除成员'
}

function assigneeName(chore) {
  if (chore.assignee_id == null) return ''
  return roommateOf(chore.assignee_id)?.name || '已移除成员'
}

function assigneeColor(chore) {
  const roommate = roommateOf(chore.assignee_id)
  return roommate ? roommateColor(roommate) : '#cbd5e1'
}

function dateLabel(date) {
  if (!date) return '未设置日期'
  if (date === todayStr()) return '今天'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const p = (n) => String(n).padStart(2, '0')
  const tomorrowStr = `${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}`
  if (date === tomorrowStr) return '明天'
  return date
}

function choreStatus(chore) {
  if (chore.done) return { label: '已完成', className: 'done' }
  if (chore.due_date && chore.due_date < todayStr()) return { label: '已逾期', className: 'late' }
  if (chore.due_date === todayStr()) return { label: '今天', className: 'today' }
  return { label: '待进行', className: '' }
}

async function load() {
  loading.value = true
  try {
    const [expenseData, choreData, itemData, ruleData] = await Promise.all([
      api('/api/roomie/expenses'),
      api('/api/roomie/chores'),
      api('/api/roomie/items'),
      api('/api/roomie/rules'),
    ])
    settlement.value = expenseData.settlement || { balances: [], transfers: [] }
    chores.value = choreData
    items.value = itemData
    rules.value = ruleData
  } catch (e) {
    emit('notify', e.message || '生活总览加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function toggleChore(chore) {
  try {
    await api(`/api/roomie/chores/${chore.id}`, {
      method: 'PUT',
      body: {
        title: chore.title,
        assignee_id: chore.assignee_id,
        due_date: chore.due_date,
        done: chore.done ? 0 : 1,
      },
    })
    await load()
  } catch (e) {
    emit('notify', e.message || '值日状态更新失败', 'error')
  }
}

onMounted(load)
</script>
