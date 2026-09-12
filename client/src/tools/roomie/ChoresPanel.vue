<template>
  <div class="rm-panel">
    <div class="rm-section-head">
      <div>
        <h2>值日排班</h2>
        <p class="rm-sub">把清洁任务分配到人，完成就打勾</p>
      </div>
      <button class="rm-btn" @click="autoGenerate">一键生成一周值日</button>
    </div>

    <div v-if="!roommates.length" class="rm-empty">请先在「室友」页新增一起合租的人</div>

    <template v-else>
      <form class="rm-add-form" @submit.prevent="save">
        <input v-model="form.title" class="rm-input" placeholder="值日事项，例如：打扫客厅" maxlength="30" />
        <SelectPicker
          v-model="form.assignee_id"
          :options="roommateOptions"
          placeholder="负责人"
          class="rm-picker"
        />
        <input v-model="form.due_date" class="rm-input" type="date" />
        <button type="submit" class="rm-btn primary" :disabled="saving">
          {{ saving ? '保存中…' : editingId ? '保存' : '新增' }}
        </button>
        <button v-if="editingId" type="button" class="rm-btn" :disabled="saving" @click="resetForm">
          取消
        </button>
      </form>

      <div v-if="chores.length" class="rm-list">
        <div v-for="c in chores" :key="c.id" class="rm-row" :class="{ done: c.done }">
          <label class="rm-checkbox">
            <input type="checkbox" :checked="!!c.done" @change="toggle(c)" />
            <span class="rm-checkmark"></span>
          </label>
          <span class="rm-avatar sm" :style="{ background: assigneeColor(c) }">
            {{ initial(assigneeName(c)) }}
          </span>
          <div class="rm-row-main">
            <div class="rm-row-title" :class="{ strike: c.done }">{{ c.title }}</div>
            <div class="rm-row-sub">{{ assigneeName(c) || '未指定负责人' }} · {{ c.due_date }}</div>
          </div>
          <div class="rm-row-actions">
            <button class="rm-mini" @click="startEdit(c)">编辑</button>
            <button class="rm-mini danger" @click="remove(c)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="rm-empty">还没有值日任务，手动新增或一键生成吧</div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import SelectPicker from '../recruitment/SelectPicker.vue'
import { roommateColor, todayStr } from './roomie'

const props = defineProps({ roommates: { type: Array, default: () => [] } })
const emit = defineEmits(['notify'])

const chores = ref([])
const editingId = ref(null)
const saving = ref(false)
const form = ref({ title: '', assignee_id: null, due_date: todayStr() })

const roommateOptions = computed(() =>
  props.roommates.map((r) => ({ value: r.id, label: r.name }))
)

function initial(name) {
  return (name || '?').slice(0, 1)
}

function roommateOf(c) {
  return props.roommates.find((r) => r.id === Number(c.assignee_id))
}

function assigneeName(c) {
  const r = roommateOf(c)
  return r ? r.name : ''
}

function assigneeColor(c) {
  const r = roommateOf(c)
  return r ? roommateColor(r) : '#cbd5e1'
}

function resetForm() {
  form.value = { title: '', assignee_id: null, due_date: todayStr() }
  editingId.value = null
}

async function load() {
  try {
    chores.value = await api('/api/roomie/chores')
  } catch (e) {
    emit('notify', e.message || '值日加载失败', 'error')
  }
}

function startEdit(c) {
  editingId.value = c.id
  form.value = {
    title: c.title,
    assignee_id: c.assignee_id,
    due_date: c.due_date || todayStr(),
  }
}

async function save() {
  if (saving.value) return
  const title = form.value.title.trim()
  if (!title) return emit('notify', '请填写值日事项', 'error')
  const body = {
    title,
    assignee_id: form.value.assignee_id,
    due_date: form.value.due_date,
  }
  saving.value = true
  try {
    if (editingId.value) {
      await api(`/api/roomie/chores/${editingId.value}`, { method: 'PUT', body })
      emit('notify', '值日已更新')
    } else {
      await api('/api/roomie/chores', { method: 'POST', body })
      emit('notify', '已新增值日')
    }
    resetForm()
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function toggle(c) {
  try {
    await api(`/api/roomie/chores/${c.id}`, {
      method: 'PUT',
      body: {
        title: c.title,
        assignee_id: c.assignee_id,
        due_date: c.due_date,
        done: c.done ? 0 : 1,
      },
    })
    await load()
  } catch (e) {
    emit('notify', e.message || '更新失败', 'error')
  }
}

async function remove(c) {
  const ok = await confirmDialog({
    title: '删除值日',
    message: `确定删除「${c.title}」吗？删除后不可恢复。`,
  })
  if (!ok) return
  try {
    await api(`/api/roomie/chores/${c.id}`, { method: 'DELETE' })
    emit('notify', '已删除')
    await load()
  } catch (e) {
    emit('notify', e.message || '删除失败', 'error')
  }
}

async function autoGenerate() {
  if (!props.roommates.length) {
    emit('notify', '请先新增室友', 'error')
    return
  }
  const ok = await confirmDialog({
    title: '一键生成一周值日',
    message: '将按室友顺序轮流生成未来 7 天的「公共区域清洁」任务，确定继续吗？',
    confirmText: '生成',
    danger: false,
  })
  if (!ok) return
  try {
    const start = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const p = (n) => String(n).padStart(2, '0')
      const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      const roommate = props.roommates[i % props.roommates.length]
      await api('/api/roomie/chores', {
        method: 'POST',
        body: { title: '公共区域清洁', assignee_id: roommate.id, due_date: date },
      })
    }
    emit('notify', '已生成一周值日')
    await load()
  } catch (e) {
    emit('notify', e.message || '生成失败', 'error')
  }
}

onMounted(load)
</script>
