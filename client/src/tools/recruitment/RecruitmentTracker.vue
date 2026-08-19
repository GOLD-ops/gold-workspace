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
      @open-company="openCompany"
      @open-application="openApplication"
      @add-application="addApplication"
      @remove-company="removeCompany"
      @remove-application="removeApplication"
      @reload="reload"
      @notify="notify"
    />
    <TrackerKanban
      v-else-if="view === 'kanban'"
      :companies="companies"
      @open-application="openApplication"
      @move="moveStatus"
      @notify="notify"
    />
    <TrackerDashboard v-else-if="view === 'dashboard'" />
    <TrackerNotes v-else-if="view === 'notes'" @notify="notify" />
    <TrackerSettings v-else @reload="reload" @notify="notify" />

    <CompanyModal
      v-if="companyModal.open"
      :company="companyModal.company"
      @open-application="openApplication"
      @add-application="addApplication"
      @reload="reload"
      @close="companyModal.open = false"
      @saved="onSaved"
      @notify="notify"
    />
    <ApplicationModal
      v-if="appModal.open"
      :application="appModal.application"
      :company-id="appModal.companyId"
      @close="appModal.open = false"
      @saved="onSaved"
      @notify="notify"
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
import ApplicationModal from './ApplicationModal.vue'

const tabs = [
  { key: 'list', label: '列表', icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { key: 'kanban', label: '看板', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
  { key: 'dashboard', label: '仪表盘', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { key: 'notes', label: '笔记库', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { key: 'settings', label: '设置', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
]

const view = ref('list')
const companies = ref([])
const companyModal = ref({ open: false, company: null })
const appModal = ref({ open: false, application: null, companyId: null })
const toast = ref('')
const toastType = ref('')
let toastTimer = null

onMounted(reload)

async function reload() {
  companies.value = await api('/api/recruitment/companies')
}

function openCompany(company = null) {
  companyModal.value = { open: true, company }
}

async function openApplication(application, companyId = null) {
  let app = application || null
  if (app && app.id) {
    try {
      // 列表接口不含节点笔记，打开时拉取完整详情（含笔记）
      app = await api(`/api/recruitment/applications/${app.id}`)
    } catch {
      // 拉取失败时退回列表数据
    }
  }
  appModal.value = {
    open: true,
    application: app,
    companyId:
      companyId || (app && app.company_id) || null,
  }
}

function addApplication(companyId) {
  appModal.value = { open: true, application: null, companyId }
}

async function onSaved() {
  companyModal.value.open = false
  appModal.value.open = false
  notify('已保存')
  await reload()
}

async function moveStatus({ id, status }) {
  try {
    if (typeof id === 'string' && id.startsWith('virtual-')) {
      const companyId = Number(id.slice(8))
      const created = await api('/api/recruitment/applications', {
        method: 'POST',
        body: { company_id: companyId, status },
      })
      await reload()
      notify(`已创建「${status}」投递记录，请补充岗位信息`)
      openApplication(created)
      return
    }
    await api(`/api/recruitment/applications/${id}/status`, {
      method: 'PATCH',
      body: { status },
    })
    notify(`已移动到「${status}」`)
    await reload()
  } catch (e) {
    notify(e.message, 'error')
  }
}

async function removeCompany(id) {
  await api(`/api/recruitment/companies/${id}`, { method: 'DELETE' })
  notify('公司已删除')
  await reload()
}

async function removeApplication(id) {
  await api(`/api/recruitment/applications/${id}`, { method: 'DELETE' })
  notify('投递已删除')
  await reload()
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
