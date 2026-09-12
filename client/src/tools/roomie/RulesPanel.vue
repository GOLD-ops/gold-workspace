<template>
  <div class="rm-panel">
    <div class="rm-section-head">
      <div>
        <h2>室友公约</h2>
        <p class="rm-sub">把约定写下来，减少不必要的摩擦</p>
      </div>
      <button class="rm-btn primary" @click="openAdd">+ 新增公约</button>
    </div>

    <div v-if="rules.length" class="rm-rules">
      <div v-for="r in rules" :key="r.id" class="rm-rule-card">
        <div class="rm-rule-head">
          <h3>{{ r.title }}</h3>
          <div class="rm-rule-actions">
            <button class="rm-mini" @click="openEdit(r)">编辑</button>
            <button class="rm-mini danger" @click="remove(r)">删除</button>
          </div>
        </div>
        <p v-if="r.content" class="rm-rule-content">{{ r.content }}</p>
        <p v-else class="rm-rule-content empty">暂无详细内容</p>
      </div>
    </div>
    <div v-else class="rm-empty">还没有室友公约，一起定几条吧</div>

    <div v-if="modal.open" class="rm-overlay" @click.self="modal.open = false">
      <div class="rm-modal">
        <div class="rm-modal-head">
          <h3>{{ modal.editing ? '编辑公约' : '新增公约' }}</h3>
          <button class="rm-close" @click="modal.open = false">×</button>
        </div>
        <form class="rm-form" @submit.prevent="save">
          <label class="rm-field">
            <span>标题</span>
            <input v-model="form.title" class="rm-input" placeholder="例如：安静时间约定" maxlength="40" />
          </label>
          <label class="rm-field">
            <span>内容</span>
            <textarea
              v-model="form.content"
              class="rm-textarea"
              rows="5"
              placeholder="写下具体约定…"
              maxlength="1000"
            ></textarea>
          </label>
          <div class="rm-modal-actions">
            <button type="button" class="rm-btn" @click="modal.open = false">取消</button>
            <button type="submit" class="rm-btn primary">保存</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'

const emit = defineEmits(['notify'])

const rules = ref([])
const modal = reactive({ open: false, editing: null })
const form = ref({ title: '', content: '' })

async function load() {
  try {
    rules.value = await api('/api/roomie/rules')
  } catch (e) {
    emit('notify', e.message || '公约加载失败', 'error')
  }
}

function openAdd() {
  modal.editing = null
  form.value = { title: '', content: '' }
  modal.open = true
}

function openEdit(r) {
  modal.editing = r
  form.value = { title: r.title, content: r.content || '' }
  modal.open = true
}

async function save() {
  const title = form.value.title.trim()
  if (!title) return emit('notify', '请填写公约标题', 'error')
  try {
    if (modal.editing) {
      await api(`/api/roomie/rules/${modal.editing.id}`, { method: 'PUT', body: form.value })
      emit('notify', '公约已更新')
    } else {
      await api('/api/roomie/rules', { method: 'POST', body: form.value })
      emit('notify', '已新增公约')
    }
    modal.open = false
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
  }
}

async function remove(r) {
  const ok = await confirmDialog({
    title: '删除公约',
    message: `确定删除「${r.title}」吗？`,
  })
  if (!ok) return
  try {
    await api(`/api/roomie/rules/${r.id}`, { method: 'DELETE' })
    emit('notify', '已删除')
    await load()
  } catch (e) {
    emit('notify', e.message || '删除失败', 'error')
  }
}

onMounted(load)
</script>
