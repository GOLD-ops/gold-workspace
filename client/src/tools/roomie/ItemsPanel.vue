<template>
  <div class="rm-panel">
    <div class="rm-toolbar rm-items-toolbar">
      <div class="rm-filter-group">
        <input v-model.trim="filters.q" class="rm-input rm-search" placeholder="搜索物品" />
        <select v-model="filters.category" class="rm-input"><option value="">全部分类</option><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
        <select v-model="filters.status" class="rm-input"><option value="">全部状态</option><option value="low">待补货</option><option value="normal">库存正常</option></select>
        <select v-model="filters.owner" class="rm-input"><option value="">全部负责人</option><option v-for="member in roommates" :key="member.id" :value="String(member.id)">{{ member.name }}</option></select>
      </div>
      <div class="rm-toolbar-actions"><span class="rm-result-count">{{ filteredItems.length }} 项 · {{ lowItems.length }} 项待补货</span><button class="rm-btn primary" @click="openItem()">+ 登记物品</button></div>
    </div>

    <div v-if="loading" class="rm-loading">正在加载物品…</div>
    <div v-else-if="items.length" class="rm-card rm-inventory-table">
      <div class="rm-inventory-head"><span>物品</span><span>当前 / 常备量</span><span>提醒阈值</span><span>采购方式</span><span>本次采购人</span><span>状态</span><span>操作</span></div>
      <article v-for="item in filteredItems" :key="item.id" class="rm-inventory-row">
        <div class="rm-inventory-name"><b>{{ item.name }}</b><small>{{ item.category || '其他' }}</small></div>
        <div class="rm-stock-cell"><div class="rm-stock-copy"><b>{{ displayQuantity(item.quantity) }} {{ item.unit }}</b><span>常备 {{ displayQuantity(item.target_quantity) }} {{ item.unit }}</span></div><div class="rm-stock-track" :class="{ low: isLow(item) }"><span :style="{ width: stockPercent(item) }"></span></div></div>
        <span>{{ displayQuantity(item.low_threshold) }} {{ item.unit }}</span>
        <span>{{ purchaseModeLabel(item.purchase_mode) }}</span>
        <span class="rm-owner"><span v-if="item.current_purchaser_id" class="rm-avatar sm">{{ initial(memberName(item.current_purchaser_id)) }}</span>{{ purchaserLabel(item) }}</span>
        <span class="rm-badge" :class="isLow(item) ? 'danger' : ''">{{ isLow(item) ? '待补货' : '库存正常' }}</span>
        <div class="rm-inventory-actions">
          <button v-if="isLow(item) && !item.current_purchaser_id" class="rm-mini" @click="claim(item)">认领</button>
          <button v-if="canRestock(item)" class="rm-mini" @click="openRestock(item)">完成补货</button>
          <button v-else class="rm-mini" @click="openConsume(item)">登记消耗</button>
          <button class="rm-mini" @click="openItem(item)">编辑</button>
        </div>
      </article>
      <div v-if="!filteredItems.length" class="rm-quiet-empty">没有符合当前筛选的物品</div>
    </div>
    <button v-else-if="!loading" class="rm-empty-card" type="button" @click="openItem()">还没有公共物品，登记第一项常用物品</button>

    <div v-if="itemModal.open" class="rm-overlay" @mousedown.self="itemModal.open = false">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header"><h3>{{ itemModal.editing ? '编辑物品' : '登记物品' }}</h3><button class="rm-modal-close" aria-label="关闭" @click="itemModal.open = false">✕</button></div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row"><label class="rm-field"><span>物品名称</span><input v-model.trim="itemForm.name" class="rm-input" maxlength="40" placeholder="例如：洗洁精" /></label><label class="rm-field"><span>分类</span><EditableSelect v-model="itemForm.category" :options="categoryOptions" placeholder="清洁用品" tip="可直接输入新分类" /></label></div>
            <div class="rm-field-row four"><label class="rm-field"><span>当前量</span><input v-model.number="itemForm.quantity" class="rm-input" type="number" min="0" step="any" /></label><label class="rm-field"><span>常备量</span><input v-model.number="itemForm.target_quantity" class="rm-input" type="number" min="0.01" step="any" /></label><label class="rm-field"><span>提醒阈值</span><input v-model.number="itemForm.low_threshold" class="rm-input" type="number" min="0" step="any" /></label><label class="rm-field"><span>单位</span><EditableSelect v-model="itemForm.unit" :options="unitOptions" placeholder="瓶" /></label></div>
            <div class="rm-field-row"><label class="rm-field"><span>采购分配方式</span><select v-model="itemForm.purchase_mode" class="rm-input"><option value="fixed">固定负责人</option><option value="rotation">室友轮换</option><option value="claim">等待认领</option></select></label><label class="rm-field"><span>固定负责人</span><select v-model="itemForm.fixed_purchaser_id" class="rm-input" :disabled="itemForm.purchase_mode !== 'fixed'"><option :value="null">请选择</option><option v-for="member in roommates" :key="member.id" :value="member.id">{{ member.name }}</option></select></label></div>
            <label class="rm-field"><span>备注（可选）</span><input v-model.trim="itemForm.note" class="rm-input" maxlength="120" placeholder="例如：放在厨房水槽下方" /></label>
            <p class="rm-help">当前量小于或等于提醒阈值时，仅生成一个补货待办，并按所选方式确定采购人。</p>
          </div>
        </div>
        <div class="rm-modal-footer"><button v-if="itemModal.editing" class="rm-btn danger" @click="archiveItem">归档</button><span class="rm-modal-spacer"></span><button class="rm-btn" @click="itemModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="saveItem">{{ saving ? '保存中…' : '保存物品' }}</button></div>
      </div>
    </div>

    <div v-if="consumeModal.open" class="rm-overlay" @mousedown.self="consumeModal.open = false">
      <div class="rm-modal"><div class="rm-modal-header"><h3>登记消耗</h3><button class="rm-modal-close" aria-label="关闭" @click="consumeModal.open = false">✕</button></div><div class="rm-modal-body"><div class="rm-field"><span>本次使用数量（{{ consumeModal.item?.unit }}）</span><input v-model.number="consumeForm.amount" class="rm-input" type="number" min="0.01" step="any" /></div><p class="rm-help">当前库存 {{ displayQuantity(consumeModal.item?.quantity) }} {{ consumeModal.item?.unit }}，扣减后不能小于 0。</p></div><div class="rm-modal-footer"><button class="rm-btn" @click="consumeModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="saveConsume">确认消耗</button></div></div>
    </div>

    <div v-if="restockModal.open" class="rm-overlay" @mousedown.self="restockModal.open = false">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header"><h3>完成补货 · {{ restockModal.item?.name }}</h3><button class="rm-modal-close" aria-label="关闭" @click="restockModal.open = false">✕</button></div>
        <div class="rm-modal-body"><div class="rm-form">
          <div class="rm-field-row"><label class="rm-field"><span>本次增加（{{ restockModal.item?.unit }}）</span><input v-model.number="restockForm.quantity" class="rm-input" type="number" min="0.01" step="any" /></label><label class="rm-field"><span>采购人</span><select v-model="restockForm.buyer_id" class="rm-input"><option v-for="member in roommates" :key="member.id" :value="member.id">{{ member.name }}</option></select></label></div>
          <label class="rm-check-line"><input v-model="restockForm.create_expense" type="checkbox" /><span><b>同时生成公共费用</b><small>库存和费用将在同一次操作中保存</small></span></label>
          <div v-if="restockForm.create_expense" class="rm-field-row"><label class="rm-field"><span>实付金额（元）</span><input v-model="restockForm.cost" class="rm-input" type="number" min="0.01" step="0.01" /></label><label class="rm-field"><span>分摊方案</span><select v-model="restockForm.scheme_id" class="rm-input"><option :value="null">三人平均分摊</option><option v-for="scheme in splitSchemes" :key="scheme.id" :value="scheme.id">{{ scheme.name }}</option></select></label></div>
          <p class="rm-help">补货完成后会记录库存流水；若仍低于阈值，补货待办将继续保留。</p>
        </div></div>
        <div class="rm-modal-footer"><button class="rm-btn" @click="restockModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="saveRestock">确认补货</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import EditableSelect from '../../ui/EditableSelect.vue'
import { memberInitial as initial, todayStr, yuanToCents } from './roomie'

const props = defineProps({ roommates: { type: Array, default: () => [] }, currentMemberId: { type: [Number, String], default: null }, splitSchemes: { type: Array, default: () => [] }, guest: { type: Boolean, default: false } })
const emit = defineEmits(['notify', 'alerts-changed'])
const items = ref([])
const serverCategories = ref([])
const loading = ref(true)
const saving = ref(false)
const filters = reactive({ q: '', category: '', status: '', owner: '' })
const itemModal = reactive({ open: false, editing: null })
const itemForm = reactive({ name: '', category: '清洁用品', quantity: 0, target_quantity: 1, low_threshold: 0, unit: '个', purchase_mode: 'rotation', fixed_purchaser_id: null, note: '' })
const consumeModal = reactive({ open: false, item: null })
const consumeForm = reactive({ amount: 1 })
const restockModal = reactive({ open: false, item: null })
const restockForm = reactive({ quantity: 1, buyer_id: null, create_expense: true, cost: '', scheme_id: null })

const DEFAULT_CATEGORIES = [
  '清洁用品',
  '纸品',
  '厨房用品',
  '卫浴用品',
  '洗涤用品',
  '食品饮料',
  '家电工具',
  '其他',
]
const UNIT_VALUES = ['个', '瓶', '卷', '袋', '盒', '包', 'L', 'kg']
const categories = computed(() => [...new Set([...DEFAULT_CATEGORIES, ...serverCategories.value, ...items.value.map((item) => item.category).filter(Boolean)])])
const categoryOptions = computed(() => categories.value.map((value) => ({ value, label: value })))
const unitOptions = UNIT_VALUES.map((value) => ({ value, label: value }))
const lowItems = computed(() => items.value.filter(isLow))
const filteredItems = computed(() => items.value.filter((item) => {
  if (filters.q && !`${item.name} ${item.note || ''}`.toLowerCase().includes(filters.q.toLowerCase())) return false
  if (filters.category && item.category !== filters.category) return false
  if (filters.status === 'low' && !isLow(item)) return false
  if (filters.status === 'normal' && isLow(item)) return false
  if (filters.owner && String(item.current_purchaser_id || item.fixed_purchaser_id || '') !== filters.owner) return false
  return true
}))

function memberName(id) { return props.roommates.find((member) => Number(member.id) === Number(id))?.name || '' }
function displayQuantity(value) { const number = Number(value || 0); return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '') }
function isLow(item) { return item.status === 'low' || (Number(item.low_threshold) > 0 && Number(item.quantity) <= Number(item.low_threshold)) }
function stockPercent(item) { return `${Math.max(0, Math.min(100, Number(item.quantity) / Math.max(0.01, Number(item.target_quantity) || 1) * 100))}%` }
function purchaseModeLabel(mode) { return ({ fixed: '固定负责人', rotation: '室友轮换', claim: '等待认领' })[mode] || '室友轮换' }
function purchaserLabel(item) { if (item.current_purchaser_id) return memberName(item.current_purchaser_id); if (item.purchase_mode === 'claim') return '等待认领'; if (item.fixed_purchaser_id) return memberName(item.fixed_purchaser_id); return '触发后分配' }
function canRestock(item) {
  return isLow(item) &&
    !!props.currentMemberId &&
    Number(item.current_purchaser_id) === Number(props.currentMemberId)
}

async function load() {
  if (props.guest) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const query = props.currentMemberId ? `?actor_id=${props.currentMemberId}` : ''
    const data = await api(`/api/roomie/items${query}`)
    items.value = Array.isArray(data) ? data : data.items || []
    serverCategories.value = Array.isArray(data?.categories) ? data.categories : []
  } catch (error) { emit('notify', error.message || '物品加载失败', 'error') }
  finally { loading.value = false }
}

function openItem(item = null) {
  if (props.guest) return emit('notify', '请先登录后再登记物品', 'error')
  itemModal.editing = item
  Object.assign(itemForm, { name: item?.name || '', category: item?.category || '清洁用品', quantity: Number(item?.quantity || 0), target_quantity: Number(item?.target_quantity || 1), low_threshold: Number(item?.low_threshold || 0), unit: item?.unit || '个', purchase_mode: item?.purchase_mode || 'rotation', fixed_purchaser_id: item?.fixed_purchaser_id || null, note: item?.note || '' })
  itemModal.open = true
}

async function saveItem() {
  if (!itemForm.name) return emit('notify', '请填写物品名称', 'error')
  if (Number(itemForm.quantity) < 0) return emit('notify', '当前量不能小于 0', 'error')
  if (Number(itemForm.target_quantity) <= 0) return emit('notify', '常备量必须大于 0', 'error')
  if (Number(itemForm.low_threshold) < 0 || Number(itemForm.low_threshold) > Number(itemForm.target_quantity)) return emit('notify', '提醒阈值应在 0 与常备量之间', 'error')
  if (itemForm.purchase_mode === 'fixed' && !itemForm.fixed_purchaser_id) return emit('notify', '请选择固定负责人', 'error')
  saving.value = true
  try {
    const body = { ...itemForm, actor_id: Number(props.currentMemberId) || null }
    if (itemModal.editing) await api(`/api/roomie/items/${itemModal.editing.id}`, { method: 'PUT', body })
    else await api('/api/roomie/items', { method: 'POST', body })
    emit('notify', itemModal.editing ? '物品已更新' : '物品已登记')
    itemModal.open = false
    await load(); emit('alerts-changed')
  } catch (error) { emit('notify', error.message || '物品保存失败', 'error') }
  finally { saving.value = false }
}

async function archiveItem() {
  const item = itemModal.editing
  const ok = await confirmDialog({ title: '归档物品', message: `归档「${item.name}」后不会再生成补货提醒，历史流水仍会保留。`, confirmText: '归档' })
  if (!ok) return
  try { await api(`/api/roomie/items/${item.id}`, { method: 'DELETE' }); itemModal.open = false; emit('notify', '物品已归档'); await load(); emit('alerts-changed') }
  catch (error) { emit('notify', error.message || '归档失败', 'error') }
}

async function claim(item) {
  if (!props.currentMemberId) return emit('notify', '请先在设置中指定“我”', 'error')
  try { await api(`/api/roomie/items/${item.id}/claim`, { method: 'POST', body: { actor_id: Number(props.currentMemberId) } }); emit('notify', `已认领 ${item.name} 的采购`); await load(); emit('alerts-changed') }
  catch (error) { emit('notify', error.message || '认领失败', 'error') }
}

function openConsume(item) { consumeModal.item = item; consumeForm.amount = 1; consumeModal.open = true }
async function saveConsume() {
  if (Number(consumeForm.amount) <= 0) return emit('notify', '消耗数量必须大于 0', 'error')
  saving.value = true
  try { await api(`/api/roomie/items/${consumeModal.item.id}/consume`, { method: 'POST', body: { actor_id: Number(props.currentMemberId) || null, amount: Number(consumeForm.amount) } }); consumeModal.open = false; emit('notify', '物品消耗已登记'); await load(); emit('alerts-changed') }
  catch (error) { emit('notify', error.message || '消耗登记失败', 'error') }
  finally { saving.value = false }
}

function openRestock(item) { restockModal.item = item; restockForm.quantity = Math.max(0.01, Number(item.target_quantity || 1) - Number(item.quantity || 0)); restockForm.buyer_id = item.current_purchaser_id || Number(props.currentMemberId) || props.roommates[0]?.id || null; restockForm.create_expense = true; restockForm.cost = ''; restockForm.scheme_id = props.splitSchemes[0]?.id || null; restockModal.open = true }
async function saveRestock() {
  if (Number(restockForm.quantity) <= 0) return emit('notify', '补货数量必须大于 0', 'error')
  if (restockForm.create_expense && yuanToCents(restockForm.cost) <= 0) return emit('notify', '请填写实际采购金额', 'error')
  saving.value = true
  try {
    const costCents = yuanToCents(restockForm.cost)
    const expense = restockForm.create_expense
      ? {
          title: `${restockModal.item.name}补货`,
          amount: costCents,
          category: '日用品',
          payer_id: Number(restockForm.buyer_id),
          spent_at: todayStr(),
          ...(restockForm.scheme_id
            ? { split_method: 'preset', scheme_id: Number(restockForm.scheme_id) }
            : { split_method: 'equal', participants: props.roommates.map((member) => Number(member.id)) }),
        }
      : null
    await api(`/api/roomie/items/${restockModal.item.id}/restock`, {
      method: 'POST',
      body: {
        actor_id: Number(props.currentMemberId) || null,
        quantity: Number(restockForm.quantity),
        buyer_id: Number(restockForm.buyer_id),
        create_expense: restockForm.create_expense,
        cost_cents: costCents,
        scheme_id: restockForm.scheme_id,
        expense,
      },
    })
    restockModal.open = false; emit('notify', restockForm.create_expense ? '补货完成，费用已同步生成' : '补货完成'); await load(); emit('alerts-changed')
  } catch (error) { emit('notify', error.message || '补货保存失败', 'error') }
  finally { saving.value = false }
}

watch(() => props.currentMemberId, load)
onMounted(load)
</script>
