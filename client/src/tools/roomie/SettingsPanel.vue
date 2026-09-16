<template>
  <div class="rm-panel rm-settings">
    <section class="rm-settings-section">
      <div class="rm-block-head">
        <div>
          <h2>默认分摊方案</h2>
          <p>记账时可直接选用，也可以在单笔费用中临时调整</p>
        </div>
        <button class="rm-btn" @click="openScheme()">+ 新建方案</button>
      </div>

      <div v-if="splitSchemes.length" class="rm-card rm-setting-list">
        <div v-for="scheme in splitSchemes" :key="scheme.id" class="rm-setting-row">
          <div class="rm-setting-copy">
            <strong>{{ scheme.name }}</strong>
            <small>{{ schemeDescription(scheme) }}</small>
          </div>
          <div class="rm-setting-value">{{ schemeRatio(scheme) }}</div>
          <button class="rm-mini" @click="openScheme(scheme)">编辑</button>
          <button class="rm-mini danger" @click="removeScheme(scheme)">停用</button>
        </div>
      </div>
      <button v-else class="rm-empty-card" type="button" @click="openScheme()">
        还没有分摊方案，创建一个常用比例
      </button>
    </section>

    <section class="rm-settings-section">
      <div class="rm-block-head">
        <div>
          <h2>值日排班</h2>
          <p>设置新任务默认采用的分配方式，创建单个任务时仍可调整</p>
        </div>
      </div>
      <div class="rm-card-aside">
        <div class="rm-card rm-setting-list">
          <div class="rm-setting-row">
            <span class="rm-setting-copy">
              <strong>默认分配方式</strong>
              <small>{{ assignmentDescription }}</small>
            </span>
            <select v-model="reminderForm.default_assignment_mode" class="rm-input rm-setting-select">
              <option value="fair">公平轮换</option>
              <option value="manual">手动指定</option>
              <option value="claim">自由认领</option>
            </select>
          </div>
        </div>
        <button class="rm-btn primary" :disabled="savingSettings" @click="saveSettings">
          {{ savingSettings ? '保存中…' : '保存排班设置' }}
        </button>
      </div>
    </section>

    <section class="rm-settings-section">
      <div class="rm-block-head">
        <div>
          <h2>房间</h2>
          <p>每位室友使用自己的账号，通过房间编号加入</p>
        </div>
      </div>

      <div v-if="room" class="rm-card rm-room-info">
        <div class="rm-room-info-head">
          <strong>{{ room.name }}</strong>
          <span class="rm-badge blue">{{ isOwner ? '房主' : '成员' }}</span>
        </div>
        <div class="rm-room-code">
          <span>房间编号</span>
          <code>{{ room.invite_code }}</code>
          <button class="rm-mini" @click="copyInviteCode">复制</button>
        </div>
        <div class="rm-room-actions">
          <button v-if="isOwner" class="rm-mini danger" @click="dissolveRoom">解散房间</button>
          <button v-else class="rm-mini danger" @click="leaveRoom">退出房间</button>
        </div>
      </div>

      <div v-if="roommates.length" class="rm-member-grid">
        <article
          v-for="member in roommates"
          :key="member.id"
          class="rm-member-card"
          :class="{ inactive: isMovedOut(member) }"
        >
          <span class="rm-avatar">{{ initial(member.name) }}</span>
          <div class="rm-member-info">
            <div class="rm-member-name">
              {{ member.name }}
              <span v-if="Number(member.user_id) === Number(room?.owner_user_id)" class="rm-badge blue">房主</span>
              <span v-if="Number(member.id) === Number(currentMemberId)" class="rm-badge">我</span>
              <span v-if="isMovedOut(member)" class="rm-badge">已搬走</span>
            </div>
            <small v-if="isMovedOut(member)">
              {{ member.moved_out_at ? `${member.moved_out_at.slice(0, 10)} 搬走` : '不再参与新任务' }}
            </small>
            <small v-else>在住 · 可参与分摊与排班</small>
          </div>
          <div class="rm-member-actions">
            <button
              v-if="Number(member.id) === Number(currentMemberId) && !isMovedOut(member)"
              class="rm-mini"
              @click="openMember(member)"
            >
              改昵称
            </button>
            <button
              v-if="isOwner && !isMovedOut(member) && Number(member.id) !== Number(currentMemberId)"
              class="rm-mini danger"
              @click="moveOut(member)"
            >
              移除
            </button>
          </div>
        </article>
      </div>
      <div v-else class="rm-empty">还没有成员，请把房间编号分享给室友</div>
    </section>

    <section class="rm-settings-section">
      <div class="rm-block-head">
        <div>
          <h2>提醒设置</h2>
          <p>选择需要在顶部导航显示红点的生活协作待办</p>
        </div>
      </div>

      <div class="rm-card-aside">
        <div class="rm-card rm-setting-list">
          <label class="rm-setting-row clickable">
            <span class="rm-setting-copy"><strong>公约待确认</strong><small>有新提案或提案重新发起时提醒</small></span>
            <input v-model="reminderForm.rule_reminder" class="rm-native-check" type="checkbox" />
            <span class="rm-switch" aria-hidden="true"></span>
          </label>
          <label class="rm-setting-row clickable">
            <span class="rm-setting-copy"><strong>值日到期</strong><small>任务到期前一天及逾期后提醒</small></span>
            <input v-model="reminderForm.chore_reminder" class="rm-native-check" type="checkbox" />
            <span class="rm-switch" aria-hidden="true"></span>
          </label>
          <label class="rm-setting-row clickable">
            <span class="rm-setting-copy"><strong>低库存采购</strong><small>物品触及提醒阈值且分配给我时提醒</small></span>
            <input v-model="reminderForm.item_reminder" class="rm-native-check" type="checkbox" />
            <span class="rm-switch" aria-hidden="true"></span>
          </label>
          <label class="rm-setting-row clickable">
            <span class="rm-setting-copy"><strong>费用结算</strong><small>需要登记转账或确认收款时提醒</small></span>
            <input v-model="reminderForm.settlement_reminder" class="rm-native-check" type="checkbox" />
            <span class="rm-switch" aria-hidden="true"></span>
          </label>
        </div>
        <button class="rm-btn primary" :disabled="savingSettings" @click="saveSettings">
          {{ savingSettings ? '保存中…' : '保存提醒设置' }}
        </button>
      </div>
    </section>

    <div v-if="memberModal.open" class="rm-overlay" @mousedown.self="memberModal.open = false">
      <div class="rm-modal">
        <div class="rm-modal-header">
          <h3>修改我的昵称</h3>
          <button class="rm-modal-close" aria-label="关闭" @click="memberModal.open = false">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-field">
            <span>成员昵称</span>
            <input v-model.trim="memberForm.name" class="rm-input" maxlength="20" placeholder="例如：小明" />
          </div>
        </div>
        <div class="rm-modal-footer">
          <button class="rm-btn" @click="memberModal.open = false">取消</button>
          <button class="rm-btn primary" :disabled="savingMember" @click="saveMember">
            {{ savingMember ? '保存中…' : '保存成员' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="schemeModal.open" class="rm-overlay" @mousedown.self="schemeModal.open = false">
      <div class="rm-modal rm-modal-wide">
        <div class="rm-modal-header">
          <h3>{{ schemeModal.editing ? '编辑分摊方案' : '新建分摊方案' }}</h3>
          <button class="rm-modal-close" aria-label="关闭" @click="schemeModal.open = false">✕</button>
        </div>
        <div class="rm-modal-body">
          <div class="rm-form">
            <div class="rm-field-row">
              <label class="rm-field"><span>方案名称</span><input v-model.trim="schemeForm.name" class="rm-input" placeholder="例如：房租方案" /></label>
              <label class="rm-field"><span>分摊方式</span><select v-model="schemeForm.split_method" class="rm-input"><option value="equal">平均分摊</option><option value="ratio">按比例</option></select></label>
            </div>
            <div class="rm-field">
              <span>成员比例</span>
              <div class="rm-ratio-editor">
                <label v-for="member in activeRoommates" :key="member.id" class="rm-ratio-row">
                  <span>{{ member.name }}</span>
                  <input
                    v-model.number="schemeForm.weights[member.id]"
                    class="rm-input"
                    type="number"
                    min="0"
                    step="0.1"
                    :disabled="schemeForm.split_method === 'equal'"
                  />
                </label>
              </div>
              <small class="rm-help">平均分摊会忽略输入值；按比例时至少一人的比例需大于 0。</small>
            </div>
          </div>
        </div>
        <div class="rm-modal-footer">
          <button class="rm-btn" @click="schemeModal.open = false">取消</button>
          <button class="rm-btn primary" :disabled="savingScheme" @click="saveScheme">
            {{ savingScheme ? '保存中…' : '保存方案' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { api, copyText } from '../../api'
import { confirmDialog } from '../../ui/confirm'

const props = defineProps({
  roommates: { type: Array, default: () => [] },
  currentMemberId: { type: [Number, String], default: null },
  splitSchemes: { type: Array, default: () => [] },
  settings: { type: Object, default: () => ({}) },
  room: { type: Object, default: null },
})
const emit = defineEmits(['notify', 'changed'])

const activeRoommates = computed(() => props.roommates.filter((member) => !isMovedOut(member)))
const selfMember = computed(() =>
  props.roommates.find((member) => Number(member.id) === Number(props.currentMemberId))
)
const isOwner = computed(
  () => selfMember.value && Number(selfMember.value.user_id) === Number(props.room?.owner_user_id)
)
const memberModal = reactive({ open: false, editing: null })
const memberForm = reactive({ name: '' })
const schemeModal = reactive({ open: false, editing: null })
const schemeForm = reactive({ name: '', split_method: 'ratio', weights: {} })
const reminderForm = reactive({
  rule_reminder: true,
  chore_reminder: true,
  item_reminder: true,
  settlement_reminder: true,
  notification_email: '',
  default_assignment_mode: 'fair',
})
const savingMember = ref(false)
const savingScheme = ref(false)
const savingSettings = ref(false)

watch(
  () => props.settings,
  (value) => {
    const reminders = value.reminders || {}
    reminderForm.rule_reminder = (value.rule_reminder ?? value.reminder_rule ?? reminders.rule_pending) !== false && (value.rule_reminder ?? value.reminder_rule ?? reminders.rule_pending) !== 0
    reminderForm.chore_reminder = (value.chore_reminder ?? value.reminder_chore ?? reminders.chore_due) !== false && (value.chore_reminder ?? value.reminder_chore ?? reminders.chore_due) !== 0
    reminderForm.item_reminder = (value.item_reminder ?? value.reminder_item ?? reminders.item_low) !== false && (value.item_reminder ?? value.reminder_item ?? reminders.item_low) !== 0
    reminderForm.settlement_reminder = (value.settlement_reminder ?? value.reminder_settlement ?? reminders.settlement) !== false && (value.settlement_reminder ?? value.reminder_settlement ?? reminders.settlement) !== 0
    reminderForm.notification_email = value.notification_email || value.reminder_email || reminders.email || ''
    reminderForm.default_assignment_mode = ['fair', 'manual', 'claim'].includes(value.default_assignment_mode)
      ? value.default_assignment_mode
      : 'fair'
  },
  { immediate: true, deep: true }
)

const assignmentDescription = computed(() => ({
  fair: '优先安排本月累计工作量较少的成员',
  manual: '每次创建任务时由发起人选择负责人',
  claim: '先不指定负责人，由任一在住成员主动认领',
})[reminderForm.default_assignment_mode])

function initial(name) {
  return String(name || '?').slice(0, 1)
}

function isMovedOut(member) {
  return member?.status === 'moved_out' || Boolean(member?.moved_out_at)
}

function schemeWeights(scheme) {
  if (scheme && typeof scheme.weights === 'object' && scheme.weights) return scheme.weights
  if (Array.isArray(scheme?.members)) {
    return Object.fromEntries(
      scheme.members.map((entry) => [
        Number(entry.member_id ?? entry.roommate_id ?? entry.id),
        Number(entry.value ?? entry.weight ?? 0),
      ])
    )
  }
  try {
    return JSON.parse(scheme?.weights || '{}')
  } catch {
    return {}
  }
}

function schemeRatio(scheme) {
  if (scheme.split_method === 'equal') return '平均分摊'
  const weights = schemeWeights(scheme)
  return activeRoommates.value.map((member) => Number(weights[member.id]) || 0).join(' : ')
}

function schemeDescription(scheme) {
  return scheme.split_method === 'equal' ? '由参与成员平均承担' : '按成员权重自动计算金额'
}

function openMember(member = null) {
  memberModal.editing = member
  memberForm.name = member?.name || ''
  memberModal.open = true
}

async function saveMember() {
  if (!memberForm.name) return emit('notify', '请填写成员昵称', 'error')
  savingMember.value = true
  try {
    await api(`/api/roomie/roommates/${memberModal.editing.id}`, {
      method: 'PUT',
      body: { ...memberModal.editing, name: memberForm.name },
    })
    emit('notify', '昵称已更新')
    memberModal.open = false
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '成员保存失败', 'error')
  } finally {
    savingMember.value = false
  }
}

async function moveOut(member) {
  const ok = await confirmDialog({
    title: '移除成员',
    message: `确定移除「${member.name}」吗？其历史记录会保留，但不再参与新的分摊、排班、采购和公约投票。`,
    confirmText: '确认移除',
  })
  if (!ok) return
  try {
    await api(`/api/roomie/roommates/${member.id}`, { method: 'DELETE' })
    emit('notify', '成员已移除')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '状态更新失败', 'error')
  }
}

async function copyInviteCode() {
  if (!props.room?.invite_code) return
  try {
    await copyText(props.room.invite_code)
    emit('notify', '房间编号已复制')
  } catch {
    emit('notify', '复制失败，请手动复制', 'error')
  }
}

async function leaveRoom() {
  if (isOwner.value) {
    emit('notify', '房主不能直接退出房间', 'error')
    return
  }
  const ok = await confirmDialog({
    title: '退出房间',
    message: '退出后你将无法查看该房间的费用、值日、物品与公约，确定退出吗？',
    confirmText: '确认退出',
  })
  if (!ok) return
  try {
    await api('/api/roomie/rooms/leave', { method: 'POST' })
    emit('notify', '已退出房间')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '退出失败', 'error')
  }
}

async function dissolveRoom() {
  const ok = await confirmDialog({
    title: '解散房间',
    message: '解散后房间内的费用、值日、公共物品与公约记录将全部删除，且无法恢复，所有成员都会被移出。确定解散吗？',
    confirmText: '确认解散',
  })
  if (!ok) return
  try {
    await api('/api/roomie/rooms/dissolve', { method: 'POST' })
    emit('notify', '房间已解散')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '解散失败', 'error')
  }
}

function openScheme(scheme = null) {
  schemeModal.editing = scheme
  schemeForm.name = scheme?.name || ''
  schemeForm.split_method = scheme?.split_method || 'ratio'
  const source = schemeWeights(scheme)
  schemeForm.weights = Object.fromEntries(
    activeRoommates.value.map((member) => [
      member.id,
      source[member.id] === undefined ? 1 : Number(source[member.id]),
    ])
  )
  schemeModal.open = true
}

async function saveScheme() {
  if (!schemeForm.name) return emit('notify', '请填写方案名称', 'error')
  if (schemeForm.split_method === 'ratio' && !Object.values(schemeForm.weights).some((value) => Number(value) > 0)) {
    return emit('notify', '至少设置一个大于 0 的比例', 'error')
  }
  savingScheme.value = true
  try {
    const body = {
      name: schemeForm.name,
      split_method: schemeForm.split_method,
      weights: schemeForm.weights,
      members: activeRoommates.value.map((member) => ({
        member_id: Number(member.id),
        value: schemeForm.split_method === 'equal' ? 1 : Number(schemeForm.weights[member.id]) || 0,
      })),
    }
    if (schemeModal.editing) {
      await api(`/api/roomie/split-schemes/${schemeModal.editing.id}`, { method: 'PUT', body })
      emit('notify', '分摊方案已更新')
    } else {
      await api('/api/roomie/split-schemes', { method: 'POST', body })
      emit('notify', '分摊方案已创建')
    }
    schemeModal.open = false
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '方案保存失败', 'error')
  } finally {
    savingScheme.value = false
  }
}

async function removeScheme(scheme) {
  const ok = await confirmDialog({
    title: '停用分摊方案',
    message: `停用「${scheme.name}」后不能再用于新费用，历史账单不会改变。`,
    confirmText: '停用',
  })
  if (!ok) return
  try {
    await api(`/api/roomie/split-schemes/${scheme.id}`, { method: 'DELETE' })
    emit('notify', '分摊方案已停用')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '方案停用失败', 'error')
  }
}

async function saveSettings() {
  savingSettings.value = true
  try {
    await api('/api/roomie/settings', { method: 'PUT', body: { ...reminderForm } })
    emit('notify', '提醒设置已保存')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '提醒设置保存失败', 'error')
  } finally {
    savingSettings.value = false
  }
}
</script>
