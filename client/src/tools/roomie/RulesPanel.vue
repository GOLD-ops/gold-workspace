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
    <div v-else class="rm-empty">还没有室友公约，点「新增公约」一起定几条吧</div>

    <div v-if="modal.open" class="rm-overlay">
      <div class="rm-modal">
        <div class="rm-modal-header">
          <h3>{{ modal.editing ? '编辑公约' : '新增公约' }}</h3>
          <button class="rm-modal-close" @click="closeModal">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field">
              <span>标题</span>
              <input v-model="form.title" class="rm-input" placeholder="例如：安静时间约定" maxlength="40" />
            </div>
            <div class="rm-field">
              <span>内容</span>
              <textarea
                v-model="form.content"
                class="rm-textarea"
                rows="5"
                placeholder="写下具体约定…"
                maxlength="1000"
              ></textarea>
            </div>
          </div>
        </div>
        <div class="rm-modal-footer">
          <button class="rm-btn" :disabled="saving" @click="closeModal">取消</button>
          <button class="rm-btn primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </div>
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
const saving = ref(false)
const modal = reactive({ open: false, editing: null })
const form = ref({ title: '', content: '' })

function closeModal() {
  modal.open = false
}

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
  if (saving.value) return
  const title = form.value.title.trim()
  if (!title) return emit('notify', '请填写公约标题', 'error')
  const body = { title, content: form.value.content }
  saving.value = true
  try {
    if (modal.editing) {
      await api(`/api/roomie/rules/${modal.editing.id}`, { method: 'PUT', body })
      emit('notify', '公约已更新')
    } else {
      await api('/api/roomie/rules', { method: 'POST', body })
      emit('notify', '已新增公约')
    }
    closeModal()
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(r) {
  const ok = await confirmDialog({
    title: '删除公约',
    message: `确定删除「${r.title}」吗？删除后不可恢复。`,
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
