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
            <path :d="t.icon" />
          </svg>
          {{ t.label }}
        </button>
      </div>
    </div>

    <RoomieOverview
      v-if="view === 'overview'"
      :roommates="roommates"
      @navigate="view = $event"
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
    <RoommatesPanel
      v-else
      :roommates="roommates"
      @changed="loadRoommates"
      @notify="notify"
    />

    <div v-if="toast" class="rm-toast" :class="{ error: toastType === 'error' }">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api'
import './roomie.css'
import RoomieOverview from './RoomieOverview.vue'
import RoommatesPanel from './RoommatesPanel.vue'
import ExpensesPanel from './ExpensesPanel.vue'
import ChoresPanel from './ChoresPanel.vue'
import ItemsPanel from './ItemsPanel.vue'
import RulesPanel from './RulesPanel.vue'

const tabs = [
  { key: 'overview', label: '生活总览', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { key: 'expenses', label: '费用账本', icon: 'M2 5h20v14H2zM2 10h20' },
  { key: 'chores', label: '清洁排班', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { key: 'items', label: '公共物品', icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12' },
  { key: 'rules', label: '室友公约', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8' },
  { key: 'roommates', label: '成员设置', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87' },
]

const view = ref('overview')
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
