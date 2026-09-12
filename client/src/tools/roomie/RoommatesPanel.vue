<template>
  <div class="rm-panel">
    <div class="rm-section-head">
      <div>
        <h2>一起住的人</h2>
        <p class="rm-sub">先添加室友，费用分摊和值日排班才能选人</p>
      </div>
    </div>

    <div v-if="roommates.length" class="rm-roommate-grid">
      <div v-for="r in roommates" :key="r.id" class="rm-roommate-card">
        <span class="rm-avatar" :style="{ background: roommateColor(r) }">
          {{ initial(r.name) }}
        </span>
        <div class="rm-roommate-name">{{ r.name }}</div>
        <div class="rm-roommate-actions">
          <button class="rm-mini" @click="startEdit(r)">编辑</button>
          <button class="rm-mini danger" @click="remove(r)">移除</button>
        </div>
      </div>
    </div>

    <div v-else class="rm-empty">还没有室友，先添加一起合租的人吧</div>

    <form class="rm-add-form" @submit.prevent="save">
      <input
        v-model="form.name"
        class="rm-input"
        placeholder="室友昵称，例如：小明"
        maxlength="20"
      />
      <div class="rm-color-row">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="rm-color-dot"
          :class="{ active: form.color === c }"
          :style="{ background: c }"
          @click="form.color = c"
        ></button>
      </div>
      <button type="submit" class="rm-btn primary">{{ editingId ? '保存' : '添加' }}</button>
      <button v-if="editingId" type="button" class="rm-btn" @click="resetForm">取消</button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import { COLORS, roommateColor } from './roomie'

defineProps({ roommates: { type: Array, default: () => [] } })
const emit = defineEmits(['changed', 'notify'])

const form = ref({ name: '', color: '' })
const editingId = ref(null)

function initial(name) {
  return (name || '?').slice(0, 1)
}

function resetForm() {
  form.value = { name: '', color: '' }
  editingId.value = null
}

function startEdit(r) {
  editingId.value = r.id
  form.value = { name: r.name, color: r.color || '' }
}

async function save() {
  const name = form.value.name.trim()
  if (!name) {
    emit('notify', '请填写室友昵称', 'error')
    return
  }
  const body = { name, color: form.value.color }
  try {
    if (editingId.value) {
      await api(`/api/roomie/roommates/${editingId.value}`, { method: 'PUT', body })
      emit('notify', '室友已更新')
    } else {
      await api('/api/roomie/roommates', { method: 'POST', body })
      emit('notify', '室友已添加')
    }
    resetForm()
    emit('changed')
  } catch (e) {
    emit('notify', e.message || '操作失败', 'error')
  }
}

async function remove(r) {
  const ok = await confirmDialog({
    title: '移除室友',
    message: `确定移除「${r.name}」吗？其相关的费用与值日记录会保留，但不再关联此人。`,
  })
  if (!ok) return
  try {
    await api(`/api/roomie/roommates/${r.id}`, { method: 'DELETE' })
    emit('notify', '已移除室友')
    emit('changed')
  } catch (e) {
    emit('notify', e.message || '移除失败', 'error')
  }
}
</script>
