<template>
  <div class="rm-panel rm-expenses">
    <div v-if="!roommates.length && !guest" class="rm-empty">
      房间暂无成员，把房间编号分享给室友后即可开始记账。
    </div>

    <template v-else>
      <div class="rm-toolbar rm-expense-toolbar">
        <div class="rm-toolbar-filters">
          <label class="rm-search-field">
            <span class="rm-sr-only">搜索费用</span>
            <input
              v-model.trim="filters.keyword"
              class="rm-input"
              type="search"
              placeholder="搜索费用名称"
            />
          </label>
          <SelectPicker
            v-model="filters.category"
            class="rm-toolbar-picker"
            :options="categoryFilterOptions"
            aria-label="按分类筛选"
          />
          <SelectPicker
            v-model="filters.member"
            class="rm-toolbar-picker"
            :options="memberFilterOptions"
            aria-label="按成员筛选"
          />
          <SelectPicker
            v-model="filters.status"
            class="rm-toolbar-picker"
            :options="statusFilterOptions"
            aria-label="按结算状态筛选"
          />
        </div>

        <div class="rm-toolbar-actions">
          <div class="rm-month-picker" aria-label="选择账期">
            <button type="button" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
            <strong>{{ monthLabel }}</strong>
            <button type="button" aria-label="下个月" @click="shiftMonth(1)">›</button>
          </div>
          <div class="rm-segmented" aria-label="费用视图">
            <button
              type="button"
              :class="{ active: view === 'ledger' }"
              :aria-pressed="view === 'ledger'"
              @click="view = 'ledger'"
            >
              账本
            </button>
            <button
              type="button"
              :class="{ active: view === 'settlement', 'has-alert': needsMySettlementAction }"
              :aria-pressed="view === 'settlement'"
              :aria-label="needsMySettlementAction ? '结算，有一项需要处理' : '结算'"
              :title="needsMySettlementAction ? '有转账或收款待你处理' : ''"
              @click="view = 'settlement'"
            >
              结算
              <span v-if="needsMySettlementAction" class="rm-notice-dot" aria-hidden="true"></span>
            </button>
          </div>
          <button class="rm-btn primary" type="button" @click="openAdd">+ 记一笔</button>
        </div>
      </div>

      <div v-if="loading" class="rm-empty">正在读取 {{ monthLabel }} 的费用…</div>

      <template v-else-if="view === 'ledger'">
        <section class="rm-card rm-expense-summary" aria-label="本月费用汇总">
          <div class="rm-summary-metric">
            <span>本月总支出</span>
            <strong class="primary">¥{{ centsToYuan(summaryValues.total) }}</strong>
          </div>
          <div class="rm-summary-divider" aria-hidden="true"></div>
          <div class="rm-summary-metric">
            <span>我的垫付</span>
            <strong>¥{{ centsToYuan(summaryValues.myPaid) }}</strong>
          </div>
          <div class="rm-summary-divider" aria-hidden="true"></div>
          <div class="rm-summary-metric">
            <span>我应承担</span>
            <strong>¥{{ centsToYuan(summaryValues.myShare) }}</strong>
          </div>
          <div class="rm-summary-divider" aria-hidden="true"></div>
          <div class="rm-summary-metric">
            <span>净额</span>
            <strong :class="summaryValues.net >= 0 ? 'primary' : 'danger'">
              {{ netText(summaryValues.net) }}
            </strong>
          </div>
          <span class="rm-summary-count">{{ resultCountText }}</span>
        </section>

        <div v-if="!filteredExpenses.length" class="rm-empty">
          <template v-if="expenses.length">没有符合当前筛选条件的费用。</template>
          <template v-else>这个月还没有费用记录，点「记一笔」开始吧。</template>
        </div>

        <section v-else class="rm-card rm-expense-table" aria-label="费用账本">
          <div class="rm-expense-table-head" aria-hidden="true">
            <span>分类</span>
            <span>费用</span>
            <span>金额</span>
            <span>分摊</span>
            <span>操作</span>
          </div>

          <template v-for="expense in filteredExpenses" :key="expense.id">
            <article
              class="rm-expense-row"
              :class="{ expanded: isExpanded(expense.id) }"
              role="button"
              tabindex="0"
              :aria-expanded="isExpanded(expense.id)"
              @click="toggleExpanded(expense.id)"
              @keydown.enter.prevent="toggleExpanded(expense.id)"
              @keydown.space.prevent="toggleExpanded(expense.id)"
            >
              <span class="rm-cat">{{ expense.category || '其他' }}</span>
              <div class="rm-expense-main">
                <strong>{{ expense.title }}</strong>
                <small>
                  {{ expensePayerName(expense) || '未填写付款人' }}垫付 ·
                  {{ expense.spent_at || '未填写日期' }}
                  <template v-if="expense.note"> · {{ expense.note }}</template>
                </small>
              </div>
              <div class="rm-expense-amount">
                <strong>¥{{ centsToYuan(expenseAmount(expense)) }}</strong>
                <small>{{ expenseParticipantIds(expense).length }} 人</small>
              </div>
              <div class="rm-expense-split">{{ splitLabel(expense) }}</div>
              <div class="rm-expense-actions" @click.stop @keydown.stop>
                <template v-if="expenseStatus(expense) === 'unsettled'">
                  <button class="rm-mini" type="button" @click="openEdit(expense)">编辑</button>
                  <button class="rm-mini danger" type="button" @click="remove(expense)">删除</button>
                </template>
                <span v-else class="rm-badge">{{ expenseStatusText(expense) }}</span>
                <span class="rm-row-chevron" aria-hidden="true">⌄</span>
              </div>
            </article>

            <div v-if="isExpanded(expense.id)" class="rm-expense-detail">
              <div class="rm-share-list">
                <div v-for="share in expenseShares(expense)" :key="share.roommate_id" class="rm-share-item">
                  <span
                    class="rm-avatar sm"
                    :style="{ background: memberColor(roommateById(share.roommate_id), share.roommate_id) }"
                  >
                    {{ initial(roommateName(share.roommate_id)) }}
                  </span>
                  <span>{{ roommateName(share.roommate_id) || '已搬走成员' }}</span>
                  <strong>¥{{ centsToYuan(share.share_cents) }}</strong>
                </div>
              </div>
              <p>
                {{ splitDetail(expense) }} · 由{{ expensePayerName(expense) || '付款人' }}统一垫付
              </p>
            </div>
          </template>
        </section>
      </template>

      <template v-else>
        <div v-if="!settlement.balances.length && !settlement.transfers.length" class="rm-empty">
          <template v-if="expenses.length">本期没有需要互相转账的款项。</template>
          <template v-else>这个月还没有可结算的费用。</template>
        </div>

        <template v-else>
          <section v-if="settlement.balances.length" class="rm-balance-grid" aria-label="成员收支净额">
            <article v-for="balance in settlement.balances" :key="balanceMemberId(balance)" class="rm-balance-card">
              <span
                class="rm-avatar"
                :style="{ background: memberColor(balanceRoommate(balance), balanceMemberId(balance)) }"
              >
                {{ initial(balanceRoommate(balance)?.name) }}
              </span>
              <div class="rm-balance-copy">
                <strong>
                  {{ balanceRoommate(balance)?.name || '已搬走成员' }}
                  <template v-if="Number(balanceMemberId(balance)) === Number(currentMemberId)">（我）</template>
                </strong>
                <small>已垫付 ¥{{ centsToYuan(balancePaid(balance)) }}</small>
              </div>
              <strong
                class="rm-balance-net"
                :class="balanceNet(balance) > 0 ? 'in' : balanceNet(balance) < 0 ? 'out' : 'zero'"
              >
                {{ netText(balanceNet(balance)) }}
              </strong>
            </article>
          </section>

          <section class="rm-card rm-settlement-intro">
            <strong>本期结算清单</strong>
            <span v-if="settlement.status === 'settled'">
              所有转账均已由收款人确认，{{ monthLabel }}账单已经结清。
            </span>
            <span v-else-if="settlement.transfers.length">
              系统已抵消相互欠款；完成以下 {{ settlement.transfers.length }} 笔转账后，{{ monthLabel }}账单将自动结清。
            </span>
            <span v-else>所有成员当前收支相抵，本期账单已经结清。</span>
          </section>

          <section v-if="settlement.transfers.length" class="rm-card rm-settlement-table" aria-label="本期转账清单">
            <div class="rm-settlement-head" aria-hidden="true">
              <span>转账关系</span>
              <span>金额</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            <div v-for="transfer in settlement.transfers" :key="transfer.id" class="rm-settlement-row">
              <div class="rm-transfer-people">
                <span class="rm-avatar sm" :style="{ background: memberColor(transferFrom(transfer), transferFromId(transfer)) }">
                  {{ initial(transferFrom(transfer)?.name) }}
                </span>
                <strong>{{ transferFrom(transfer)?.name || '已搬走成员' }}</strong>
                <span aria-hidden="true">→</span>
                <span class="rm-avatar sm" :style="{ background: memberColor(transferTo(transfer), transferToId(transfer)) }">
                  {{ initial(transferTo(transfer)?.name) }}
                </span>
                <strong>{{ transferTo(transfer)?.name || '已搬走成员' }}</strong>
              </div>
              <strong>¥{{ centsToYuan(transferAmount(transfer)) }}</strong>
              <span class="rm-transfer-state" :class="transferStatus(transfer)">
                {{ transferStatusText(transfer) }}
              </span>
              <div class="rm-transfer-action">
                <button
                  v-if="canMarkPaid(transfer)"
                  class="rm-mini"
                  type="button"
                  :disabled="actingTransferId === transfer.id"
                  @click="markPaid(transfer)"
                >
                  {{ actingTransferId === transfer.id ? '登记中…' : '登记已转账' }}
                </button>
                <button
                  v-else-if="canConfirm(transfer)"
                  class="rm-mini"
                  type="button"
                  :disabled="actingTransferId === transfer.id"
                  @click="confirmReceipt(transfer)"
                >
                  {{ actingTransferId === transfer.id ? '确认中…' : '确认收款' }}
                </button>
                <span v-else class="rm-transfer-wait">{{ transferActionHint(transfer) }}</span>
              </div>
            </div>
          </section>
        </template>
      </template>
    </template>

    <div v-if="modal.open" class="rm-overlay" @mousedown.self="closeModal">
      <div class="rm-modal rm-modal-wide" role="dialog" aria-modal="true" aria-labelledby="rm-expense-modal-title">
        <div class="rm-modal-header">
          <h3 id="rm-expense-modal-title">{{ modal.editing ? '编辑费用' : '记一笔' }}</h3>
          <button class="rm-modal-close" type="button" aria-label="关闭" @click="closeModal">✕</button>
        </div>

        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row">
              <label class="rm-field">
                <span>费用名称</span>
                <input v-model.trim="form.title" class="rm-input" maxlength="40" placeholder="例如：9 月房租" />
              </label>
              <label class="rm-field">
                <span>分类</span>
                <EditableSelect
                  v-model="form.category"
                  :options="categoryOptions"
                  placeholder="选择或输入分类"
                  tip="可直接输入新分类"
                />
              </label>
            </div>

            <div class="rm-field-row">
              <label class="rm-field">
                <span>金额（元）</span>
                <input v-model="form.amount" class="rm-input" type="number" min="0.01" step="0.01" placeholder="0.00" />
              </label>
              <div class="rm-field">
                <span>付款人</span>
                <SelectPicker v-model="form.payer_id" :options="roommateOptions" placeholder="请选择付款人" />
              </div>
            </div>

            <div class="rm-field-row">
              <label class="rm-field">
                <span>日期</span>
                <input v-model="form.spent_at" class="rm-input" type="date" />
              </label>
              <label class="rm-field">
                <span>备注（可选）</span>
                <input v-model.trim="form.note" class="rm-input" maxlength="100" placeholder="补充说明" />
              </label>
            </div>

            <fieldset class="rm-field rm-fieldset">
              <legend>参与分摊的成员</legend>
              <div class="rm-check-grid">
                <label v-for="roommate in roommates" :key="roommate.id" class="rm-check">
                  <input
                    v-model="form.participants"
                    type="checkbox"
                    :value="Number(roommate.id)"
                    @change="ensureShareInputs"
                  />
                  <span>{{ roommate.name }}</span>
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
                  :class="{ active: form.split_method === mode.value }"
                  @click="setSplitMethod(mode.value)"
                >
                  {{ mode.label }}
                </button>
              </div>

              <div v-if="form.split_method === 'preset'" class="rm-split-panel">
                <div class="rm-field">
                  <span>选择预设方案</span>
                  <SelectPicker
                    v-model="form.scheme_id"
                    :options="schemeOptions"
                    placeholder="请选择分摊方案"
                    @change="applyPreset"
                  />
                </div>
                <small class="rm-help">选择方案后会同步参与成员和预设比例。</small>
              </div>

              <div v-else-if="form.split_method === 'equal'" class="rm-split-panel">
                <div v-for="share in splitPreview" :key="share.roommate_id" class="rm-split-row readonly">
                  <span>{{ roommateName(share.roommate_id) }}</span>
                  <span>平均承担</span>
                  <strong>¥{{ centsToYuan(share.share_cents) }}</strong>
                </div>
              </div>

              <div v-else-if="form.split_method === 'ratio'" class="rm-split-panel">
                <label v-for="member in selectedMembers" :key="member.id" class="rm-split-row">
                  <span>{{ member.name }}</span>
                  <input
                    v-model.number="form.ratioWeights[member.id]"
                    class="rm-input"
                    type="number"
                    min="0"
                    step="0.1"
                    aria-label="分摊比例"
                  />
                  <strong>¥{{ centsToYuan(previewAmountFor(member.id)) }}</strong>
                </label>
                <small class="rm-help">比例为 {{ ratioText || '—' }}，系统按比例自动计算到分。</small>
              </div>

              <div v-else class="rm-split-panel">
                <label v-for="member in selectedMembers" :key="member.id" class="rm-split-row">
                  <span>{{ member.name }}</span>
                  <input
                    v-model="form.fixedAmounts[member.id]"
                    class="rm-input"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="承担金额（元）"
                  />
                  <strong>元</strong>
                </label>
                <small class="rm-help" :class="{ error: fixedDifference !== 0 }">
                  已分配 ¥{{ centsToYuan(fixedAssignedTotal) }}，
                  <template v-if="fixedDifference === 0">与费用金额一致。</template>
                  <template v-else-if="fixedDifference > 0">还需分配 ¥{{ centsToYuan(fixedDifference) }}。</template>
                  <template v-else>已超出 ¥{{ centsToYuan(-fixedDifference) }}。</template>
                </small>
              </div>

              <div v-if="form.split_method === 'preset' && selectedScheme" class="rm-split-preview">
                <div v-for="share in splitPreview" :key="share.roommate_id">
                  <span>{{ roommateName(share.roommate_id) }}</span>
                  <strong>¥{{ centsToYuan(share.share_cents) }}</strong>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        <div class="rm-modal-footer">
          <button class="rm-btn" type="button" :disabled="saving" @click="closeModal">取消</button>
          <button class="rm-btn primary" type="button" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存费用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import EditableSelect from '../../ui/EditableSelect.vue'
import SelectPicker from '../recruitment/SelectPicker.vue'
import {
  CATEGORIES,
  centsToYuan,
  memberInitial as initial,
  roommateColor,
  todayStr,
  yuanToCents,
} from './roomie'

const props = defineProps({
  roommates: { type: Array, default: () => [] },
  currentMemberId: { type: [Number, String], default: null },
  splitSchemes: { type: Array, default: () => [] },
  guest: { type: Boolean, default: false },
})

const emit = defineEmits(['notify', 'alerts-changed'])

const view = ref('ledger')
const month = ref(currentMonth())
const expenses = ref([])
const summary = ref({})
const categories = ref([])
const settlement = ref({ balances: [], transfers: [], status: 'empty' })
const loading = ref(false)
const saving = ref(false)
const actingTransferId = ref(null)
const expandedIds = ref([])
const loadSequence = ref(0)

const filters = reactive({ keyword: '', category: 'all', member: 'all', status: 'all' })
const modal = reactive({ open: false, editing: null })
const form = reactive(emptyForm())

const splitModeOptions = [
  { value: 'equal', label: '平均分摊' },
  { value: 'ratio', label: '按比例' },
  { value: 'fixed', label: '固定金额' },
  { value: 'preset', label: '使用预设' },
]

const statusFilterOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'unsettled', label: '未结算' },
  { value: 'settling', label: '结算中' },
  { value: 'settled', label: '已结清' },
]

const availableCategories = computed(() => {
  const values = [...CATEGORIES, ...categories.value, ...expenses.value.map((expense) => expense.category)]
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
})

const categoryOptions = computed(() =>
  availableCategories.value.map((value) => ({ value, label: value }))
)

const categoryFilterOptions = computed(() => [
  { value: 'all', label: '全部分类' },
  ...availableCategories.value.map((value) => ({ value, label: value })),
])

const memberFilterOptions = computed(() => [
  { value: 'all', label: '全部成员' },
  { value: 'me', label: '只看与我有关' },
  ...props.roommates.map((roommate) => ({ value: String(roommate.id), label: roommate.name })),
])

const roommateOptions = computed(() =>
  props.roommates.map((roommate) => ({ value: Number(roommate.id), label: roommate.name }))
)

const normalizedSchemes = computed(() => props.splitSchemes.map(normalizeScheme))
const schemeOptions = computed(() =>
  normalizedSchemes.value.map((scheme) => ({
    value: scheme.id,
    label: `${scheme.name} · ${scheme.mode === 'equal' ? '平均分摊' : schemeRatioLabel(scheme)}`,
  }))
)

const selectedScheme = computed(() =>
  normalizedSchemes.value.find((scheme) => String(scheme.id) === String(form.scheme_id)) || null
)

const selectedMembers = computed(() =>
  props.roommates.filter((roommate) => form.participants.includes(Number(roommate.id)))
)

const amountCents = computed(() => yuanToCents(form.amount))

const splitPreview = computed(() => {
  const ids = selectedMembers.value.map((member) => Number(member.id))
  if (!ids.length || amountCents.value <= 0) return []

  if (form.split_method === 'fixed') {
    return ids.map((id) => ({ roommate_id: id, share_cents: yuanToCents(form.fixedAmounts[id]) }))
  }

  let weights = ids.map(() => 1)
  if (form.split_method === 'ratio') {
    weights = ids.map((id) => Math.max(0, Number(form.ratioWeights[id]) || 0))
  } else if (form.split_method === 'preset' && selectedScheme.value?.mode !== 'equal') {
    weights = ids.map((id) => Math.max(0, Number(selectedScheme.value.weights[id]) || 0))
  }

  return distributeCents(amountCents.value, ids, weights)
})

const fixedAssignedTotal = computed(() =>
  selectedMembers.value.reduce(
    (total, member) => total + yuanToCents(form.fixedAmounts[member.id]),
    0
  )
)
const fixedDifference = computed(() => amountCents.value - fixedAssignedTotal.value)
const ratioText = computed(() =>
  selectedMembers.value.map((member) => Number(form.ratioWeights[member.id]) || 0).join(':')
)

const filteredExpenses = computed(() => {
  const keyword = filters.keyword.toLocaleLowerCase()
  return expenses.value.filter((expense) => {
    if (keyword) {
      const haystack = [expense.title, expense.category, expense.note, expensePayerName(expense)]
        .join(' ')
        .toLocaleLowerCase()
      if (!haystack.includes(keyword)) return false
    }
    if (filters.category !== 'all' && expense.category !== filters.category) return false
    if (filters.status !== 'all' && expenseStatus(expense) !== filters.status) return false
    if (filters.member !== 'all') {
      const memberId = filters.member === 'me' ? Number(props.currentMemberId) : Number(filters.member)
      if (!expenseInvolves(expense, memberId)) return false
    }
    return true
  })
})

const summaryValues = computed(() => {
  const fallback = calculateSummary(expenses.value, Number(props.currentMemberId))
  return {
    total: firstNumber(summary.value.total_amount, summary.value.total_cents, summary.value.total, fallback.total),
    myPaid: firstNumber(summary.value.my_paid, summary.value.my_paid_cents, fallback.myPaid),
    myShare: firstNumber(summary.value.my_share, summary.value.my_share_cents, fallback.myShare),
    myNet: 0,
    net: firstNumber(summary.value.my_net, summary.value.my_net_cents, fallback.net),
  }
})

const resultCountText = computed(() => {
  if (filteredExpenses.value.length === expenses.value.length) return `共 ${expenses.value.length} 笔`
  return `筛选 ${filteredExpenses.value.length} / 共 ${expenses.value.length} 笔`
})

const monthLabel = computed(() => {
  const [year, monthNumber] = month.value.split('-')
  return `${year} 年 ${Number(monthNumber)} 月`
})

const needsMySettlementAction = computed(() =>
  settlement.value.transfers.some((transfer) => canMarkPaid(transfer) || canConfirm(transfer))
)

watch(
  [month, () => props.currentMemberId],
  () => load(),
  { immediate: true }
)

function currentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function emptyForm() {
  return {
    title: '',
    amount: '',
    category: '其他',
    payer_id: null,
    spent_at: todayStr(),
    note: '',
    participants: [],
    split_method: 'equal',
    scheme_id: '',
    ratioWeights: {},
    fixedAmounts: {},
  }
}

function memberColor(member, fallbackId = 0) {
  return roommateColor(member || { id: fallbackId })
}

function firstNumber(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value))) {
      return Math.round(Number(value))
    }
  }
  return 0
}

function roommateById(id) {
  return props.roommates.find((roommate) => Number(roommate.id) === Number(id)) || null
}

function roommateName(id) {
  return roommateById(id)?.name || ''
}

function expenseAmount(expense) {
  return firstNumber(expense.amount, expense.amount_cents)
}

function expensePayerId(expense) {
  return Number(expense.payer_id ?? expense.payer?.id) || null
}

function expensePayerName(expense) {
  return expense.payer?.name || roommateName(expensePayerId(expense))
}

function expenseParticipantIds(expense) {
  const participants = Array.isArray(expense.participants) ? expense.participants : []
  const participantIds = participants.map((item) =>
    Number(typeof item === 'object' ? item.roommate_id ?? item.member_id ?? item.id : item)
  )
  const shareIds = (Array.isArray(expense.shares) ? expense.shares : []).map((share) =>
    Number(share.roommate_id ?? share.member_id ?? share.id)
  )
  return [...new Set([...participantIds, ...shareIds].filter(Boolean))]
}

function expenseShares(expense) {
  const rawShares = Array.isArray(expense.shares) ? expense.shares : []
  if (rawShares.length) {
    return rawShares.map((share) => ({
      roommate_id: Number(share.roommate_id ?? share.member_id ?? share.id),
      share_cents: firstNumber(share.share_cents, share.amount, share.amount_cents),
      weight: Number(share.weight ?? share.value) || 0,
    }))
  }
  const ids = expenseParticipantIds(expense)
  return distributeCents(expenseAmount(expense), ids, ids.map(() => 1))
}

function expenseStatus(expense) {
  const value = String(expense.status || 'unsettled')
  if (['settled', 'confirmed', 'closed'].includes(value)) return 'settled'
  if (['settling', 'paid', 'processing'].includes(value)) return 'settling'
  return 'unsettled'
}

function expenseStatusText(expense) {
  return expenseStatus(expense) === 'settled' ? '已结清' : '结算中'
}

function expenseInvolves(expense, memberId) {
  if (!memberId) return false
  return expensePayerId(expense) === memberId || expenseParticipantIds(expense).includes(memberId)
}

function splitMethod(expense) {
  return expense.split_method || expense.split_mode || 'equal'
}

function splitLabel(expense) {
  const mode = splitMethod(expense)
  if (mode === 'equal') return '平均分摊'
  if (mode === 'fixed') return '固定金额'
  if (mode === 'preset') {
    const scheme = normalizedSchemes.value.find((item) => String(item.id) === String(expense.scheme_id))
    return scheme ? `预设 · ${scheme.name}` : '使用预设'
  }
  const weights = expenseShares(expense).map((share) => share.weight).filter((weight) => weight > 0)
  return weights.length ? `按比例 ${weights.join(':')}` : '按比例'
}

function splitDetail(expense) {
  const mode = splitMethod(expense)
  if (mode === 'preset') {
    const scheme = normalizedSchemes.value.find((item) => String(item.id) === String(expense.scheme_id))
    return scheme ? `使用「${scheme.name}」` : '使用预设方案'
  }
  return splitLabel(expense)
}

function netText(cents) {
  if (cents > 0) return `应收 ¥${centsToYuan(cents)}`
  if (cents < 0) return `应付 ¥${centsToYuan(-cents)}`
  return '已结清'
}

function calculateSummary(items, currentId) {
  let total = 0
  let myPaid = 0
  let myShare = 0
  for (const expense of items) {
    const amount = expenseAmount(expense)
    total += amount
    if (expensePayerId(expense) === currentId) myPaid += amount
    const ownShare = expenseShares(expense).find((share) => Number(share.roommate_id) === currentId)
    if (ownShare) myShare += ownShare.share_cents
  }
  return { total, myPaid, myShare, net: myPaid - myShare }
}

function distributeCents(total, ids, weights) {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0))
  const safeWeights = weights.map((weight) => Math.max(0, Number(weight) || 0))
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0)
  if (!ids.length || weightTotal <= 0) {
    return ids.map((id) => ({ roommate_id: Number(id), share_cents: 0, weight: 0 }))
  }

  const exact = safeWeights.map((weight) => (safeTotal * weight) / weightTotal)
  const allocated = exact.map(Math.floor)
  let remainder = safeTotal - allocated.reduce((sum, value) => sum + value, 0)
  const remainderOrder = exact
    .map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    allocated[remainderOrder[index % remainderOrder.length].index] += 1
  }
  return ids.map((id, index) => ({
    roommate_id: Number(id),
    share_cents: allocated[index],
    weight: safeWeights[index],
  }))
}

function normalizeScheme(scheme) {
  let storedWeights = scheme?.weights || {}
  if (typeof storedWeights === 'string') {
    try {
      storedWeights = JSON.parse(storedWeights)
    } catch {
      storedWeights = {}
    }
  }
  const members = Array.isArray(scheme?.members) ? scheme.members : []
  const memberWeights = Object.fromEntries(
    members.map((member) => [
      Number(member.roommate_id ?? member.member_id ?? member.id),
      Number(member.weight ?? member.value ?? 0),
    ])
  )
  return {
    id: scheme?.id,
    name: scheme?.name || '未命名方案',
    mode: scheme?.split_method || scheme?.mode || 'ratio',
    weights: { ...storedWeights, ...memberWeights },
    memberIds: members.length
      ? members.map((member) => Number(member.roommate_id ?? member.member_id ?? member.id)).filter(Boolean)
      : Object.keys(storedWeights).map(Number).filter(Boolean),
  }
}

function schemeRatioLabel(scheme) {
  const ids = scheme.memberIds.length
    ? scheme.memberIds
    : props.roommates.map((roommate) => Number(roommate.id))
  return ids.map((id) => Number(scheme.weights[id]) || 0).join(':') || '按比例'
}

function shiftMonth(offset) {
  const [year, monthNumber] = month.value.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  month.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  expandedIds.value = []
}

async function load() {
  if (props.guest) {
    loading.value = false
    return
  }
  const sequence = ++loadSequence.value
  loading.value = true
  try {
    const actorQuery = props.currentMemberId
      ? `?actor_id=${encodeURIComponent(props.currentMemberId)}`
      : ''
    const [expenseData, settlementData] = await Promise.all([
      api(`/api/roomie/expenses?month=${encodeURIComponent(month.value)}`),
      api(`/api/roomie/settlements/${encodeURIComponent(month.value)}${actorQuery}`),
    ])
    if (sequence !== loadSequence.value) return
    expenses.value = Array.isArray(expenseData?.expenses) ? expenseData.expenses : []
    summary.value = expenseData?.summary || {}
    categories.value = Array.isArray(expenseData?.categories) ? expenseData.categories : []
    if (
      filters.category !== 'all' &&
      ![...categories.value, ...expenses.value.map((expense) => expense.category)].includes(filters.category)
    ) {
      filters.category = 'all'
    }
    settlement.value = {
      ...(settlementData || {}),
      balances: Array.isArray(settlementData?.balances) ? settlementData.balances : [],
      transfers: Array.isArray(settlementData?.transfers) ? settlementData.transfers : [],
    }
  } catch (error) {
    if (sequence !== loadSequence.value) return
    expenses.value = []
    summary.value = {}
    categories.value = []
    settlement.value = { balances: [], transfers: [], status: 'empty' }
    emit('notify', error.message || '费用加载失败', 'error')
  } finally {
    if (sequence === loadSequence.value) loading.value = false
  }
}

function isExpanded(id) {
  return expandedIds.value.includes(String(id))
}

function toggleExpanded(id) {
  const key = String(id)
  expandedIds.value = isExpanded(key)
    ? expandedIds.value.filter((value) => value !== key)
    : [...expandedIds.value, key]
}

function resetForm(values = {}) {
  Object.assign(form, emptyForm(), values)
  ensureShareInputs()
}

function openAdd() {
  if (props.guest) return emit('notify', '请先登录后再记账', 'error')
  if (!props.roommates.length) return emit('notify', '房间暂无成员，请分享房间编号邀请室友加入', 'error')
  modal.editing = null
  const participantIds = props.roommates.map((roommate) => Number(roommate.id))
  resetForm({
    payer_id: Number(props.currentMemberId) || participantIds[0] || null,
    participants: participantIds,
    spent_at: month.value === currentMonth() ? todayStr() : `${month.value}-01`,
  })
  modal.open = true
}

function openEdit(expense) {
  modal.editing = expense
  const participantIds = expenseParticipantIds(expense)
  const shares = expenseShares(expense)
  const method = splitMethod(expense)
  resetForm({
    title: expense.title || '',
    amount: centsToYuan(expenseAmount(expense)),
    category: expense.category || '其他',
    payer_id: expensePayerId(expense),
    spent_at: expense.spent_at || todayStr(),
    note: expense.note || '',
    participants: participantIds,
    split_method: method,
    scheme_id: expense.scheme_id || '',
    ratioWeights: Object.fromEntries(shares.map((share) => [share.roommate_id, share.weight || 1])),
    fixedAmounts: Object.fromEntries(
      shares.map((share) => [share.roommate_id, centsToYuan(share.share_cents)])
    ),
  })
  modal.open = true
}

function closeModal() {
  if (saving.value) return
  modal.open = false
}

function ensureShareInputs() {
  for (const member of selectedMembers.value) {
    const id = Number(member.id)
    if (form.ratioWeights[id] === undefined) form.ratioWeights[id] = 1
    if (form.fixedAmounts[id] === undefined) form.fixedAmounts[id] = '0.00'
  }
}

function setSplitMethod(mode) {
  form.split_method = mode
  ensureShareInputs()
  if (mode === 'preset' && !form.scheme_id && normalizedSchemes.value.length) {
    form.scheme_id = normalizedSchemes.value[0].id
    applyPreset(form.scheme_id)
  }
}

function applyPreset(schemeId) {
  form.scheme_id = schemeId
  const scheme = normalizedSchemes.value.find((item) => String(item.id) === String(schemeId))
  if (!scheme) return
  const availableIds = props.roommates.map((roommate) => Number(roommate.id))
  const schemeIds = scheme.memberIds.filter((id) =>
    availableIds.includes(Number(id)) &&
    (scheme.mode !== 'ratio' || Number(scheme.weights[id]) > 0)
  )
  form.participants = schemeIds.length ? schemeIds : availableIds
  for (const id of form.participants) form.ratioWeights[id] = Number(scheme.weights[id]) || 1
  ensureShareInputs()
}

function previewAmountFor(memberId) {
  return splitPreview.value.find((share) => Number(share.roommate_id) === Number(memberId))?.share_cents || 0
}

function requestShares() {
  if (form.split_method === 'fixed') {
    return selectedMembers.value.map((member) => ({
      roommate_id: Number(member.id),
      share_cents: yuanToCents(form.fixedAmounts[member.id]),
    }))
  }
  if (form.split_method === 'ratio') {
    return selectedMembers.value.map((member) => ({
      roommate_id: Number(member.id),
      weight: Math.max(0, Number(form.ratioWeights[member.id]) || 0),
    }))
  }
  if (form.split_method === 'preset' && selectedScheme.value?.mode !== 'equal') {
    return selectedMembers.value.map((member) => ({
      roommate_id: Number(member.id),
      weight: Math.max(0, Number(selectedScheme.value.weights[member.id]) || 0),
    }))
  }
  return selectedMembers.value.map((member) => ({ roommate_id: Number(member.id) }))
}

function validateForm() {
  if (!form.title) return '请填写费用名称'
  if (amountCents.value <= 0) return '金额需大于 0'
  if (!form.category) return '请选择或输入费用分类'
  if (!form.payer_id || !roommateById(form.payer_id)) return '请选择付款人'
  if (!form.spent_at) return '请选择费用日期'
  if (!selectedMembers.value.length) return '请至少选择一位参与分摊的成员'
  if (form.split_method === 'ratio') {
    if (selectedMembers.value.some((member) => Number(form.ratioWeights[member.id]) <= 0)) {
      return '每位参与成员的分摊比例都必须大于 0；不参与的成员请取消勾选'
    }
  }
  if (form.split_method === 'fixed') {
    if (selectedMembers.value.some((member) => yuanToCents(form.fixedAmounts[member.id]) < 0)) {
      return '固定金额不能小于 0'
    }
    if (fixedDifference.value !== 0) return '每人固定金额之和必须等于费用总额'
  }
  if (form.split_method === 'preset') {
    if (!selectedScheme.value) return '请选择一个分摊方案'
    if (
      selectedScheme.value.mode !== 'equal' &&
      !selectedMembers.value.some((member) => Number(selectedScheme.value.weights[member.id]) > 0)
    ) {
      return '所选方案没有可用的成员比例'
    }
  }
  return ''
}

async function save() {
  if (saving.value) return
  const error = validateForm()
  if (error) return emit('notify', error, 'error')

  const body = {
    title: form.title,
    amount: amountCents.value,
    category: form.category,
    payer_id: Number(form.payer_id),
    spent_at: form.spent_at,
    note: form.note,
    split_method: form.split_method,
    scheme_id: form.split_method === 'preset' ? form.scheme_id : null,
    shares: requestShares(),
  }
  saving.value = true
  try {
    if (modal.editing) {
      await api(`/api/roomie/expenses/${modal.editing.id}`, { method: 'PUT', body })
      emit('notify', '费用已更新')
    } else {
      await api('/api/roomie/expenses', { method: 'POST', body })
      emit('notify', '费用已记录')
    }
    modal.open = false
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '费用保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function remove(expense) {
  const confirmed = await confirmDialog({
    title: '删除费用',
    message: `确定删除「${expense.title}」吗？结算结果会随之重新计算。`,
    confirmText: '删除',
  })
  if (!confirmed) return
  try {
    await api(`/api/roomie/expenses/${expense.id}`, { method: 'DELETE' })
    emit('notify', '费用已删除')
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '费用删除失败', 'error')
  }
}

function balanceMemberId(balance) {
  return Number(balance.roommate_id ?? balance.member_id ?? balance.roommate?.id ?? balance.member?.id)
}

function balanceRoommate(balance) {
  return balance.roommate || balance.member || roommateById(balanceMemberId(balance))
}

function balancePaid(balance) {
  return firstNumber(balance.paid_cents, balance.paid)
}

function balanceNet(balance) {
  return firstNumber(balance.net_cents, balance.net)
}

function transferFromId(transfer) {
  return Number(transfer.from_roommate_id ?? transfer.from_member_id ?? transfer.from?.id ?? transfer.from)
}

function transferToId(transfer) {
  return Number(transfer.to_roommate_id ?? transfer.to_member_id ?? transfer.to?.id ?? transfer.to)
}

function transferFrom(transfer) {
  return transfer.from_roommate || transfer.from_member ||
    (typeof transfer.from === 'object' ? transfer.from : null) || roommateById(transferFromId(transfer))
}

function transferTo(transfer) {
  return transfer.to_roommate || transfer.to_member ||
    (typeof transfer.to === 'object' ? transfer.to : null) || roommateById(transferToId(transfer))
}

function transferAmount(transfer) {
  return firstNumber(transfer.amount, transfer.amount_cents, transfer.cents)
}

function transferStatus(transfer) {
  const status = String(transfer.status || 'pending')
  if (['confirmed', 'settled', 'complete'].includes(status)) return 'confirmed'
  if (['paid', 'marked_paid'].includes(status)) return 'paid'
  return 'pending'
}

function transferStatusText(transfer) {
  const status = transferStatus(transfer)
  if (status === 'confirmed') return '收款方已确认 · 已结清'
  if (status === 'paid') return `${transferFrom(transfer)?.name || '付款方'}已登记 · 待收款确认`
  return `待${transferFrom(transfer)?.name || '付款方'}转账`
}

function canMarkPaid(transfer) {
  return transferStatus(transfer) === 'pending' &&
    Number(transferFromId(transfer)) === Number(props.currentMemberId)
}

function canConfirm(transfer) {
  return transferStatus(transfer) === 'paid' &&
    Number(transferToId(transfer)) === Number(props.currentMemberId)
}

function transferActionHint(transfer) {
  const status = transferStatus(transfer)
  if (status === 'confirmed') return '已完成'
  if (status === 'paid') return `等待${transferTo(transfer)?.name || '收款方'}确认`
  return `等待${transferFrom(transfer)?.name || '付款方'}登记`
}

async function updateTransfer(transfer, action) {
  if (actingTransferId.value !== null) return
  actingTransferId.value = transfer.id
  try {
    await api(`/api/roomie/settlement-transfers/${transfer.id}/${action}`, {
      method: 'POST',
      body: { actor_id: Number(props.currentMemberId) },
    })
    emit('notify', action === 'mark-paid' ? '已登记转账，等待对方确认收款' : '收款已确认')
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '结算状态更新失败', 'error')
  } finally {
    actingTransferId.value = null
  }
}

async function markPaid(transfer) {
  const confirmed = await confirmDialog({
    title: '登记已转账',
    message: `确认已向${transferTo(transfer)?.name || '收款方'}转账 ¥${centsToYuan(transferAmount(transfer))}？登记后需要对方确认收款。`,
    confirmText: '确认已转账',
    danger: false,
  })
  if (confirmed) return updateTransfer(transfer, 'mark-paid')
}

async function confirmReceipt(transfer) {
  const confirmed = await confirmDialog({
    title: '确认收款',
    message: `确认已收到${transferFrom(transfer)?.name || '付款方'}转来的 ¥${centsToYuan(transferAmount(transfer))}？确认后该笔转账将结清。`,
    confirmText: '确认已收款',
    danger: false,
  })
  if (confirmed) return updateTransfer(transfer, 'confirm')
}
</script>
