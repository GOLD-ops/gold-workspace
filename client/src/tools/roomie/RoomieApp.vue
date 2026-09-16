<template>
  <div class="rm">
    <nav class="rm-tabs" aria-label="合租生活管家功能导航">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: view === tab.key, 'has-alert': Number(alerts[tab.key]) > 0 }"
          :aria-current="view === tab.key ? 'page' : undefined"
          :aria-label="tabAriaLabel(tab)"
          :title="alertTitle(tab.key)"
          @click="view = tab.key"
        >
          <svg
            class="rm-tab-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <template v-if="tab.key === 'rules'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </template>
            <template v-else-if="tab.key === 'expenses'">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </template>
            <template v-else-if="tab.key === 'chores'">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </template>
            <template v-else-if="tab.key === 'items'">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </template>
            <template v-else>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </template>
          </svg>
          {{ tab.label }}
          <span v-if="Number(alerts[tab.key]) > 0" class="rm-notice-dot" aria-hidden="true"></span>
        </button>
    </nav>

    <!-- 未加入房间：创建 / 加入 -->
    <div v-if="noRoom" class="rm-onboard">
      <div class="rm-onboard-card">
        <div class="rm-onboard-head">
          <h2>加入或创建合租房间</h2>
          <p>每位室友使用自己的账号，通过房间编号加入同一个房间</p>
        </div>

        <div class="rm-segmented rm-onboard-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="boardMode === 'join'"
            :class="{ active: boardMode === 'join' }"
            @click="boardMode = 'join'"
          >
            加入房间
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="boardMode === 'create'"
            :class="{ active: boardMode === 'create' }"
            @click="boardMode = 'create'"
          >
            创建房间
          </button>
        </div>

        <template v-if="boardMode === 'join'">
          <form class="rm-onboard-form" @submit.prevent="joinRoom">
            <input
              v-model="joinCode"
              class="rm-input"
              placeholder="输入 6 位房间编号"
              maxlength="6"
              autocomplete="off"
            />
            <button type="submit" class="rm-btn primary" :disabled="joining">
              {{ joining ? '加入中…' : '加入房间' }}
            </button>
          </form>
          <p class="rm-onboard-hint">房间编号由房主分享给你，共 6 位字母或数字</p>
        </template>

        <template v-else>
          <form class="rm-onboard-form" @submit.prevent="createRoom">
            <input
              v-model="createName"
              class="rm-input"
              placeholder="房间名称，例如：温馨小家"
              maxlength="20"
            />
            <button type="submit" class="rm-btn primary" :disabled="creating">
              {{ creating ? '创建中…' : '创建房间' }}
            </button>
          </form>
          <p class="rm-onboard-hint">创建后会生成房间编号，发给室友即可一起加入</p>
        </template>
      </div>
    </div>

    <div v-else-if="loading" class="rm-loading">正在加载合租数据…</div>

      <template v-else>
        <RulesPanel
          v-if="view === 'rules'"
          :roommates="activeRoommates"
          :current-member-id="currentMemberId"
          :guest="needLogin"
          @notify="notify"
          @alerts-changed="loadAlerts"
        />
        <ExpensesPanel
          v-else-if="view === 'expenses'"
          :roommates="activeRoommates"
          :current-member-id="currentMemberId"
          :split-schemes="splitSchemes"
          :guest="needLogin"
          @notify="notify"
          @alerts-changed="loadAlerts"
        />
        <ChoresPanel
          v-else-if="view === 'chores'"
          :roommates="activeRoommates"
          :current-member-id="currentMemberId"
          :settings="settings"
          :guest="needLogin"
          @notify="notify"
          @alerts-changed="loadAlerts"
          @settings-changed="loadContext"
        />
        <ItemsPanel
          v-else-if="view === 'items'"
          :roommates="activeRoommates"
          :current-member-id="currentMemberId"
          :split-schemes="splitSchemes"
          :guest="needLogin"
          @notify="notify"
          @alerts-changed="loadAlerts"
        />
        <SettingsPanel
          v-else
          :roommates="roommates"
          :current-member-id="currentMemberId"
          :split-schemes="splitSchemes"
          :settings="settings"
          :room="room"
          :guest="needLogin"
          @notify="notify"
          @changed="loadContext"
        />
      </template>

    <div v-if="toast" class="rm-toast" :class="{ error: toastType === 'error' }" role="status">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { api, getToken } from '../../api'
import './roomie.css'
import RulesPanel from './RulesPanel.vue'
import ExpensesPanel from './ExpensesPanel.vue'
import ChoresPanel from './ChoresPanel.vue'
import ItemsPanel from './ItemsPanel.vue'
import SettingsPanel from './SettingsPanel.vue'

const tabs = [
  { key: 'rules', label: '公约' },
  { key: 'expenses', label: '费用' },
  { key: 'chores', label: '值日' },
  { key: 'items', label: '物品' },
  { key: 'settings', label: '设置' },
]

const view = ref('rules')
const me = ref(null)
const needLogin = ref(false)
const noRoom = ref(false)
const roommates = ref([])
const settings = ref({})
const splitSchemes = ref([])
const alerts = ref({ rules: 0, expenses: 0, chores: 0, items: 0 })
const loading = ref(true)
const toast = ref('')
const toastType = ref('ok')
const createName = ref('')
const joinCode = ref('')
const boardMode = ref('join')
const creating = ref(false)
const joining = ref(false)
let toastTimer = null

const room = computed(() => me.value?.room || null)

const activeRoommates = computed(() =>
  roommates.value.filter((member) => member.status !== 'moved_out' && !member.moved_out_at)
)

const currentMemberId = computed(() => {
  const uid = Number(me.value?.user?.id)
  if (uid) {
    const self = activeRoommates.value.find((member) => Number(member.user_id) === uid)
    if (self) return Number(self.id)
  }
  return null
})

function notify(message, type = 'ok') {
  toast.value = message
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2600)
}

function alertTitle(key) {
  if (!Number(alerts.value[key])) return ''
  const labels = {
    rules: '有公约提案待你确认',
    expenses: '有费用结算待你处理',
    chores: '有值日任务待你处理',
    items: '有公共物品待你补货',
  }
  return labels[key] || ''
}

function tabAriaLabel(tab) {
  const suffix = alertTitle(tab.key)
  return suffix ? `${tab.label}，${suffix}` : tab.label
}

async function loadAlerts() {
  if (!currentMemberId.value) {
    alerts.value = { rules: 0, expenses: 0, chores: 0, items: 0 }
    return
  }
  try {
    const data = await api(`/api/roomie/alerts?actor_id=${currentMemberId.value}`)
    alerts.value = data?.badges || data || { rules: 0, expenses: 0, chores: 0, items: 0 }
  } catch {
    alerts.value = { rules: 0, expenses: 0, chores: 0, items: 0 }
  }
}

async function loadContext() {
  loading.value = true
  try {
    const meData = await api('/api/roomie/me')
    me.value = meData
    if (!meData.room) {
      noRoom.value = true
      return
    }
    noRoom.value = false
    const [membersData, settingsData, schemesData] = await Promise.all([
      api('/api/roomie/roommates?include_inactive=1'),
      api('/api/roomie/settings'),
      api('/api/roomie/split-schemes'),
    ])
    roommates.value = Array.isArray(membersData) ? membersData : []
    settings.value = settingsData || {}
    splitSchemes.value = Array.isArray(schemesData)
      ? schemesData
      : Array.isArray(schemesData?.schemes)
        ? schemesData.schemes
        : []
    await loadAlerts()
  } catch (error) {
    notify(error.message || '合租数据加载失败', 'error')
  } finally {
    loading.value = false
  }
}

async function createRoom() {
  const name = createName.value.trim()
  if (!name) return notify('请填写房间名称', 'error')
  creating.value = true
  try {
    await api('/api/roomie/rooms', { method: 'POST', body: { name } })
    notify('房间已创建')
    createName.value = ''
    await loadContext()
  } catch (error) {
    notify(error.message || '创建失败', 'error')
  } finally {
    creating.value = false
  }
}

async function joinRoom() {
  const code = joinCode.value.trim().toUpperCase()
  if (!code) return notify('请输入房间编号', 'error')
  joining.value = true
  try {
    await api('/api/roomie/rooms/join', { method: 'POST', body: { invite_code: code } })
    notify('已加入房间')
    joinCode.value = ''
    await loadContext()
  } catch (error) {
    notify(error.message || '加入失败', 'error')
  } finally {
    joining.value = false
  }
}

onMounted(() => {
  if (!getToken()) {
    needLogin.value = true
    loading.value = false
    return
  }
  loadContext()
})
</script>
