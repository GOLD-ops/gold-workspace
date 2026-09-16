<template>
  <div class="rm-panel rm-settings">
    <div class="rm-card rm-settings-block">
      <div v-if="room" class="rm-room-bar">
        <input
          v-if="roomNameEditing"
          ref="roomNameInput"
          v-model.trim="roomNameDraft"
          class="rm-input rm-room-name-input"
          maxlength="20"
          @keyup.enter="saveRoomName"
          @keyup.esc="cancelRoomName"
          @blur="saveRoomName"
        />
        <strong
          v-else
          class="rm-room-name"
          :class="{ editable: isOwner }"
          :title="isOwner ? '点击修改房间名称' : ''"
          @click="openRoomName"
        >
          {{ room.name }}
        </strong>
        <span class="rm-room-label">房间编号</span>
        <button
          type="button"
          class="rm-room-code"
          title="点击复制房间编号"
          @click="copyInviteCode"
        >
          {{ room.invite_code }}
        </button>
        <div class="rm-room-actions">
          <button v-if="isOwner" class="rm-mini danger" @click="dissolveRoom">解散房间</button>
          <button v-else class="rm-mini danger" @click="leaveRoom">退出房间</button>
        </div>
      </div>

      <div v-if="activeRoommates.length" class="rm-member-grid">
        <div v-for="member in activeRoommates" :key="member.id" class="rm-member-card">
          <span class="rm-avatar sm" :style="{ background: roommateColor(member) }">
            {{ initial(member.name) }}
          </span>
          <div class="rm-member-name">
            {{ member.name }}
            <span v-if="Number(member.user_id) === Number(room?.owner_user_id)" class="rm-badge blue">房主</span>
            <span v-if="Number(member.id) === Number(currentMemberId)" class="rm-badge">我</span>
          </div>
          <div class="rm-member-actions">
            <button
              v-if="Number(member.id) === Number(currentMemberId)"
              class="rm-mini"
              @click="openMember(member)"
            >
              改昵称
            </button>
            <button
              v-if="isOwner && Number(member.id) !== Number(currentMemberId)"
              class="rm-mini"
              @click="transferOwner(member)"
            >
              设为房主
            </button>
            <button
              v-if="isOwner && Number(member.id) !== Number(currentMemberId)"
              class="rm-mini danger"
              @click="moveOut(member)"
            >
              移除
            </button>
          </div>
        </div>
      </div>
      <div v-else class="rm-empty">
        {{ guest ? '登录后可查看房间与成员信息' : '还没有成员，请把房间编号分享给室友' }}
      </div>
    </div>

    <div class="rm-card rm-settings-block">
      <h4>邮件提醒</h4>
      <p class="rm-email-target">
        <template v-if="emailPrefs.email">提醒邮件发送至：{{ emailPrefs.email }}</template>
        <template v-else>当前账号未绑定邮箱，无法接收提醒邮件</template>
      </p>

      <div class="rm-setting-list" :class="{ 'is-locked': guest || !emailPrefs.email }">
        <label class="rm-setting-row clickable">
          <span class="rm-setting-copy"><strong>公约待确认</strong><small>有公约提案等你确认时发邮件</small></span>
          <input v-model="emailPrefs.rules" class="rm-native-check" type="checkbox" @change="saveEmailPrefs" />
          <span class="rm-switch" aria-hidden="true"></span>
        </label>
        <label class="rm-setting-row clickable">
          <span class="rm-setting-copy"><strong>值日到期</strong><small>值日任务到期前一天或已逾期时发邮件</small></span>
          <input v-model="emailPrefs.chores" class="rm-native-check" type="checkbox" @change="saveEmailPrefs" />
          <span class="rm-switch" aria-hidden="true"></span>
        </label>
        <label class="rm-setting-row clickable">
          <span class="rm-setting-copy"><strong>低库存采购</strong><small>公共物品低于阈值、且轮到你采购时发邮件</small></span>
          <input v-model="emailPrefs.items" class="rm-native-check" type="checkbox" @change="saveEmailPrefs" />
          <span class="rm-switch" aria-hidden="true"></span>
        </label>
        <label class="rm-setting-row clickable">
          <span class="rm-setting-copy"><strong>费用结算</strong><small>有转账待登记或待确认收款时发邮件</small></span>
          <input v-model="emailPrefs.settlement" class="rm-native-check" type="checkbox" @change="saveEmailPrefs" />
          <span class="rm-switch" aria-hidden="true"></span>
        </label>
      </div>
    </div>

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

  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { api, copyText } from '../../api'
import { confirmDialog } from '../../ui/confirm'
import { memberInitial as initial, roommateColor } from './roomie'

const props = defineProps({
  roommates: { type: Array, default: () => [] },
  currentMemberId: { type: [Number, String], default: null },
  settings: { type: Object, default: () => ({}) },
  room: { type: Object, default: null },
  guest: { type: Boolean, default: false },
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
const roomNameEditing = ref(false)
const roomNameDraft = ref('')
const roomNameInput = ref(null)
const emailPrefs = reactive({
  email: '',
  rules: false,
  chores: false,
  items: false,
  settlement: false,
})
const savingMember = ref(false)
const savingRoomName = ref(false)

async function loadEmailPrefs() {
  if (props.guest) return
  try {
    const data = await api('/api/roomie/email-preferences')
    emailPrefs.email = data.email || ''
    emailPrefs.rules = !!data.rules
    emailPrefs.chores = !!data.chores
    emailPrefs.items = !!data.items
    emailPrefs.settlement = !!data.settlement
  } catch {
    // 未加入房间或接口不可用时忽略
  }
}

async function saveEmailPrefs() {
  if (props.guest) {
    emit('notify', '请先登录后再修改邮件提醒', 'error')
    return
  }
  try {
    await api('/api/roomie/email-preferences', {
      method: 'PUT',
      body: {
        rules: emailPrefs.rules,
        chores: emailPrefs.chores,
        items: emailPrefs.items,
        settlement: emailPrefs.settlement,
      },
    })
    emit('notify', '邮件提醒设置已更新')
  } catch (error) {
    emit('notify', error.message || '保存失败', 'error')
    loadEmailPrefs()
  }
}

function isMovedOut(member) {
  return member?.status === 'moved_out' || Boolean(member?.moved_out_at)
}

function openRoomName() {
  if (!isOwner.value || props.guest) return
  roomNameDraft.value = props.room?.name || ''
  roomNameEditing.value = true
  nextTick(() => roomNameInput.value?.focus())
}

function cancelRoomName() {
  roomNameEditing.value = false
  roomNameDraft.value = ''
}

async function saveRoomName() {
  if (!roomNameEditing.value || savingRoomName.value) return
  const name = roomNameDraft.value.trim()
  if (!name || name === String(props.room?.name || '')) {
    cancelRoomName()
    return
  }
  savingRoomName.value = true
  try {
    await api('/api/roomie/rooms', { method: 'PUT', body: { name } })
    roomNameEditing.value = false
    emit('notify', '房间名称已更新')
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '修改失败', 'error')
  } finally {
    savingRoomName.value = false
  }
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
    emit('notify', '复制成功')
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

async function transferOwner(member) {
  const ok = await confirmDialog({
    title: '转移房主',
    message: `确定将房主转让给「${member.name}」吗？转让后你将变为普通成员，可以退出房间。`,
    confirmText: '确认转让',
    danger: false,
  })
  if (!ok) return
  try {
    await api('/api/roomie/rooms/transfer', { method: 'POST', body: { member_id: member.id } })
    emit('notify', `已将房主转让给 ${member.name}`)
    emit('changed')
  } catch (error) {
    emit('notify', error.message || '转让失败', 'error')
  }
}

onMounted(loadEmailPrefs)
</script>
