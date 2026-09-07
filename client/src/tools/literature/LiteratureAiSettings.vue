<template>
  <div class="lt-ai">
    <p class="lt-ai-desc">选择服务商自动填好接口地址与模型；选「自定义」后可自行填写服务商名称、地址与模型。配置保存在你自己的账号下。</p>

    <div class="lt-ai-grid">
      <div class="lt-ai-field">
        <label>服务商</label>
        <EditableSelect
          v-model="s.ai_provider"
          :options="presetProviderOptions"
          placeholder="选择或输入服务商"
          @change="onProviderChange"
        />
      </div>
      <div class="lt-ai-field">
        <label>接口地址</label>
        <input v-model="s.ai_base_url" class="lt-input" placeholder="https://api.deepseek.com" />
      </div>
      <div class="lt-ai-field">
        <label>模型</label>
        <EditableSelect
          v-model="s.ai_model"
          :options="modelOptions"
          placeholder="选择或输入模型"
          tip="可直接输入自定义模型名称"
        />
      </div>
      <div class="lt-ai-field">
        <label>API Key</label>
        <div class="lt-ai-key">
          <input
            v-model="s.ai_api_key"
            :type="showKey ? 'text' : 'password'"
            class="lt-input"
            :placeholder="s.ai_api_key ? '已保存：' + s.ai_api_key + '（留空则不变）' : 'sk-…'"
          />
          <button
            type="button"
            class="lt-ai-eye"
            :title="showKey ? '隐藏' : '显示'"
            @click="showKey = !showKey"
          >
            <svg
              v-if="!showKey"
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <svg
              v-else
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="lt-ai-actions">
      <button class="lt-btn lt-btn-primary" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存配置' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../../api'
import EditableSelect from '../../ui/EditableSelect.vue'

const emit = defineEmits(['notify', 'saved'])

const PRESETS = {
  deepseek: {
    base: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  openai: {
    base: 'https://api.openai.com/v1',
    model: 'gpt-5.4-mini',
    models: [
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-chat-latest',
      'gpt-5.2',
      'gpt-5.1',
      'gpt-5-mini',
    ],
  },
  kimi: {
    base: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
    models: [
      'kimi-k3',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-k2.7-code-highspeed',
    ],
  },
  custom: { base: '', model: '', models: [] },
}

const s = ref({
  ai_provider: 'deepseek',
  ai_base_url: '',
  ai_model: '',
  ai_api_key: '',
})
const saving = ref(false)
const showKey = ref(false)
const presetProviderOptions = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'kimi', label: 'Kimi（Moonshot）' },
]
let lastProvider = 'deepseek'

const modelOptions = computed(() =>
  (PRESETS[s.value.ai_provider]?.models || []).map((m) => ({ value: m, label: m }))
)
onMounted(async () => {
  s.value = { ...s.value, ...(await api('/api/literature/settings')) }
  if (s.value.ai_provider === 'custom') s.value.ai_provider = ''
  // 未配置时自动预填当前服务商的默认接口地址与模型（DeepSeek + V4 Flash）
  const preset = PRESETS[s.value.ai_provider] || {}
  if (!s.value.ai_base_url && preset.base) s.value.ai_base_url = preset.base
  if (!s.value.ai_model && preset.model) s.value.ai_model = preset.model
  lastProvider = s.value.ai_provider || 'custom'
})

function onProviderChange(provider) {
  if (provider === lastProvider) return
  const prevPreset = PRESETS[lastProvider]
  const nextPreset = PRESETS[provider]
  const toPreset = !!(nextPreset && (nextPreset.base || nextPreset.model))
  const fromPreset = !!(prevPreset && (prevPreset.base || prevPreset.model))
  if (toPreset) {
    s.value.ai_base_url = nextPreset.base
    s.value.ai_model = nextPreset.model
  } else if (fromPreset) {
    // 切换到自定义服务商：若地址/模型仍是上一服务商默认值则清空；用户改过则保留
    if (!s.value.ai_base_url || s.value.ai_base_url === prevPreset.base) s.value.ai_base_url = ''
    if (!s.value.ai_model || s.value.ai_model === prevPreset.model) s.value.ai_model = ''
  }
  lastProvider = provider
}

async function save() {
  saving.value = true
  try {
    const providerName = String(s.value.ai_provider || '').trim()
    const body = {
      ...s.value,
      ai_provider: providerName || 'custom',
    }
    const r = await api('/api/literature/settings', { method: 'PUT', body })
    s.value = { ...s.value, ...r }
    if (s.value.ai_provider === 'custom') s.value.ai_provider = ''
    emit('notify', 'AI 配置已保存')
    emit('saved')
  } catch (e) {
    emit('notify', e.message, 'error')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.lt-ai-desc { font-size: 12.5px; color: var(--tk-faint); margin: 0 0 16px; line-height: 1.6; }
.lt-ai-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 18px;
}
.lt-ai-field label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tk-muted);
  margin-bottom: 6px;
}
.lt-ai-field .lt-input, .lt-ai-field .lt-select { width: 100%; }
.lt-ai-key { position: relative; }
.lt-ai-key .lt-input { padding-right: 40px; }
.lt-ai-eye {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 6px;
  transition: color 0.15s ease;
}
.lt-ai-eye:hover { color: var(--tk-blue); }
.lt-ai-key input[type='password']::-ms-reveal,
.lt-ai-key input[type='password']::-ms-clear {
  display: none;
}
.lt-ai-actions { display: flex; justify-content: center; margin-top: 20px; }
@media (max-width: 600px) {
  .lt-ai-grid { grid-template-columns: 1fr; }
}
</style>
