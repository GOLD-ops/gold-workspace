<template>
  <div class="lt-ai">
    <p class="lt-ai-desc">选择服务商自动填好接口地址与模型；也可选「自定义」手动输入。配置保存在你自己的账号下。</p>

    <div class="lt-ai-grid">
      <div class="lt-ai-field">
        <label>服务商</label>
        <select v-model="s.ai_provider" class="lt-select" @change="onProviderChange">
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="kimi">Kimi（Moonshot）</option>
          <option value="custom">自定义（OpenAI 兼容）</option>
        </select>
      </div>
      <div class="lt-ai-field">
        <label>接口地址</label>
        <input v-model="s.ai_base_url" class="lt-input" placeholder="https://api.deepseek.com" />
      </div>
      <div class="lt-ai-field">
        <label>模型</label>
        <div class="lt-ai-model">
          <select
            v-if="modelOptions.length && !customSelected"
            v-model="modelValue"
            class="lt-select"
          >
            <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
            <option value="__custom__">自定义…</option>
          </select>
          <template v-else>
            <input v-model="s.ai_model" class="lt-input" placeholder="手动输入模型名" />
            <div v-if="modelOptions.length" class="lt-model-picker">
              <button class="lt-model-picker-btn" title="选择预置模型" @click="pickerOpen = !pickerOpen">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              <div v-if="pickerOpen" class="lt-model-list">
                <button v-for="m in modelOptions" :key="m" @click="pickModel(m)">{{ m }}</button>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div class="lt-ai-field">
        <label>API Key</label>
        <input
          v-model="s.ai_api_key"
          type="password"
          class="lt-input"
          :placeholder="s.ai_api_key ? '已保存：' + s.ai_api_key + '（留空则不变）' : 'sk-…'"
        />
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

const emit = defineEmits(['notify', 'saved'])

const PRESETS = {
  deepseek: {
    base: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  },
  openai: {
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  },
  kimi: {
    base: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    models: [
      'moonshot-v1-8k',
      'moonshot-v1-32k',
      'moonshot-v1-128k',
      'kimi-k2-0711-preview',
      'kimi-latest',
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
const customSelected = ref(false)
const pickerOpen = ref(false)

const modelOptions = computed(() => PRESETS[s.value.ai_provider]?.models || [])
const modelValue = computed({
  get: () =>
    customSelected.value || !modelOptions.value.includes(s.value.ai_model)
      ? '__custom__'
      : s.value.ai_model,
  set: (v) => {
    customSelected.value = v === '__custom__'
    if (v !== '__custom__') s.value.ai_model = v
  },
})
onMounted(async () => {
  s.value = { ...s.value, ...(await api('/api/literature/settings')) }
  // 未配置时自动预填当前服务商的默认接口地址与模型（DeepSeek + V4 Flash）
  const preset = PRESETS[s.value.ai_provider] || {}
  if (!s.value.ai_base_url && preset.base) s.value.ai_base_url = preset.base
  if (!s.value.ai_model && preset.model) s.value.ai_model = preset.model
})

function onProviderChange() {
  customSelected.value = false
  pickerOpen.value = false
  const next = PRESETS[s.value.ai_provider] || {}
  s.value.ai_base_url = next.base
  s.value.ai_model = next.model
}

function pickModel(m) {
  s.value.ai_model = m
  customSelected.value = false
  pickerOpen.value = false
}

async function save() {
  saving.value = true
  try {
    const r = await api('/api/literature/settings', { method: 'PUT', body: { ...s.value } })
    s.value = { ...s.value, ...r }
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
.lt-ai-model { position: relative; display: flex; gap: 8px; align-items: center; }
.lt-ai-model .lt-select, .lt-ai-model > input { flex: 1; min-width: 0; }
.lt-model-picker { position: relative; flex: none; }
.lt-model-picker-btn {
  border: 1px solid var(--tk-border);
  background: #fff;
  color: var(--tk-muted);
  width: 34px;
  height: 36px;
  border-radius: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.lt-model-picker-btn:hover { border-color: var(--tk-blue); color: var(--tk-blue); }
.lt-model-list {
  position: absolute;
  right: 0;
  top: 40px;
  min-width: 180px;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: var(--tk-shadow-md);
  z-index: 20;
  padding: 4px;
  display: grid;
}
.lt-model-list button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--tk-text);
  cursor: pointer;
  transition: background 0.12s ease;
}
.lt-model-list button:hover { background: var(--tk-blue-soft); color: var(--tk-blue); }
.lt-ai-actions { display: flex; justify-content: center; margin-top: 20px; }
@media (max-width: 600px) {
  .lt-ai-grid { grid-template-columns: 1fr; }
}
</style>
