<template>
  <div class="rm">
    <div class="rm-header">
      <div class="rm-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="{ active: view === t.key }"
          @click="view = t.key"
        >
          <svg
            class="rm-tab-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <template v-if="t.key === 'roommates'">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </template>
            <template v-else-if="t.key === 'expenses'">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </template>
            <template v-else-if="t.key === 'chores'">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </template>
            <template v-else-if="t.key === 'items'">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </template>
            <template v-else>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </template>
          </svg>
          {{ t.label }}
        </button>
      </div>
    </div>

    <RoommatesPanel
      v-if="view === 'roommates'"
      :roommates="roommates"
      @changed="loadRoommates"
      @notify="notify"
    />
    <ExpensesPanel
      v-else-if="view === 'expenses'"
      :roommates="roommates"
      @notify="notify"
    />
    <ChoresPanel
      v-else-if="view === 'chores'"
      :roommates="roommates"
      @notify="notify"
    />
    <ItemsPanel v-else-if="view === 'items'" @notify="notify" />
    <RulesPanel v-else-if="view === 'rules'" @notify="notify" />

    <div v-if="toast" class="rm-toast" :class="{ error: toastType === 'error' }">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api'
import './roomie.css'
import RoommatesPanel from './RoommatesPanel.vue'
import ExpensesPanel from './ExpensesPanel.vue'
import ChoresPanel from './ChoresPanel.vue'
import ItemsPanel from './ItemsPanel.vue'
import RulesPanel from './RulesPanel.vue'

const tabs = [
  { key: 'roommates', label: '室友' },
  { key: 'expenses', label: '费用 AA' },
  { key: 'chores', label: '值日排班' },
  { key: 'items', label: '公共物品' },
  { key: 'rules', label: '室友公约' },
]

const view = ref('roommates')
const roommates = ref([])
const toast = ref('')
const toastType = ref('ok')
let toastTimer = null

function notify(message, type = 'ok') {
  toast.value = message
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2600)
}

async function loadRoommates() {
  try {
    roommates.value = await api('/api/roomie/roommates')
  } catch (e) {
    notify(e.message || '室友加载失败', 'error')
  }
}

onMounted(loadRoommates)
</script>
