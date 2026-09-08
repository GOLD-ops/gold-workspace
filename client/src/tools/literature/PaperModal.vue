<template>
  <div class="lt-modal-overlay">
    <div class="lt-modal">
      <div class="lt-modal-header">
        <h3 :title="paper.filename">{{ paper.filename }}</h3>
        <button class="lt-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="lt-modal-body">
        <!-- 提取失败时手动粘贴文本 -->
        <div v-if="paper.text_status === 'failed'" class="pm-text">
          <div class="pm-text-title">文本提取失败，可在此粘贴文献正文后分析</div>
          <textarea v-model="manualText" class="pm-textarea" placeholder="粘贴文献的文本内容…"></textarea>
          <div class="pm-actions">
            <button class="lt-btn lt-btn-primary lt-btn-sm" :disabled="!manualText.trim()" @click="submitText">
              保存文本
            </button>
          </div>
        </div>

        <div v-if="error" class="pm-error">{{ error }}</div>
        <div v-if="saving" class="pm-saving">保存中…</div>

        <!-- AI 分析结果表单 -->
        <div class="pm-fields">
          <div class="pm-field" v-for="f in fields" :key="f.field_key">
            <label>{{ f.label }}</label>
            <textarea
              v-model="values[f.field_key]"
              class="pm-textarea"
              rows="3"
              placeholder="分析结果，可手动修改"
            ></textarea>
          </div>
        </div>
      </div>

      <div class="lt-modal-footer">
        <button class="lt-btn" @click="$emit('close')">取消</button>
        <button class="lt-btn lt-btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存结果' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../../api'

const props = defineProps({ paper: { type: Object, required: true } })
const emit = defineEmits(['close', 'saved', 'notify'])

const fields = ref([])
const values = ref({})
const manualText = ref('')
const saving = ref(false)
const error = ref('')

onMounted(async () => {
  fields.value = (await api('/api/literature/fields')).filter((f) => f.enabled)
  const detail = await api(`/api/literature/papers/${props.paper.id}`)
  props.paper.text_status = detail.text_status
  props.paper.status = detail.status
  const v = {}
  for (const f of fields.value) v[f.field_key] = ''
  for (const a of detail.analyses || []) v[a.field_key] = a.value
  values.value = v
})

async function submitText() {
  try {
    await api(`/api/literature/papers/${props.paper.id}/text`, {
      method: 'POST',
      body: { text: manualText.value },
    })
    props.paper.text_status = 'text'
    manualText.value = ''
    emit('notify', '文本已保存，可以开始分析了')
  } catch (e) {
    error.value = e.message
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await api(`/api/literature/papers/${props.paper.id}/analyses`, {
      method: 'PUT',
      body: { values: { ...values.value } },
    })
    emit('notify', '结果已保存')
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.pm-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12.5px;
  margin-bottom: 12px;
}
.pm-saving { font-size: 12px; color: var(--tk-muted); margin-bottom: 10px; }
.pm-text {
  border: 1px dashed #d3dcf0;
  background: #f8fafd;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
}
.pm-text-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--tk-text); }
.pm-textarea {
  width: 100%;
  border: 1px solid #dbe1ea;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
  box-sizing: border-box;
}
.pm-textarea:focus { border-color: var(--tk-blue); box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12); }
.pm-actions { margin-top: 8px; }
.pm-fields { display: grid; gap: 14px; }
.pm-field label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tk-muted);
  margin-bottom: 6px;
}
</style>
