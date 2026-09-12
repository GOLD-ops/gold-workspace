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
          <span class="rm-tab-icon">{{ t.icon }}</span>
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
  { key: 'roommates', label: '室友', icon: '👥' },
  { key: 'expenses', label: '费用 AA', icon: '💰' },
  { key: 'chores', label: '值日排班', icon: '🧹' },
  { key: 'items', label: '公共物品', icon: '🧻' },
  { key: 'rules', label: '室友公约', icon: '📜' },
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
  }, 2200)
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
