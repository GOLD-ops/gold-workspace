<template>
  <div class="rm-panel rm-chores">
    <div v-if="!roommates.length && !guest" class="rm-empty">房间暂时没有可排班的成员</div>

    <template v-else>
      <div class="rm-toolbar rm-chore-toolbar">
        <div class="rm-filter-group">
          <SelectPicker
            v-model="memberFilter"
            :options="memberFilterOptions"
            class="rm-filter-picker"
            aria-label="按成员筛选"
          />
          <SelectPicker
            v-model="titleFilter"
            :options="titleFilterOptions"
            class="rm-filter-picker"
            aria-label="按任务名称筛选"
          />
          <SelectPicker
            v-model="statusFilter"
            :options="statusFilterOptions"
            class="rm-filter-picker"
            aria-label="按状态筛选"
          />
          <span class="rm-result-count">本月 {{ filteredChores.length }} 项</span>
        </div>

        <div class="rm-toolbar-actions">
          <div class="rm-month-picker" aria-label="选择月份">
            <button type="button" aria-label="上个月" @click="moveMonth(-1)">‹</button>
            <strong>{{ monthLabel }}</strong>
            <button type="button" aria-label="下个月" @click="moveMonth(1)">›</button>
          </div>
          <div class="rm-segmented" role="group" aria-label="值日展示方式">
            <button
              type="button"
              :class="{ active: viewMode === 'calendar' }"
              :aria-pressed="viewMode === 'calendar'"
              @click="viewMode = 'calendar'"
            >
              月历
            </button>
            <button
              type="button"
              :class="{ active: viewMode === 'list' }"
              :aria-pressed="viewMode === 'list'"
              @click="viewMode = 'list'"
            >
              列表
            </button>
          </div>
          <button type="button" class="rm-btn primary" @click="openAdd()">+ 新增任务</button>
        </div>
      </div>

      <div v-if="loading" class="rm-loading">正在加载值日安排…</div>

      <template v-else>
        <div v-if="viewMode === 'calendar'" class="rm-chore-view rm-calendar-view">
          <div class="rm-card rm-calendar-card">
            <div class="rm-weekdays" aria-hidden="true">
              <span v-for="weekday in WEEKDAYS" :key="weekday">{{ weekday }}</span>
            </div>
            <div class="rm-month-grid">
              <div
                v-for="day in calendarDays"
                :key="day.date"
                class="rm-day-cell"
                :class="{
                  muted: !day.inCurrentMonth,
                  'outside-month': !day.inCurrentMonth,
                  today: day.isToday,
                  'is-today': day.isToday,
                }"
              >
                <div class="rm-day-number">
                  <b>{{ day.dayNumber }}</b>
                  <span v-if="day.isToday">今天</span>
                </div>
                <button
                  v-for="task in day.tasks.slice(0, 3)"
                  :key="task.id"
                  type="button"
                  class="rm-calendar-task"
                  :class="taskClasses(task)"
                  :title="`${task.title} · ${assigneeName(task)}`"
                  @click="openEdit(task)"
                >
                  <span aria-hidden="true">{{ taskStatusSymbol(task) }}</span>
                  {{ task.title }} · {{ assigneeName(task) }}
                </button>
                <button
                  v-if="day.tasks.length > 3"
                  type="button"
                  class="rm-calendar-more"
                  @click="viewMode = 'list'"
                >
                  另有 {{ day.tasks.length - 3 }} 项
                </button>
              </div>
            </div>
          </div>

        </div>

        <div v-else class="rm-chore-view rm-list-view">
          <div v-if="filteredChores.length" class="rm-card rm-chore-board">
            <div class="rm-chore-board-head" aria-hidden="true">
              <span>日期</span>
              <span>值日任务</span>
              <span>负责人</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            <div
              v-for="task in filteredChores"
              :key="task.id"
              class="rm-chore-row"
              :class="taskClasses(task)"
            >
              <div class="rm-chore-date">
                <b>{{ dateDay(task.due_date) }}</b>
                <span>{{ dateWeekday(task.due_date) }}</span>
              </div>
              <div class="rm-chore-task">
                <strong>{{ task.title }}</strong>
                <small>{{ taskPoints(task) }} 分 · {{ repeatLabel(task.repeat_rule) }}</small>
              </div>
              <div class="rm-chore-person" :class="{ unassigned: !task.assignee_id }">
                <span
                  v-if="task.assignee_id"
                  class="rm-avatar sm"
                  :style="{ background: assigneeColor(task) }"
                  aria-hidden="true"
                >
                  {{ initial(assigneeName(task)) }}
                </span>
                <span>{{ assigneeName(task) }}</span>
              </div>
              <span class="rm-status" :class="taskStatus(task)">{{ taskStatusLabel(task) }}</span>
              <div class="rm-chore-actions">
                <button
                  v-if="canClaim(task)"
                  type="button"
                  class="rm-mini"
                  :disabled="actionBusyId === task.id"
                  @click="claim(task)"
                >
                  认领
                </button>
                <button
                  v-if="canComplete(task)"
                  type="button"
                  class="rm-mini"
                  :disabled="actionBusyId === task.id"
                  @click="complete(task)"
                >
                  打卡
                </button>
                <button type="button" class="rm-mini" @click="openEdit(task)">编辑</button>
                <button type="button" class="rm-mini danger" @click="remove(task)">删除</button>
              </div>
            </div>
          </div>
          <div v-else class="rm-empty">
            {{ chores.length ? '没有符合当前筛选条件的值日任务' : '本月还没有值日任务，点「新增任务」开始排班' }}
          </div>
        </div>
      </template>
    </template>

    <div v-if="taskModal.open" class="rm-overlay" @mousedown.self="closeTaskModal">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header">
          <h3>{{ taskModal.editing ? '编辑值日任务' : '新增值日任务' }}</h3>
          <button class="rm-modal-close" type="button" aria-label="关闭" @click="closeTaskModal">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row">
              <div class="rm-field">
                <span>任务名称</span>
                <EditableSelect
                  v-model="form.title"
                  :options="titleOptions"
                  placeholder="选择或输入任务名称"
                  tip="可从常用家务中选择，也可直接输入"
                />
              </div>
              <label class="rm-field">
                <span>执行日期</span>
                <input v-model="form.due_date" class="rm-input" type="date" />
              </label>
            </div>
            <div class="rm-field-row">
              <div class="rm-field">
                <span>工作量</span>
                <SelectPicker v-model="form.points" :options="pointOptions" class="rm-picker" />
              </div>
              <div class="rm-field">
                <span>重复规则</span>
                <SelectPicker v-model="form.repeat_rule" :options="repeatOptions" class="rm-picker" />
              </div>
            </div>
            <div class="rm-field-row">
              <div class="rm-field">
                <span>分配方式</span>
                <SelectPicker
                  v-model="form.assignment_mode"
                  :options="assignmentOptions"
                  class="rm-picker"
                  @change="onAssignmentModeChange"
                />
              </div>
              <div v-if="needsAssignee" class="rm-field">
                <span>负责人</span>
                <SelectPicker
                  v-model="form.assignee_id"
                  :options="roommateOptions"
                  placeholder="请选择负责人"
                  class="rm-picker"
                />
              </div>
            </div>
            <div class="rm-form-note">{{ assignmentHelp }}</div>
          </div>
        </div>
        <div class="rm-modal-footer rm-modal-footer-split">
          <div v-if="taskModal.editing" class="rm-modal-context-actions">
            <button
              v-if="canClaim(taskModal.editing)"
              type="button"
              class="rm-btn"
              :disabled="actionBusyId === taskModal.editing.id"
              @click="claim(taskModal.editing, true)"
            >
              认领任务
            </button>
            <button
              v-if="canComplete(taskModal.editing)"
              type="button"
              class="rm-btn"
              :disabled="actionBusyId === taskModal.editing.id"
              @click="complete(taskModal.editing, true)"
            >
              完成打卡
            </button>
            <button type="button" class="rm-btn danger" :disabled="saving" @click="removeFromModal">
              删除
            </button>
          </div>
          <span class="rm-spacer"></span>
          <button type="button" class="rm-btn" :disabled="saving" @click="closeTaskModal">取消</button>
          <button type="button" class="rm-btn primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : taskModal.editing ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import EditableSelect from '../../ui/EditableSelect.vue'
import SelectPicker from '../recruitment/SelectPicker.vue'
import { memberInitial as initial, roommateColor, todayStr } from './roomie'

const props = defineProps({
  roommates: { type: Array, default: () => [] },
  currentMemberId: { type: [Number, String], default: null },
  settings: { type: Object, default: () => ({}) },
  guest: { type: Boolean, default: false },
})
const emit = defineEmits(['notify', 'alerts-changed'])

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
// 常见家务预设：任务名称支持直接选择，也支持自己输入
const CHORE_TITLE_PRESETS = [
  '客厅吸尘',
  '拖地',
  '厨房台面清理',
  '灶台油污清理',
  '洗碗',
  '卫生间刷洗',
  '马桶清洁',
  '垃圾清运',
  '换垃圾袋',
  '洗衣晾晒',
  '阳台打扫',
  '冰箱整理',
  '玄关整理',
  '季度大扫除',
]
const ASSIGNMENT_MODES = new Set(['fair', 'fixed', 'manual', 'claim'])

const assignmentOptions = [
  { value: 'fair', label: '公平轮换' },
  { value: 'fixed', label: '固定负责人' },
  { value: 'claim', label: '自由认领' },
]
const repeatOptions = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日（周一至周五）' },
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '每两周' },
  { value: 'monthly', label: '每月' },
]
const pointOptions = [
  { value: 1, label: '1 分 · 很轻' },
  { value: 2, label: '2 分 · 较轻' },
  { value: 3, label: '3 分 · 一般' },
  { value: 4, label: '4 分 · 较重' },
  { value: 5, label: '5 分 · 很重' },
]
const statusFilterOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '待完成' },
  { value: 'done', label: '已完成' },
  { value: 'overdue', label: '已逾期' },
  { value: 'claim', label: '待认领' },
]

const chores = ref([])
const loading = ref(false)
const saving = ref(false)
const actionBusyId = ref(null)
const selectedMonth = ref(todayStr().slice(0, 7))
const viewMode = ref('calendar')
const memberFilter = ref('all')
const titleFilter = ref('all')
const statusFilter = ref('all')
const taskModal = reactive({ open: false, editing: null })
const form = reactive({
  title: '',
  due_date: todayStr(),
  points: 2,
  repeat_rule: 'none',
  assignment_mode: 'fair',
  assignee_id: null,
})
let loadSequence = 0

const roommateOptions = computed(() =>
  props.roommates.map((member) => ({ value: member.id, label: member.name }))
)

const memberFilterOptions = computed(() => {
  const options = [{ value: 'all', label: '全部成员' }]
  if (props.currentMemberId) options.push({ value: 'mine', label: '只看我的任务' })
  return options.concat(
    props.roommates.map((member) => ({ value: `member:${member.id}`, label: member.name }))
  )
})

const titleOptions = computed(() => {
  const used = chores.value.map((task) => String(task.title || '').trim()).filter(Boolean)
  return [...new Set([...CHORE_TITLE_PRESETS, ...used])].map((value) => ({ value, label: value }))
})

const titleFilterOptions = computed(() => {
  const used = [
    ...new Set(chores.value.map((task) => String(task.title || '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  return [{ value: 'all', label: '全部任务' }, ...used.map((value) => ({ value, label: value }))]
})

const defaultAssignmentMode = computed(() => {
  const candidate =
    props.settings?.chore_assignment_mode ||
    props.settings?.default_chore_assignment_mode ||
    props.settings?.default_assignment_mode
  // 旧数据里的“手动指定”已与“固定负责人”合并
  if (candidate === 'manual') return 'fixed'
  return ASSIGNMENT_MODES.has(candidate) ? candidate : 'fair'
})

const monthLabel = computed(() => {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  return `${year} 年 ${month} 月`
})

const filteredChores = computed(() => {
  return chores.value
    .filter((task) => {
      if (memberFilter.value === 'mine' && Number(task.assignee_id) !== Number(props.currentMemberId)) return false
      if (memberFilter.value.startsWith('member:')) {
        const memberId = Number(memberFilter.value.slice(7))
        if (Number(task.assignee_id) !== memberId) return false
      }
      if (titleFilter.value !== 'all' && String(task.title || '') !== String(titleFilter.value)) return false
      if (statusFilter.value !== 'all') {
        if (statusFilter.value === 'claim') return isClaimTask(task)
        if (taskStatus(task) !== statusFilter.value) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.id) - Number(b.id))
})

const tasksByDate = computed(() => {
  const grouped = new Map()
  filteredChores.value.forEach((task) => {
    const date = String(task.due_date || '').slice(0, 10)
    if (!date) return
    if (!grouped.has(date)) grouped.set(date, [])
    grouped.get(date).push(task)
  })
  return grouped
})

const calendarDays = computed(() => {
  const [year, monthNumber] = selectedMonth.value.split('-').map(Number)
  const monthIndex = monthNumber - 1
  const firstDay = new Date(year, monthIndex, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cellCount = Math.max(35, Math.ceil((mondayOffset + daysInMonth) / 7) * 7)
  const start = new Date(year, monthIndex, 1 - mondayOffset)

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const dateKey = localDateKey(date)
    return {
      date: dateKey,
      dayNumber: date.getDate(),
      inCurrentMonth: date.getFullYear() === year && date.getMonth() === monthIndex,
      isToday: dateKey === todayStr(),
      tasks: tasksByDate.value.get(dateKey) || [],
    }
  })
})

const needsAssignee = computed(() => ['fixed', 'manual'].includes(form.assignment_mode))

const assignmentHelp = computed(() => assignmentModeDescription(form.assignment_mode))

function localDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function roommateOf(task) {
  return props.roommates.find((member) => Number(member.id) === Number(task.assignee_id))
}

function assigneeName(task) {
  const member = roommateOf(task)
  if (member) return member.name
  if (task.assignee_name) return task.assignee_name
  if (isClaimTask(task)) return '待认领'
  if (task.assignment_mode === 'fair') return '待分配'
  return '未分配'
}

function assigneeColor(task) {
  const member = roommateOf(task)
  return member ? roommateColor(member) : '#94a3b8'
}

function taskPoints(task) {
  const points = Number(task.points)
  return Number.isFinite(points) && points > 0 ? points : 1
}

function isDone(task) {
  const status = String(task.status || '').toLowerCase()
  return Boolean(Number(task.done)) || status === 'done' || status === 'completed' || Boolean(task.done_at || task.completed_at)
}

function isClaimTask(task) {
  return !isDone(task) && task.assignment_mode === 'claim' && !task.assignee_id
}

function taskStatus(task) {
  if (isDone(task)) return 'done'
  const dueDate = String(task.due_date || '').slice(0, 10)
  if (dueDate && dueDate < todayStr()) return 'overdue'
  if (isClaimTask(task)) return 'claim'
  return 'pending'
}

function taskStatusLabel(task) {
  const labels = { done: '已完成', overdue: '已逾期', claim: '待认领', pending: '待完成' }
  return labels[taskStatus(task)]
}

function taskStatusSymbol(task) {
  if (isDone(task)) return '✓'
  if (taskStatus(task) === 'overdue') return '!'
  if (isClaimTask(task)) return '＋'
  return '·'
}

function taskClasses(task) {
  const status = taskStatus(task)
  return {
    [status]: true,
    'is-done': status === 'done',
    'is-overdue': status === 'overdue',
    claim: isClaimTask(task),
    'is-unassigned': isClaimTask(task),
    mine: Number(task.assignee_id) === Number(props.currentMemberId),
  }
}

function repeatLabel(rule) {
  return repeatOptions.find((option) => option.value === (rule || 'none'))?.label || '不重复'
}

function assignmentModeDescription(mode) {
  const descriptions = {
    fair: '保存后自动分给本月累计工作量较少的成员；重复任务会在每次生成时重新平衡。',
    fixed: '由选定的负责人完成；适合固定负责的区域或长期任务，重复任务会一直分给同一个人。',
    claim: '先不指定负责人，任一在住成员都可以主动认领。',
  }
  return descriptions[mode] || descriptions.fair
}

function dateDay(date) {
  const day = Number(String(date || '').slice(8, 10))
  return day || '—'
}

function dateWeekday(date) {
  const value = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '未定'
  const [year, month, day] = value.split('-').map(Number)
  const nativeDay = new Date(year, month - 1, day).getDay()
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][nativeDay]
}

function moveMonth(direction) {
  const [year, month] = selectedMonth.value.split('-').map(Number)
  const target = new Date(year, month - 1 + direction, 1)
  selectedMonth.value = localDateKey(target).slice(0, 7)
}

function defaultDueDate() {
  const today = todayStr()
  return today.startsWith(selectedMonth.value) ? today : `${selectedMonth.value}-01`
}

function resetForm(date = defaultDueDate()) {
  const mode = defaultAssignmentMode.value
  Object.assign(form, {
    title: '',
    due_date: date,
    points: 2,
    repeat_rule: 'none',
    assignment_mode: mode,
    assignee_id: ['fixed', 'manual'].includes(mode)
      ? Number(props.currentMemberId) || props.roommates[0]?.id || null
      : null,
  })
}

function openAdd(date) {
  if (props.guest) return emit('notify', '请先登录后再新增任务', 'error')
  taskModal.editing = null
  resetForm(date)
  taskModal.open = true
}

function openEdit(task) {
  taskModal.editing = task
  Object.assign(form, {
    title: task.title || '',
    due_date: String(task.due_date || defaultDueDate()).slice(0, 10),
    points: taskPoints(task),
    repeat_rule: task.repeat_rule || 'none',
    assignment_mode:
      task.assignment_mode === 'manual'
        ? 'fixed'
        : task.assignment_mode || (task.assignee_id ? 'fixed' : 'claim'),
    assignee_id: task.assignee_id == null ? null : Number(task.assignee_id),
  })
  taskModal.open = true
}

function closeTaskModal() {
  if (saving.value) return
  taskModal.open = false
}

function onAssignmentModeChange(mode) {
  if (['fair', 'claim'].includes(mode)) {
    form.assignee_id = null
  } else if (!form.assignee_id) {
    form.assignee_id = Number(props.currentMemberId) || props.roommates[0]?.id || null
  }
}

async function load() {
  if (props.guest) {
    loading.value = false
    return
  }
  const sequence = ++loadSequence
  loading.value = true
  try {
    const data = await api(`/api/roomie/chores?month=${encodeURIComponent(selectedMonth.value)}`)
    if (sequence === loadSequence) {
      chores.value = Array.isArray(data)
        ? data
        : Array.isArray(data?.chores)
          ? data.chores
          : []
      if (
        titleFilter.value !== 'all' &&
        !chores.value.some((task) => String(task.title || '') === titleFilter.value)
      ) {
        titleFilter.value = 'all'
      }
    }
  } catch (error) {
    if (sequence === loadSequence) emit('notify', error.message || '值日加载失败', 'error')
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

async function refreshForDate(date) {
  const targetMonth = String(date || '').slice(0, 7)
  if (targetMonth && targetMonth !== selectedMonth.value) {
    selectedMonth.value = targetMonth
    return
  }
  await load()
}

async function save() {
  if (saving.value) return
  const title = form.title.trim()
  if (!title) return emit('notify', '请填写任务名称', 'error')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.due_date)) return emit('notify', '请选择执行日期', 'error')
  if (needsAssignee.value && !form.assignee_id) return emit('notify', '请选择负责人', 'error')

  const body = {
    title,
    due_date: form.due_date,
    points: taskPoints(form),
    repeat_rule: form.repeat_rule,
    assignment_mode: form.assignment_mode,
    assignee_id:
      form.assignment_mode === 'claim'
        ? null
        : needsAssignee.value
          ? Number(form.assignee_id)
          : taskModal.editing?.assignment_mode === 'fair'
            ? taskModal.editing.assignee_id
            : null,
  }

  saving.value = true
  try {
    if (taskModal.editing) {
      await api(`/api/roomie/chores/${taskModal.editing.id}`, { method: 'PUT', body })
      emit('notify', '值日任务已更新')
    } else {
      const created = await api('/api/roomie/chores', { method: 'POST', body })
      const count = Number(created?.created_count) || 1
      emit('notify', count > 1 ? `已生成 ${count} 条值日任务` : '值日任务已创建')
    }
    taskModal.open = false
    await refreshForDate(form.due_date)
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '任务保存失败', 'error')
  } finally {
    saving.value = false
  }
}

function canClaim(task) {
  return Boolean(props.currentMemberId) && isClaimTask(task)
}

function canComplete(task) {
  return (
    Boolean(props.currentMemberId) &&
    !isDone(task) &&
    Number(task.assignee_id) === Number(props.currentMemberId)
  )
}

async function claim(task, closeAfter = false) {
  if (!props.currentMemberId) return emit('notify', '请先在设置中选择“我”的身份', 'error')
  if (actionBusyId.value) return
  actionBusyId.value = task.id
  try {
    await api(`/api/roomie/chores/${task.id}/claim`, {
      method: 'POST',
      body: { actor_id: Number(props.currentMemberId) },
    })
    if (closeAfter) taskModal.open = false
    emit('notify', '任务已认领')
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '认领失败', 'error')
  } finally {
    actionBusyId.value = null
  }
}

async function complete(task, closeAfter = false) {
  if (!props.currentMemberId) return emit('notify', '请先在设置中选择“我”的身份', 'error')
  if (actionBusyId.value) return
  actionBusyId.value = task.id
  try {
    await api(`/api/roomie/chores/${task.id}/complete`, {
      method: 'POST',
      body: { actor_id: Number(props.currentMemberId) },
    })
    if (closeAfter) taskModal.open = false
    emit('notify', '值日已打卡')
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '打卡失败', 'error')
  } finally {
    actionBusyId.value = null
  }
}

async function remove(task) {
  const ok = await confirmDialog({
    title: '删除值日任务',
    message: `确定删除「${task.title}」吗？${task.repeat_rule && task.repeat_rule !== 'none' ? '本次操作只删除当前记录。' : '删除后不可恢复。'}`,
  })
  if (!ok) return false
  try {
    await api(`/api/roomie/chores/${task.id}`, { method: 'DELETE' })
    emit('notify', '值日任务已删除')
    await load()
    emit('alerts-changed')
    return true
  } catch (error) {
    emit('notify', error.message || '删除失败', 'error')
    return false
  }
}

async function removeFromModal() {
  if (!taskModal.editing) return
  const removed = await remove(taskModal.editing)
  if (removed) taskModal.open = false
}

watch(selectedMonth, load)
onMounted(load)
</script>
