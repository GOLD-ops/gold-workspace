<template>
  <div class="lt">
    <!-- AI 配置状态条 -->
    <div class="lt-card lt-ai-bar">
      <div class="lt-ai-bar-info">
        <span class="lt-ai-dot" :class="{ ready: aiReady }"></span>
        <span v-if="aiReady">AI 已配置：{{ aiProvider }} · {{ aiModel }}</span>
        <span v-else>尚未配置 AI 服务，点「去配置」填入你的 API Key 即可分析</span>
      </div>
      <button class="lt-btn lt-btn-sm" @click="showAi = true">
        {{ aiReady ? '修改配置' : '去配置' }}
      </button>
    </div>

    <!-- AI 配置弹窗 -->
    <div v-if="showAi" class="lt-modal-overlay" @click.self="showAi = false">
      <div class="lt-modal lt-modal-ai">
        <div class="lt-modal-header">
          <h3>AI 服务配置</h3>
          <button class="lt-modal-close" @click="showAi = false">✕</button>
        </div>
        <div class="lt-modal-body">
          <LiteratureAiSettings @notify="notify" @saved="onAiSaved" />
        </div>
      </div>
    </div>

    <LiteratureList @notify="notify" />

    <div v-if="toast" class="lt-toast" :class="{ error: toastType === 'error' }">{{ toast }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api'
import './literature.css'
import LiteratureList from './LiteratureList.vue'
import LiteratureAiSettings from './LiteratureAiSettings.vue'

const showAi = ref(false)
const aiProvider = ref('')
const aiModel = ref('')
const aiKey = ref('')
const aiReady = ref(false)

onMounted(async () => {
  await refreshAi()
})

async function refreshAi() {
  try {
    const s = await api('/api/literature/settings')
    aiProvider.value = s.ai_provider
    aiModel.value = s.ai_model
    aiKey.value = s.ai_api_key
    aiReady.value = !!s.ai_api_key
  } catch {
    // 忽略
  }
}

async function onAiSaved() {
  showAi.value = false
  await refreshAi()
}
const toast = ref('')
const toastType = ref('')
let timer = null

function notify(msg, type = '') {
  toast.value = msg
  toastType.value = type
  clearTimeout(timer)
  timer = setTimeout(() => (toast.value = ''), 2600)
}
</script>

<style scoped>
.lt-admin-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
.lt-ai-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
}
.lt-ai-bar-info {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  color: var(--tk-muted);
  min-width: 0;
}
.lt-ai-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  flex: none;
}
.lt-ai-dot.ready { background: #10b981; }
.lt-modal-ai { max-width: 640px; }
</style>
