<template>
  <div class="tk">
    <div class="tk-header">
      <div class="tk-header-top">
        <div class="tk-title">秋招追踪器</div>
        <span class="tk-subtitle">求职投递进度管理</span>
      </div>
      <div class="tk-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="{ active: view === t.key }"
          @click="view = t.key"
        >
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
  { key: 'list', label: '列表' },
  { key: 'kanban', label: '看板' },
  { key: 'dashboard', label: '仪表盘' },
  { key: 'notes', label: '笔记库' },
  { key: 'settings', label: '设置' },
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
