<template>
  <div class="rm-panel">
    <div class="rm-section-head">
      <div>
        <h2>公共物品</h2>
        <p class="rm-sub">登记共用物品，快用完时提醒补货</p>
      </div>
      <button class="rm-btn primary" @click="openAdd">+ 登记物品</button>
    </div>

    <div v-if="lowItems.length" class="rm-low-alert">
      <svg
        class="rm-low-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <span>需要补货：{{ lowText }}</span>
    </div>

    <div v-if="items.length" class="rm-list">
      <div v-for="i in items" :key="i.id" class="rm-row" :class="{ low: isLow(i) }">
        <div class="rm-row-main">
          <div class="rm-row-title">{{ i.name }}</div>
          <div class="rm-row-sub">{{ i.note || '—' }}</div>
        </div>
        <div class="rm-row-right">
          <div class="rm-row-qty" :class="{ low: isLow(i) }">{{ i.quantity }}{{ i.unit }}</div>
          <div class="rm-qty-btns">
            <button class="rm-mini" @click="adjust(i, -1)">−</button>
            <button class="rm-mini" @click="adjust(i, 1)">+</button>
          </div>
        </div>
        <div class="rm-row-actions">
          <button class="rm-mini" @click="openEdit(i)">编辑</button>
          <button class="rm-mini danger" @click="remove(i)">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="rm-empty">还没有登记的公共物品，点「登记物品」开始吧</div>

    <div v-if="modal.open" class="rm-overlay">
      <div class="rm-modal">
        <div class="rm-modal-header">
          <h3>{{ modal.editing ? '编辑物品' : '登记物品' }}</h3>
          <button class="rm-modal-close" @click="closeModal">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field">
              <span>物品名称</span>
              <input v-model="form.name" class="rm-input" placeholder="例如：洗洁精" maxlength="30" />
            </div>
            <div class="rm-field-row">
              <div class="rm-field">
                <span>当前余量</span>
                <input
                  v-model="form.quantity"
                  class="rm-input"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                />
              </div>
              <div class="rm-field">
                <span>单位</span>
                <EditableSelect
                  v-model="form.unit"
                  :options="unitOptions"
                  placeholder="个"
                  tip="可直接输入自定义单位"
                />
              </div>
            </div>
            <div class="rm-field">
              <span>低库存提醒阈值（余量 ≤ 该值时提醒）</span>
              <input
                v-model="form.low_threshold"
                class="rm-input"
                type="number"
                step="any"
                min="0"
                placeholder="0 表示不提醒"
              />
            </div>
            <div class="rm-field">
              <span>备注（可选）</span>
              <input v-model="form.note" class="rm-input" placeholder="例如：放在厨房柜子里" maxlength="100" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import EditableSelect from '../../ui/EditableSelect.vue'

const emit = defineEmits(['notify'])

const UNIT_VALUES = ['个', '瓶', '卷', '袋', '盒', '升', '斤', '包']
const unitOptions = UNIT_VALUES.map((u) => ({ value: u, label: u }))

const items = ref([])
const saving = ref(false)
const modal = reactive({ open: false, editing: null })
const form = ref({ name: '', quantity: 0, unit: '个', low_threshold: 0, note: '' })

const lowItems = computed(() => items.value.filter(isLow))
const lowText = computed(() =>
  lowItems.value.map((i) => `${i.name}（剩 ${i.quantity}${i.unit}）`).join('、')
)

function isLow(i) {
  return Number(i.low_threshold) > 0 && Number(i.quantity) <= Number(i.low_threshold)
}

function closeModal() {
  modal.open = false
}

async function load() {
  try {
    items.value = await api('/api/roomie/items')
  } catch (e) {
    emit('notify', e.message || '物品加载失败', 'error')
  }
}

function openAdd() {
  modal.editing = null
  form.value = { name: '', quantity: 0, unit: '个', low_threshold: 0, note: '' }
  modal.open = true
}

function openEdit(i) {
  modal.editing = i
  form.value = {
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    low_threshold: i.low_threshold,
    note: i.note || '',
  }
  modal.open = true
}

async function save() {
  if (saving.value) return
  const name = form.value.name.trim()
  if (!name) return emit('notify', '请填写物品名称', 'error')
  const body = {
    name,
    quantity: Number(form.value.quantity) || 0,
    unit: form.value.unit || '个',
    low_threshold: Number(form.value.low_threshold) || 0,
    note: form.value.note,
  }
  saving.value = true
  try {
    if (modal.editing) {
      await api(`/api/roomie/items/${modal.editing.id}`, { method: 'PUT', body })
      emit('notify', '物品已更新')
    } else {
      await api('/api/roomie/items', { method: 'POST', body })
      emit('notify', '已登记物品')
    }
    closeModal()
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function adjust(i, delta) {
  const next = Math.max(0, Number(i.quantity) + delta)
  try {
    await api(`/api/roomie/items/${i.id}`, {
      method: 'PUT',
      body: {
        name: i.name,
        quantity: next,
        unit: i.unit,
        low_threshold: i.low_threshold,
        note: i.note || '',
      },
    })
    await load()
  } catch (e) {
    emit('notify', e.message || '更新失败', 'error')
  }
}

async function remove(i) {
  const ok = await confirmDialog({
    title: '删除物品',
    message: `确定删除「${i.name}」吗？删除后不可恢复。`,
  })
  if (!ok) return
  try {
    await api(`/api/roomie/items/${i.id}`, { method: 'DELETE' })
    emit('notify', '已删除')
    await load()
  } catch (e) {
    emit('notify', e.message || '删除失败', 'error')
  }
}

onMounted(load)
</script>
