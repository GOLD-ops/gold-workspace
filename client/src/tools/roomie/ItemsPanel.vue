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
      ⚠️ 需要补货：{{ lowText }}
    </div>

    <div v-if="items.length" class="rm-list">
      <div v-for="i in items" :key="i.id" class="rm-row" :class="{ low: isLow(i) }">
        <span class="rm-item-emoji">📦</span>
        <div class="rm-row-main">
          <div class="rm-row-title">{{ i.name }}</div>
          <div class="rm-row-sub">{{ i.note || '—' }}</div>
        </div>
        <div class="rm-row-right">
          <div class="rm-row-qty" :class="{ low: isLow(i) }">
            {{ i.quantity }}{{ i.unit }}
          </div>
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
    <div v-else class="rm-empty">还没有登记的公共物品</div>

    <div v-if="modal.open" class="rm-overlay" @click.self="modal.open = false">
      <div class="rm-modal">
        <div class="rm-modal-head">
          <h3>{{ modal.editing ? '编辑物品' : '登记物品' }}</h3>
          <button class="rm-close" @click="modal.open = false">×</button>
        </div>
        <form class="rm-form" @submit.prevent="save">
          <label class="rm-field">
            <span>物品名称</span>
            <input v-model="form.name" class="rm-input" placeholder="例如：洗洁精" maxlength="30" />
          </label>
          <div class="rm-field-row">
            <label class="rm-field">
              <span>当前余量</span>
              <input
                v-model="form.quantity"
                class="rm-input"
                type="number"
                step="any"
                min="0"
                placeholder="0"
              />
            </label>
            <label class="rm-field">
              <span>单位</span>
              <input v-model="form.unit" class="rm-input" list="rm-units" placeholder="个" maxlength="6" />
              <datalist id="rm-units">
                <option value="个"></option>
                <option value="瓶"></option>
                <option value="卷"></option>
                <option value="袋"></option>
                <option value="盒"></option>
                <option value="升"></option>
                <option value="斤"></option>
                <option value="包"></option>
              </datalist>
            </label>
          </div>
          <label class="rm-field">
            <span>低库存提醒阈值（余量 ≤ 该值时提醒）</span>
            <input
              v-model="form.low_threshold"
              class="rm-input"
              type="number"
              step="any"
              min="0"
              placeholder="0 表示不提醒"
            />
          </label>
          <label class="rm-field">
            <span>备注（可选）</span>
            <input v-model="form.note" class="rm-input" placeholder="例如：放在厨房柜子里" maxlength="100" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'

const emit = defineEmits(['notify'])

const items = ref([])
const modal = reactive({ open: false, editing: null })
const form = ref({ name: '', quantity: 0, unit: '个', low_threshold: 0, note: '' })

const lowItems = computed(() => items.value.filter(isLow))
const lowText = computed(() =>
  lowItems.value.map((i) => `${i.name}（剩 ${i.quantity}${i.unit}）`).join('、')
)

function isLow(i) {
  return Number(i.low_threshold) > 0 && Number(i.quantity) <= Number(i.low_threshold)
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
  const name = form.value.name.trim()
  if (!name) return emit('notify', '请填写物品名称', 'error')
  const body = {
    name,
    quantity: Number(form.value.quantity) || 0,
    unit: form.value.unit || '个',
    low_threshold: Number(form.value.low_threshold) || 0,
    note: form.value.note,
  }
  try {
    if (modal.editing) {
      await api(`/api/roomie/items/${modal.editing.id}`, { method: 'PUT', body })
      emit('notify', '物品已更新')
    } else {
      await api('/api/roomie/items', { method: 'POST', body })
      emit('notify', '已登记物品')
    }
    modal.open = false
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
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
    message: `确定删除「${i.name}」吗？`,
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
