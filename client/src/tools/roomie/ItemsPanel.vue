<template>
  <div class="rm-panel">
    <div class="rm-toolbar rm-items-toolbar">
      <div class="rm-filter-group">
        <input v-model.trim="filters.q" class="rm-input rm-search" placeholder="搜索物品" />
        <SelectPicker
          v-model="filters.category"
          :options="categoryFilterOptions"
          class="rm-filter-picker"
          aria-label="按分类筛选"
        />
        <SelectPicker
          v-model="filters.status"
          :options="statusFilterOptions"
          class="rm-filter-picker"
          aria-label="按库存状态筛选"
        />
        <SelectPicker
          v-model="filters.owner"
          :options="ownerFilterOptions"
          class="rm-filter-picker"
          aria-label="按负责人筛选"
        />
      </div>
      <div class="rm-toolbar-actions"><span class="rm-result-count">{{ countText }}</span><button class="rm-btn primary" @click="openItem()">+ 登记物品</button></div>
    </div>

    <div v-if="loading" class="rm-loading">正在加载物品…</div>
    <div v-else-if="items.length" class="rm-card rm-inventory-table">
      <div class="rm-inventory-head"><span>物品</span><span>当前 / 常备量</span><span>提醒阈值</span><span>采购方式</span><span>本次采购人</span><span>状态</span><span>操作</span></div>
      <article v-for="item in filteredItems" :key="item.id" class="rm-inventory-row">
        <div class="rm-inventory-name"><b>{{ item.name }}</b><small>{{ item.category || '其他' }}</small></div>
        <div class="rm-stock-cell"><div class="rm-stock-copy"><b>{{ displayQuantity(item.quantity) }} {{ item.unit }}</b><span>常备 {{ displayQuantity(item.target_quantity) }} {{ item.unit }}</span></div><div class="rm-stock-track" :class="{ low: isLow(item) }"><span :style="{ width: stockPercent(item) }"></span></div></div>
        <span>{{ displayQuantity(item.low_threshold) }} {{ item.unit }}</span>
        <span>{{ purchaseModeLabel(item.purchase_mode) }}</span>
        <span class="rm-owner" :class="{ unassigned: !purchaserId(item) }" :title="purchaserTitle(item)">
          <template v-if="purchaserId(item)">
            <span
              class="rm-avatar sm"
              :style="{ background: memberColor(purchaserId(item)) }"
              aria-hidden="true"
            >
              {{ initial(memberName(purchaserId(item))) }}
            </span>
            <span class="rm-owner-name">{{ memberName(purchaserId(item)) }}</span>
            <small v-if="!item.current_purchaser_id" class="rm-owner-hint">固定</small>
          </template>
          <span v-else class="rm-owner-name">{{ purchaserLabel(item) }}</span>
        </span>
        <span class="rm-badge" :class="isLow(item) ? 'danger' : ''">{{ isLow(item) ? '待补货' : '库存正常' }}</span>
        <div class="rm-inventory-actions">
          <button v-if="isLow(item) && !item.current_purchaser_id" class="rm-mini" @click="claim(item)">认领</button>
          <button v-if="canRestock(item)" class="rm-mini" @click="openRestock(item)">完成补货</button>
          <button class="rm-mini" @click="openConsume(item)">登记消耗</button>
          <button class="rm-mini" @click="openItem(item)">编辑</button>
        </div>
      </article>
      <div v-if="!filteredItems.length" class="rm-quiet-empty">没有符合当前筛选的物品</div>
    </div>
    <button v-else-if="!loading" class="rm-empty-card" type="button" @click="openItem()">还没有公共物品，登记第一项常用物品</button>

    <div v-if="itemModal.open" class="rm-overlay">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header"><h3>{{ itemModal.editing ? '编辑物品' : '登记物品' }}</h3><button class="rm-modal-close" aria-label="关闭" @click="itemModal.open = false">✕</button></div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row"><label class="rm-field"><span>物品名称</span><input v-model.trim="itemForm.name" class="rm-input" maxlength="40" placeholder="例如：洗洁精" /></label><label class="rm-field"><span>分类</span><EditableSelect v-model="itemForm.category" :options="categoryOptions" placeholder="清洁用品" tip="可直接输入新分类" /></label></div>
            <div class="rm-field-row four"><label class="rm-field"><span>当前量</span><input v-model.number="itemForm.quantity" class="rm-input" type="number" min="0" step="any" /></label><label class="rm-field"><span>常备量</span><input v-model.number="itemForm.target_quantity" class="rm-input" type="number" min="0.01" step="any" /></label><label class="rm-field"><span>提醒阈值</span><input v-model.number="itemForm.low_threshold" class="rm-input" type="number" min="0" step="any" /></label><label class="rm-field"><span>单位</span><EditableSelect v-model="itemForm.unit" :options="unitOptions" placeholder="瓶" /></label></div>
            <div class="rm-field-row"><div class="rm-field"><span>采购分配方式</span><SelectPicker v-model="itemForm.purchase_mode" :options="purchaseModeOptions" class="rm-picker" /></div><div v-if="itemForm.purchase_mode === 'fixed'" class="rm-field"><span>固定负责人</span><SelectPicker v-model="itemForm.fixed_purchaser_id" :options="purchaserOptions" placeholder="请选择" class="rm-picker" /></div></div>
            <label class="rm-field"><span>备注（可选）</span><input v-model.trim="itemForm.note" class="rm-input" maxlength="120" placeholder="例如：放在厨房水槽下方" /></label>
            <p class="rm-help">当前量小于或等于提醒阈值时，仅生成一个补货待办，并按所选方式确定采购人。</p>
          </div>
        </div>
        <div class="rm-modal-footer"><button v-if="itemModal.editing" class="rm-btn danger" @click="archiveItem">归档</button><span class="rm-modal-spacer"></span><button class="rm-btn" @click="itemModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="saveItem">{{ saving ? '保存中…' : '保存物品' }}</button></div>
      </div>
    </div>

    <div v-if="consumeModal.open" class="rm-overlay">
      <div class="rm-modal"><div class="rm-modal-header"><h3>登记消耗</h3><button class="rm-modal-close" aria-label="关闭" @click="consumeModal.open = false">✕</button></div><div class="rm-modal-body"><div class="rm-field"><span>本次使用数量（{{ consumeModal.item?.unit }}）</span><input v-model.number="consumeForm.amount" class="rm-input" type="number" min="0.01" step="any" /></div><p class="rm-help">当前库存 {{ displayQuantity(consumeModal.item?.quantity) }} {{ consumeModal.item?.unit }}，扣减后不能小于 0。</p></div><div class="rm-modal-footer"><button class="rm-btn" @click="consumeModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="saveConsume">确认消耗</button></div></div>
    </div>

    <div v-if="restockModal.open" class="rm-overlay">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header"><h3>完成补货 · {{ restockModal.item?.name }}</h3><button class="rm-modal-close" aria-label="关闭" @click="restockModal.open = false">✕</button></div>
        <div class="rm-modal-body"><div class="rm-form">
          <div class="rm-field-row"><label class="rm-field"><span>本次增加（{{ restockModal.item?.unit }}）</span><input v-model.number="restockForm.quantity" class="rm-input" type="number" min="0.01" step="any" /></label><div class="rm-field"><span>采购人</span><SelectPicker v-model="restockForm.buyer_id" :options="purchaserOptions" class="rm-picker" /></div></div>
          <label class="rm-check-line"><input v-model="restockForm.create_expense" type="checkbox" /><span><b>同时生成公共费用</b><small>库存和费用将在同一次操作中保存</small></span></label>
          <template v-if="restockForm.create_expense">
            <label class="rm-field"><span>实付金额（元）</span><input v-model="restockForm.cost" class="rm-input" type="number" min="0.01" step="0.01" /></label>

            <fieldset class="rm-field rm-fieldset">
              <legend>参与分摊的成员</legend>
              <div class="rm-check-grid">
                <label v-for="member in roommates" :key="member.id" class="rm-check">
                  <input
                    v-model="restockForm.participants"
                    type="checkbox"
                    :value="Number(member.id)"
                    @change="ensureRestockShares"
                  />
                  <span>{{ member.name }}</span>
                </label>
              </div>
            </fieldset>

            <fieldset class="rm-field rm-fieldset rm-split-field">
              <legend>分摊方式</legend>
              <div class="rm-segmented rm-split-tabs">
                <button
                  v-for="mode in splitModeOptions"
                  :key="mode.value"
                  type="button"
                  :class="{ active: restockForm.split_method === mode.value }"
                  @click="setRestockSplit(mode.value)"
                >
                  {{ mode.label }}
                </button>
              </div>

              <div v-if="restockForm.split_method === 'equal'" class="rm-split-panel">
                <div v-for="share in restockSplitPreview" :key="share.roommate_id" class="rm-split-row readonly">
                  <span>{{ memberName(share.roommate_id) }}</span>
                  <span>平均承担</span>
                  <strong>¥{{ centsToYuan(share.share_cents) }}</strong>
                </div>
              </div>

              <div v-else-if="restockForm.split_method === 'ratio'" class="rm-split-panel">
                <label v-for="member in restockSelectedMembers" :key="member.id" class="rm-split-row">
                  <span>{{ member.name }}</span>
                  <input
                    v-model.number="restockForm.ratioWeights[member.id]"
                    class="rm-input"
                    type="number"
                    min="0"
                    step="0.1"
                    aria-label="分摊比例"
                  />
                  <strong>¥{{ centsToYuan(restockPreviewFor(member.id)) }}</strong>
                </label>
              </div>

              <div v-else class="rm-split-panel">
                <label v-for="member in restockSelectedMembers" :key="member.id" class="rm-split-row">
                  <span>{{ member.name }}</span>
                  <input
                    v-model="restockForm.fixedAmounts[member.id]"
                    class="rm-input"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="承担金额（元）"
                  />
                  <strong>元</strong>
                </label>
              </div>
            </fieldset>
          </template>
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
import SelectPicker from '../recruitment/SelectPicker.vue'
import { centsToYuan, distributeCents, memberInitial as initial, roommateColor, todayStr, yuanToCents } from './roomie'

const props = defineProps({ roommates: { type: Array, default: () => [] }, currentMemberId: { type: [Number, String], default: null }, guest: { type: Boolean, default: false } })
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
const splitModeOptions = [
  { value: 'equal', label: '平均分摊' },
  { value: 'ratio', label: '按比例' },
  { value: 'fixed', label: '固定金额' },
]
const restockForm = reactive({
  quantity: 1,
  buyer_id: null,
  create_expense: true,
  cost: '',
  participants: [],
  split_method: 'equal',
  ratioWeights: {},
  fixedAmounts: {},
})

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
const categoryFilterOptions = computed(() => [
  { value: '', label: '全部分类' },
  ...categories.value.map((value) => ({ value, label: value })),
])
const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'low', label: '待补货' },
  { value: 'normal', label: '库存正常' },
]
const ownerFilterOptions = computed(() => [
  { value: '', label: '全部负责人' },
  ...props.roommates.map((member) => ({ value: String(member.id), label: member.name })),
])
const purchaseModeOptions = [
  { value: 'fixed', label: '固定负责人' },
  { value: 'rotation', label: '室友轮换' },
  { value: 'claim', label: '等待认领' },
]
const purchaserOptions = computed(() =>
  props.roommates.map((member) => ({ value: Number(member.id), label: member.name }))
)
const restockSelectedMembers = computed(() =>
  props.roommates.filter((member) => restockForm.participants.includes(Number(member.id)))
)
const restockAmountCents = computed(() => yuanToCents(restockForm.cost))
const restockSplitPreview = computed(() => {
  const ids = restockSelectedMembers.value.map((member) => Number(member.id))
  if (!ids.length || restockAmountCents.value <= 0) return []
  if (restockForm.split_method === 'fixed') {
    return ids.map((id) => ({ roommate_id: id, share_cents: yuanToCents(restockForm.fixedAmounts[id]) }))
  }
  const weights =
    restockForm.split_method === 'ratio'
      ? ids.map((id) => Math.max(0, Number(restockForm.ratioWeights[id]) || 0))
      : ids.map(() => 1)
  return distributeCents(restockAmountCents.value, ids, weights)
})
const lowItems = computed(() => items.value.filter(isLow))
const filteredItems = computed(() => items.value.filter((item) => {
  if (filters.q && !`${item.name} ${item.note || ''}`.toLowerCase().includes(filters.q.toLowerCase())) return false
  if (filters.category && item.category !== filters.category) return false
  if (filters.status === 'low' && !isLow(item)) return false
  if (filters.status === 'normal' && isLow(item)) return false
  if (filters.owner && String(item.current_purchaser_id || item.fixed_purchaser_id || '') !== filters.owner) return false
  return true
}))
const countText = computed(() => {
  const total = items.value.length
  const showing = filteredItems.value.length
  if (showing !== total) return `筛选 ${showing} / 共 ${total} 项`
  if (!lowItems.value.length) return `共 ${total} 项`
  return `共 ${total} 项，其中 ${lowItems.value.length} 项待补货`
})

function memberName(id) { return props.roommates.find((member) => Number(member.id) === Number(id))?.name || '' }
function memberColor(id) {
  const member = props.roommates.find((item) => Number(item.id) === Number(id))
  return roommateColor(member || { id })
}
function displayQuantity(value) { const number = Number(value || 0); return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, '') }
function isLow(item) { return item.status === 'low' || (Number(item.low_threshold) > 0 && Number(item.quantity) <= Number(item.low_threshold)) }
function stockPercent(item) { return `${Math.max(0, Math.min(100, Number(item.quantity) / Math.max(0.01, Number(item.target_quantity) || 1) * 100))}%` }
function purchaseModeLabel(mode) { return ({ fixed: '固定负责人', rotation: '室友轮换', claim: '等待认领' })[mode] || '室友轮换' }
function purchaserLabel(item) { if (item.current_purchaser_id) return memberName(item.current_purchaser_id); if (item.purchase_mode === 'claim') return '等待认领'; if (item.fixed_purchaser_id) return memberName(item.fixed_purchaser_id); return '触发后分配' }
// 本次采购人：库存偏低时才有；没有时退回展示固定负责人，保证头像始终能显示
function purchaserId(item) {
  return Number(item.current_purchaser_id) || Number(item.fixed_purchaser_id) || 0
}
function purchaserTitle(item) {
  if (item.current_purchaser_id) return `本次采购人：${memberName(item.current_purchaser_id)}`
  if (item.fixed_purchaser_id) return `固定负责人：${memberName(item.fixed_purchaser_id)}，库存偏低时自动分给他`
  if (item.purchase_mode === 'claim') return '等待成员认领'
  return '库存偏低时按成员轮换自动分配'
}
function canRestock(item) {
  // 任何库存都可以补货；只有当这轮采购被其他室友认领时才不可操作
  if (!props.currentMemberId) return false
  return !item.current_purchaser_id || Number(item.current_purchaser_id) === Number(props.currentMemberId)
}

function restockPreviewFor(memberId) {
  return restockSplitPreview.value.find((share) => Number(share.roommate_id) === Number(memberId))?.share_cents || 0
}

function ensureRestockShares() {
  for (const member of restockSelectedMembers.value) {
    const id = Number(member.id)
    if (restockForm.ratioWeights[id] === undefined) restockForm.ratioWeights[id] = 1
    if (restockForm.fixedAmounts[id] === undefined) restockForm.fixedAmounts[id] = '0.00'
  }
}

function setRestockSplit(mode) {
  restockForm.split_method = mode
  ensureRestockShares()
}

function restockRequestShares() {
  if (restockForm.split_method === 'fixed') {
    return restockSelectedMembers.value.map((member) => ({
      roommate_id: Number(member.id),
      share_cents: yuanToCents(restockForm.fixedAmounts[member.id]),
    }))
  }
  if (restockForm.split_method === 'ratio') {
    return restockSelectedMembers.value.map((member) => ({
      roommate_id: Number(member.id),
      weight: Math.max(0, Number(restockForm.ratioWeights[member.id]) || 0),
    }))
  }
  return restockSelectedMembers.value.map((member) => ({ roommate_id: Number(member.id) }))
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

function openRestock(item) {
  restockModal.item = item
  // 默认补到常备量；本来就够的按 1 个单位起步
  const gap = Number(item.target_quantity || 1) - Number(item.quantity || 0)
  restockForm.quantity = gap > 0 ? Number(gap.toFixed(2)) : 1
  restockForm.buyer_id = item.current_purchaser_id || Number(props.currentMemberId) || props.roommates[0]?.id || null
  restockForm.create_expense = true
  restockForm.cost = ''
  restockForm.participants = props.roommates.map((member) => Number(member.id))
  restockForm.split_method = 'equal'
  restockForm.ratioWeights = {}
  restockForm.fixedAmounts = {}
  ensureRestockShares()
  restockModal.open = true
}

async function saveRestock() {
  if (Number(restockForm.quantity) <= 0) return emit('notify', '补货数量必须大于 0', 'error')
  if (restockForm.create_expense && yuanToCents(restockForm.cost) <= 0) return emit('notify', '请填写实际采购金额', 'error')
  if (restockForm.create_expense && !restockSelectedMembers.value.length) {
    return emit('notify', '请至少选择一位参与分摊的成员', 'error')
  }
  if (restockForm.create_expense && restockForm.split_method === 'ratio') {
    if (restockSelectedMembers.value.some((member) => Number(restockForm.ratioWeights[member.id]) <= 0)) {
      return emit('notify', '每位参与成员的分摊比例都必须大于 0', 'error')
    }
  }
  if (restockForm.create_expense && restockForm.split_method === 'fixed') {
    const assigned = restockSelectedMembers.value.reduce(
      (total, member) => total + yuanToCents(restockForm.fixedAmounts[member.id]),
      0
    )
    if (assigned !== yuanToCents(restockForm.cost)) {
      return emit('notify', '每人固定金额之和必须等于费用总额', 'error')
    }
  }
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
          split_method: restockForm.split_method,
          participants: restockSelectedMembers.value.map((member) => Number(member.id)),
          shares: restockRequestShares(),
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
