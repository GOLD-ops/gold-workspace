<template>
  <div class="rm-panel">
    <section class="rm-rule-section">
      <div class="rm-block-head compact">
        <div>
          <h2><span v-if="needsMyVote" class="rm-inline-alert" aria-hidden="true"></span>待你确认</h2>
          <p>{{ pendingSummary }}</p>
        </div>
        <button class="rm-btn primary" :disabled="!currentMemberId" @click="openProposal()">+ 发起公约提案</button>
      </div>

      <template v-if="pending.length">
        <article v-for="proposal in pending" :key="proposal.id" class="rm-card rm-proposal">
          <div class="rm-proposal-main">
            <div class="rm-proposal-meta">
              <span class="rm-badge blue">{{ proposalStatus(proposal) }}</span>
              <span>{{ memberName(proposal.proposer_id) || '成员' }}发起</span>
              <span>{{ shortDate(proposal.created_at) }}</span>
              <span v-if="proposal.deadline">截止至 {{ shortDate(proposal.deadline) }}</span>
            </div>
            <h3>{{ proposalTitle(proposal) }}</h3>
            <p>{{ proposal.content || '暂未填写详细约定' }}</p>
            <button
              v-if="canEditProposal(proposal)"
              class="rm-text-btn"
              @click="openProposal(proposal.proposal_type || 'create', proposal.parent_rule_id, proposal)"
            >
              编辑本次提案
            </button>
          </div>

          <div class="rm-vote-panel">
            <div class="rm-vote-overview">
              <div class="rm-vote-title">
                <span>确认情况</span>
                <strong>{{ agreeCount(proposal) }} / {{ voterCount(proposal) }}<small>人已确认</small></strong>
              </div>
              <div class="rm-progress"><span :style="{ width: voteProgress(proposal) }"></span></div>
            </div>
            <div v-if="revisionComments(proposal).length" class="rm-revision-list">
              <p v-for="vote in revisionComments(proposal)" :key="vote.roommate_id">
                <b>{{ memberName(vote.roommate_id) }}</b>
                <span>{{ vote.comment }}</span>
              </p>
            </div>
            <div class="rm-vote-bottom">
              <div class="rm-voters">
                <div
                  v-for="vote in proposal.votes || []"
                  :key="vote.roommate_id"
                  class="rm-voter"
                  :class="{ pending: !vote.decision || vote.decision === 'pending', revise: vote.decision === 'revise' }"
                >
                  <span class="rm-avatar sm">{{ initial(memberName(vote.roommate_id)) }}</span>
                  <span class="rm-voter-copy">
                    <b>{{ memberName(vote.roommate_id) }}</b>
                    <small>{{ voteLabel(vote.decision) }}</small>
                  </span>
                </div>
              </div>
              <div v-if="canVote(proposal)" class="rm-proposal-actions">
                <button class="rm-btn primary sm" :disabled="busyId === proposal.id" @click="agree(proposal)">确认同意</button>
                <button class="rm-btn sm" :disabled="busyId === proposal.id" @click="openFeedback(proposal)">提出修改</button>
              </div>
              <div v-else-if="isFullyAgreed(proposal)" class="rm-vote-success">
                <span class="rm-vote-success-icon">✓</span>
                <span><b>全员已确认</b><small>公约已自动生效</small></span>
              </div>
              <div v-else class="rm-vote-waiting">{{ myVoteText(proposal) }}</div>
            </div>
          </div>
        </article>
        <div class="rm-rule-note"><span>i</span>所有在住成员同意后提案才会生效；若内容有修改，需要大家重新确认。</div>
      </template>
      <div v-else class="rm-quiet-empty">目前没有待确认提案</div>
    </section>

    <section class="rm-rule-section">
      <div class="rm-block-head compact">
        <div><h2>已生效公约</h2><p>当前共同遵守的 {{ active.length }} 条约定</p></div>
      </div>
      <div v-if="active.length" class="rm-rule-list">
        <article v-for="rule in active" :key="rule.id" class="rm-card rm-active-rule">
          <div class="rm-active-rule-head">
            <h3>{{ rule.title }}</h3>
            <span class="rm-badge">{{ rule.category || '其他' }}</span>
            <button class="rm-mini" @click="openProposal('revise', rule.id)">发起修订</button>
            <button class="rm-mini danger" @click="openProposal('repeal', rule.id)">申请废止</button>
          </div>
          <p>{{ rule.content }}</p>
          <small>v{{ rule.version || 1 }} · {{ shortDate(rule.effective_at || rule.updated_at) }} 生效</small>
        </article>
      </div>
      <div v-else class="rm-quiet-empty">还没有已生效公约，可以从一个简单约定开始</div>
    </section>

    <details v-if="history.length" class="rm-rule-history">
      <summary>历史版本 <span>查看公约的修改与确认记录</span></summary>
      <div class="rm-card rm-history-list">
        <div v-for="entry in history" :key="entry.id" class="rm-history-row">
          <b>{{ shortDate(entry.updated_at || entry.created_at, true) }}</b>
          <span>{{ entry.title }} · v{{ entry.version || 1 }}</span>
          <span>{{ historyStatus(entry.status) }}</span>
          <span class="rm-badge">{{ entry.category || '其他' }}</span>
        </div>
      </div>
    </details>

    <div v-if="proposalModal.open" class="rm-overlay" @mousedown.self="closeProposal">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header">
          <h3>{{ proposalModalTitle }}</h3>
          <button class="rm-modal-close" aria-label="关闭" @click="closeProposal">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row">
              <label class="rm-field"><span>提案标题</span><input v-model.trim="proposalForm.title" class="rm-input" maxlength="60" placeholder="例如：公共区域安静时间" /></label>
              <label class="rm-field"><span>分类</span><select v-model="proposalForm.category" class="rm-input"><option>作息</option><option>卫生</option><option>访客</option><option>费用</option><option>其他</option></select></label>
            </div>
            <label class="rm-field"><span>具体约定</span><textarea v-model.trim="proposalForm.content" class="rm-textarea" rows="5" maxlength="1200" placeholder="把时间、范围和例外情况写清楚…"></textarea></label>
            <label class="rm-field"><span>确认截止时间</span><input v-model="proposalForm.deadline" class="rm-input" type="date" /></label>
            <p class="rm-help">发送后会为当前所有在住成员生成确认席位。修改提案内容后，本轮确认将重新开始。</p>
          </div>
        </div>
        <div class="rm-modal-footer">
          <button class="rm-btn" @click="closeProposal">取消</button>
          <button class="rm-btn primary" :disabled="saving" @click="saveProposal">{{ saving ? '发送中…' : '发起提案' }}</button>
        </div>
      </div>
    </div>

    <div v-if="feedbackModal.open" class="rm-overlay" @mousedown.self="feedbackModal.open = false">
      <div class="rm-modal">
        <div class="rm-modal-header"><h3>提出修改</h3><button class="rm-modal-close" aria-label="关闭" @click="feedbackModal.open = false">✕</button></div>
        <div class="rm-modal-body">
          <label class="rm-field"><span>修改意见</span><textarea v-model.trim="feedbackForm.comment" class="rm-textarea" rows="5" maxlength="500" placeholder="说明希望调整的内容和原因…"></textarea></label>
          <p class="rm-help">提交后发起人需要更新提案；更新后所有成员重新确认。</p>
        </div>
        <div class="rm-modal-footer"><button class="rm-btn" @click="feedbackModal.open = false">取消</button><button class="rm-btn primary" :disabled="saving" @click="submitFeedback">提交意见</button></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '../../api'
import { addDays, memberInitial as initial, todayStr } from './roomie'

const props = defineProps({
  roommates: { type: Array, default: () => [] },
  currentMemberId: { type: [Number, String], default: null },
})
const emit = defineEmits(['notify', 'alerts-changed'])

const pending = ref([])
const active = ref([])
const history = ref([])
const saving = ref(false)
const busyId = ref(null)
const proposalModal = reactive({ open: false, editing: null, type: 'create', parentId: null })
const proposalForm = reactive({ title: '', category: '作息', content: '', deadline: addDays(todayStr(), 3) })
const feedbackModal = reactive({ open: false, proposal: null })
const feedbackForm = reactive({ comment: '' })

const needsMyVote = computed(() => pending.value.some((proposal) => canVote(proposal)))
const pendingSummary = computed(() => {
  if (!pending.value.length) return '目前没有需要处理的提案'
  const revisionForMe = pending.value.filter(
    (proposal) => proposal.status === 'changes_requested' && Number(proposal.proposer_id) === Number(props.currentMemberId)
  ).length
  if (revisionForMe) return `${revisionForMe} 项提案收到修改意见，等待你更新内容`
  if (pending.value.some((proposal) => proposal.status === 'changes_requested')) {
    return '有提案正在等待发起人根据意见修改'
  }
  const mine = pending.value.filter((proposal) => canVote(proposal)).length
  return mine ? `${mine} 项提案正在等待你的决定` : `${pending.value.length} 项提案正在等待其他成员确认`
})
const proposalModalTitle = computed(() => {
  if (proposalModal.editing) return '编辑公约提案'
  if (proposalModal.type === 'revise') return '发起公约修订'
  if (proposalModal.type === 'repeal') return '申请废止公约'
  return '发起公约提案'
})

function memberName(id) { return props.roommates.find((member) => Number(member.id) === Number(id))?.name || `成员 ${id || ''}` }
function shortDate(value, full = false) {
  if (!value) return ''
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return String(value)
  if (full) return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}
function proposalStatus(proposal) { return proposal.status === 'changes_requested' ? '待修改' : '待确认' }
function proposalTitle(proposal) {
  const prefix = proposal.proposal_type === 'revise' ? '修订' : proposal.proposal_type === 'repeal' ? '废止' : '新增'
  return `${prefix}「${proposal.title}」`
}
function agreeCount(proposal) { return Number(proposal.agree_count ?? (proposal.votes || []).filter((vote) => vote.decision === 'agree').length) }
function voterCount(proposal) { return Number(proposal.voter_count ?? (proposal.votes || []).length) || 1 }
function voteProgress(proposal) { return `${Math.min(100, (agreeCount(proposal) / voterCount(proposal)) * 100)}%` }
function voteLabel(decision) { return decision === 'agree' ? '已确认' : decision === 'revise' ? '提出修改' : '待确认' }
function revisionComments(proposal) { return (proposal.votes || []).filter((vote) => vote.decision === 'revise' && vote.comment) }
function myVote(proposal) { return (proposal.votes || []).find((vote) => Number(vote.roommate_id) === Number(props.currentMemberId)) }
function canVote(proposal) { const vote = myVote(proposal); return proposal.status !== 'changes_requested' && !!props.currentMemberId && !!vote && (!vote.decision || vote.decision === 'pending') }
function canEditProposal(proposal) {
  if (!props.currentMemberId || proposal.status === 'active') return false
  const proposerIsActive = props.roommates.some(
    (member) => Number(member.id) === Number(proposal.proposer_id)
  )
  return Number(proposal.proposer_id) === Number(props.currentMemberId) || !proposerIsActive
}
function isFullyAgreed(proposal) { return agreeCount(proposal) >= voterCount(proposal) }
function myVoteText(proposal) {
  if (proposal.status === 'changes_requested') {
    return Number(proposal.proposer_id) === Number(props.currentMemberId)
      ? '请根据修改意见更新提案'
      : '等待发起人更新提案'
  }
  const decision = myVote(proposal)?.decision
  return decision === 'agree' ? '你已确认，等待其他成员' : decision === 'revise' ? '你已提出修改意见' : '等待其他成员确认'
}
function historyStatus(status) { return ({ superseded: '已被新版本替代', repealed: '已废止', withdrawn: '已撤回', expired: '已到期' })[status] || '历史记录' }

async function load() {
  try {
    const query = props.currentMemberId ? `?actor_id=${props.currentMemberId}` : ''
    const data = await api(`/api/roomie/rules${query}`)
    if (Array.isArray(data)) {
      pending.value = []
      active.value = data
      history.value = []
    } else {
      pending.value = data.pending || []
      active.value = data.active || []
      history.value = data.history || []
    }
  } catch (error) {
    emit('notify', error.message || '公约加载失败', 'error')
  }
}

function openProposal(type = 'create', parentId = null, editing = null) {
  if (!props.currentMemberId) return emit('notify', '你尚未加入房间', 'error')
  const parent = active.value.find((rule) => Number(rule.id) === Number(parentId))
  proposalModal.type = type
  proposalModal.parentId = parentId
  proposalModal.editing = editing
  proposalForm.title = editing?.title || parent?.title || ''
  proposalForm.category = editing?.category || parent?.category || '作息'
  proposalForm.content = editing?.content || parent?.content || ''
  proposalForm.deadline = editing?.deadline?.slice(0, 10) || addDays(todayStr(), 3)
  proposalModal.open = true
}
function closeProposal() { proposalModal.open = false }

async function saveProposal() {
  if (!proposalForm.title) return emit('notify', '请填写提案标题', 'error')
  if (!proposalForm.content && proposalModal.type !== 'repeal') return emit('notify', '请填写具体约定', 'error')
  saving.value = true
  try {
    const body = {
      actor_id: Number(props.currentMemberId),
      proposal_type: proposalModal.type,
      parent_rule_id: proposalModal.parentId,
      title: proposalForm.title,
      category: proposalForm.category,
      content: proposalForm.content,
      deadline: proposalForm.deadline,
    }
    if (proposalModal.editing) await api(`/api/roomie/rules/${proposalModal.editing.id}`, { method: 'PUT', body })
    else await api('/api/roomie/rules/proposals', { method: 'POST', body })
    emit('notify', proposalModal.editing ? '提案已更新，成员需要重新确认' : '公约提案已发起')
    closeProposal()
    await load()
    emit('alerts-changed')
  } catch (error) {
    emit('notify', error.message || '提案保存失败', 'error')
  } finally { saving.value = false }
}

async function agree(proposal) {
  busyId.value = proposal.id
  try {
    await api(`/api/roomie/rules/${proposal.id}/vote`, { method: 'POST', body: { actor_id: Number(props.currentMemberId), decision: 'agree' } })
    emit('notify', '你已确认该提案')
    await load()
    emit('alerts-changed')
  } catch (error) { emit('notify', error.message || '确认失败', 'error') }
  finally { busyId.value = null }
}

function openFeedback(proposal) { feedbackModal.proposal = proposal; feedbackForm.comment = ''; feedbackModal.open = true }
async function submitFeedback() {
  if (!feedbackForm.comment) return emit('notify', '请填写修改意见', 'error')
  saving.value = true
  try {
    await api(`/api/roomie/rules/${feedbackModal.proposal.id}/vote`, { method: 'POST', body: { actor_id: Number(props.currentMemberId), decision: 'revise', comment: feedbackForm.comment } })
    emit('notify', '修改意见已提交')
    feedbackModal.open = false
    await load()
    emit('alerts-changed')
  } catch (error) { emit('notify', error.message || '意见提交失败', 'error') }
  finally { saving.value = false }
}

watch(() => props.currentMemberId, load)
onMounted(load)
</script>
