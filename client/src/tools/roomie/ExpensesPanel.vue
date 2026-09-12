<template>
  <div class="rm-panel">
    <div class="rm-section-head">
      <div>
        <h2>费用 AA 分摊</h2>
        <p class="rm-sub">记一笔，自动算清每人该付多少、谁该转给谁</p>
      </div>
      <button class="rm-btn primary" @click="openAdd">+ 记一笔</button>
    </div>

    <div v-if="!roommates.length" class="rm-empty">请先在「室友」页添加一起合租的人</div>

    <template v-else>
      <div v-if="expenses.length" class="rm-settle-card">
        <div class="rm-settle-title">结算概览</div>
        <div class="rm-settle-grid">
          <div v-for="b in settlement.balances" :key="b.roommate.id" class="rm-settle-person">
            <span class="rm-avatar" :style="{ background: roommateColor(b.roommate) }">
              {{ initial(b.roommate.name) }}
            </span>
            <div class="rm-settle-info">
              <div class="rm-settle-name">{{ b.roommate.name }}</div>
              <div class="rm-settle-meta">已垫付 ¥{{ centsToYuan(b.paid_cents) }}</div>
            </div>
            <div
              class="rm-settle-net"
              :class="b.net_cents > 0 ? 'in' : b.net_cents < 0 ? 'out' : 'zero'"
            >
              {{ netText(b.net_cents) }}
            </div>
          </div>
        </div>

        <div v-if="settlement.transfers.length" class="rm-transfer">
          <div class="rm-transfer-title">建议转账</div>
          <div v-for="(t, i) in settlement.transfers" :key="i" class="rm-transfer-line">
            <span class="rm-name">{{ roommateName(t.from) }}</span>
            <span class="rm-arrow">→</span>
            <span class="rm-name">{{ roommateName(t.to) }}</span>
            <span class="rm-transfer-amt">¥{{ centsToYuan(t.cents) }}</span>
          </div>
        </div>
        <div v-else class="rm-transfer-clean">✅ 账目已结清，无需互相转账</div>
      </div>

      <div v-if="!expenses.length" class="rm-empty">还没有费用记录，点「记一笔」开始吧</div>

      <div v-else class="rm-list">
        <div v-for="e in expenses" :key="e.id" class="rm-row">
          <span class="rm-cat">{{ e.category }}</span>
          <div class="rm-row-main">
            <div class="rm-row-title">{{ e.title }}</div>
            <div class="rm-row-sub">
              {{ roommateName(e.payer_id) || '未填写付款人' }} · {{ e.spent_at }}
              <template v-if="e.note"> · {{ e.note }}</template>
            </div>
          </div>
          <div class="rm-row-right">
            <div class="rm-row-amount">¥{{ centsToYuan(e.amount) }}</div>
            <div class="rm-row-parts">{{ e.participants.length }} 人分摊</div>
          </div>
          <div class="rm-row-actions">
            <button class="rm-mini" @click="openEdit(e)">编辑</button>
            <button class="rm-mini danger" @click="remove(e)">删除</button>
          </div>
        </div>
      </div>
    </template>

    <div v-if="modal.open" class="rm-overlay" @click.self="modal.open = false">
      <div class="rm-modal">
        <div class="rm-modal-head">
          <h3>{{ modal.editing ? '编辑费用' : '记一笔' }}</h3>
          <button class="rm-close" @click="modal.open = false">×</button>
        </div>
        <form class="rm-form" @submit.prevent="save">
          <label class="rm-field">
            <span>费用名称</span>
            <input v-model="form.title" class="rm-input" placeholder="例如：本月电费" maxlength="40" />
          </label>
          <div class="rm-field-row">
            <label class="rm-field">
              <span>金额（元）</span>
              <input
                v-model="form.amount"
                class="rm-input"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </label>
            <label class="rm-field">
              <span>分类</span>
              <select v-model="form.category" class="rm-input">
                <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <div class="rm-field-row">
            <label class="rm-field">
              <span>付款人</span>
              <select v-model="form.payer_id" class="rm-input">
                <option :value="null">请选择</option>
                <option v-for="r in roommates" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
            </label>
            <label class="rm-field">
              <span>日期</span>
              <input v-model="form.spent_at" class="rm-input" type="date" />
            </label>
          </div>
          <div class="rm-field">
            <span>参与分摊的室友</span>
            <div class="rm-check-grid">
              <label v-for="r in roommates" :key="r.id" class="rm-check">
                <input v-model="form.participants" type="checkbox" :value="r.id" />
                <span>{{ r.name }}</span>
              </label>
            </div>
          </div>
          <label class="rm-field">
            <span>备注（可选）</span>
            <input v-model="form.note" class="rm-input" placeholder="补充说明" maxlength="100" />
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
import { CATEGORIES, roommateColor, centsToYuan, yuanToCents, todayStr } from './roomie'

const props = defineProps({ roommates: { type: Array, default: () => [] } })
const emit = defineEmits(['notify'])

const expenses = ref([])
const settlement = ref({ balances: [], transfers: [] })

const emptyForm = () => ({
  title: '',
  amount: '',
  category: '其他',
  payer_id: null,
  participants: props.roommates.map((r) => r.id),
  note: '',
  spent_at: todayStr(),
})

const form = ref(emptyForm())
const modal = reactive({ open: false, editing: null })

function initial(name) {
  return (name || '?').slice(0, 1)
}

function roommateName(id) {
  const r = props.roommates.find((x) => x.id === Number(id))
  return r ? r.name : ''
}

function netText(cents) {
  if (cents > 0) return `应收 ¥${centsToYuan(cents)}`
  if (cents < 0) return `应付 ¥${centsToYuan(-cents)}`
  return '已结清'
}

async function load() {
  try {
    const data = await api('/api/roomie/expenses')
    expenses.value = data.expenses
    settlement.value = data.settlement
  } catch (e) {
    emit('notify', e.message || '费用加载失败', 'error')
  }
}

function openAdd() {
  if (!props.roommates.length) {
    emit('notify', '请先添加室友', 'error')
    return
  }
  modal.editing = null
  form.value = emptyForm()
  if (props.roommates.length && form.value.payer_id == null) {
    form.value.payer_id = props.roommates[0].id
  }
  modal.open = true
}

function openEdit(e) {
  modal.editing = e
  form.value = {
    title: e.title,
    amount: centsToYuan(e.amount),
    category: e.category,
    payer_id: e.payer_id,
    participants: e.participants.slice(),
    note: e.note || '',
    spent_at: e.spent_at || todayStr(),
  }
  modal.open = true
}

async function save() {
  const title = form.value.title.trim()
  const amountCents = yuanToCents(form.value.amount)
  if (!title) return emit('notify', '请填写费用名称', 'error')
  if (!amountCents || amountCents <= 0) return emit('notify', '金额需大于 0', 'error')
  if (!form.value.participants.length) return emit('notify', '请至少选择一位参与分摊的室友', 'error')

  const body = {
    title,
    amount: amountCents,
    category: form.value.category,
    payer_id: form.value.payer_id,
    participants: form.value.participants,
    note: form.value.note,
    spent_at: form.value.spent_at,
  }
  try {
    if (modal.editing) {
      await api(`/api/roomie/expenses/${modal.editing.id}`, { method: 'PUT', body })
      emit('notify', '费用已更新')
    } else {
      await api('/api/roomie/expenses', { method: 'POST', body })
      emit('notify', '已记账')
    }
    modal.open = false
    await load()
  } catch (e) {
    emit('notify', e.message || '保存失败', 'error')
  }
}

async function remove(e) {
  const ok = await confirmDialog({
    title: '删除费用',
    message: `确定删除「${e.title}」这笔费用吗？`,
  })
  if (!ok) return
  try {
    await api(`/api/roomie/expenses/${e.id}`, { method: 'DELETE' })
    emit('notify', '已删除')
    await load()
  } catch (err) {
    emit('notify', err.message || '删除失败', 'error')
  }
}

onMounted(load)
</script>
