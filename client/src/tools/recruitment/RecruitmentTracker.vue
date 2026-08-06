<template>
  <div class="tk">
<div class="tk-header">
      <div class="tk-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="{ active: view === t.key }"
          @click="view = t.key"
        >
          <svg
            class="tk-tab-icon"
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

    <TrackerList
      v-if="view === 'list'"
      :companies="companies"
      @open="openCompany"
      @reload="reload"
      @notify="notify"
    />
    <TrackerKanban
      v-else-if="view === 'kanban'"
      :companies="companies"
      @open="openCompany"
      @move="moveStatus"
      @notify="notify"
    />
    <TrackerDashboard v-else-if="view === 'dashboard'" />
    <TrackerNotes v-else-if="view === 'notes'" @notify="notify" />
    <TrackerSettings v-else @reload="reload" @notify="notify" />

    <CompanyModal
      v-if="modal.open"
      :company="modal.company"
      :initial="modal.initial"
      @close="modal.open = false"
      @saved="onSaved"
    />

    <div v-if="toast" class="tk-toast" :class="{ error: toastType === 'error' }">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api'
import './tracker.css'
import TrackerList from './TrackerList.vue'
import TrackerKanban from './TrackerKanban.vue'
import TrackerDashboard from './TrackerDashboard.vue'
import TrackerNotes from './TrackerNotes.vue'
import TrackerSettings from './TrackerSettings.vue'
import CompanyModal from './CompanyModal.vue'

const tabs = [
  { key: 'list', label: '列表', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { key: 'kanban', label: '看板', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { key: 'dashboard', label: '仪表盘', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { key: 'notes', label: '笔记库', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { key: 'settings', label: '设置', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
]

const view = ref('list')
const companies = ref([])
const modal = ref({ open: false, company: null, initial: null })
const toast = ref('')
const toastType = ref('')
let toastTimer = null

onMounted(reload)

async function reload() {
  companies.value = await api('/api/recruitment/companies')
}

function openCompany(company, initial = null) {
  modal.value = { open: true, company: company || null, initial: initial || null }
}

async function onSaved() {
  modal.value.open = false
  notify('已保存')
  await reload()
}

async function moveStatus({ id, status }) {
  try {
    await api(`/api/recruitment/companies/${id}/status`, { method: 'PATCH', body: { status } })
    notify(`已移动到「${status}」`)
    await reload()
  } catch (e) {
    notify(e.message, 'error')
  }
}

function notify(msg, type = '') {
  toast.value = msg
  toastType.value = type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 2600)
}

</script>
