<template>
  <div class="tk-modal-overlay" @click.self="$emit('close')">
    <div class="tk-modal">
      <div class="tk-modal-header">
        <h3>{{ company ? '编辑公司' : '新增公司' }}</h3>
        <button class="tk-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="tk-modal-body">
        <div v-if="error" class="cm-error">{{ error }}</div>

        <!-- AI 智能识别（仅新增时显示，只创建公司） -->
        <div v-if="!company" class="tk-section cm-ai">
          <div class="tk-section-title">
            AI 智能识别
            <span class="cm-ai-hint">粘贴招聘文本，自动识别公司并填入下方表单</span>
          </div>
          <div class="cm-ai-box">
            <textarea
              v-model="aiText"
              class="tk-textarea cm-ai-text"
              placeholder="粘贴招聘 JD、内推帖或 HR 消息，例如：&#10;【字节跳动】2027届秋招正式开启，招聘后端开发工程师…"
            ></textarea>
            <div class="cm-ai-actions">
              <button
                class="tk-btn tk-btn-primary tk-btn-sm"
                :disabled="aiLoading || !aiText.trim()"
                @click="runAi"
              >
                {{ aiLoading ? '识别中…' : '开始识别' }}
              </button>
              <span v-if="aiNote" class="cm-ai-note">{{ aiNote }}</span>
              <span v-else class="cm-ai-note cm-ai-provider">{{ aiProviderNote }}</span>
            </div>
            <div v-if="aiError" class="cm-ai-error">{{ aiError }}</div>
          </div>
        </div>

        <!-- 公司信息 -->
        <div class="tk-section">
          <div class="tk-section-title">公司信息</div>
          <div class="tk-form-grid">
            <div class="tk-field">
              <label>公司名 *</label>
              <input v-model="form.name" class="tk-input" placeholder="如：字节跳动" />
            </div>
            <div class="tk-field">
              <label>投递链接</label>
              <input v-model="form.link" class="tk-input" placeholder="https://…" />
            </div>
            <div class="tk-field">
              <label>内推码</label>
              <input v-model="form.referral_code" class="tk-input" placeholder="内推码（可选）" />
            </div>
            <div class="tk-field" style="grid-column: 1 / -1">
              <label>公司备注</label>
              <textarea v-model="form.notes" class="tk-textarea" placeholder="招聘要求、截止时间等公司级说明"></textarea>
            </div>
          </div>
        </div>

        <!-- 下属投递 -->
        <div v-if="company" class="tk-section">
          <div class="tk-section-title">
            投递记录（{{ applications.length }}）
            <button class="tk-btn tk-btn-sm" @click="$emit('add-application', company.id)">+ 新增记录</button>
          </div>
          <div v-if="!applications.length" class="cm-no-apps">还没有投递记录，点击「新增记录」记录第一个岗位。</div>
          <div class="cm-app-item" v-for="a in applications" :key="a.id">
            <div class="cm-app-info">
              <span class="cm-app-pos">{{ a.position || '未填写岗位' }}</span>
              <span class="tk-badge tl-status" :style="statusStyle(a.status)">{{ a.status }}</span>
              <span v-if="a.city" class="cm-app-chip">{{ a.city }}</span>
              <span v-if="a.salary" class="cm-app-chip">{{ a.salary }}</span>
            </div>
            <button class="tk-btn tk-btn-icon cm-app-view" @click="$emit('open-application', a)">查看进度</button>
          </div>
        </div>
      </div>

      <div class="tk-modal-footer">
        <button v-if="company" class="tk-btn tk-btn-danger" style="margin-right: auto" @click="removeCompany">删除公司</button>
        <button class="tk-btn" @click="$emit('close')">取消</button>
        <button class="tk-btn tk-btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api, STATUS_COLORS } from '../../api'
import { confirmDialog } from '../../ui/confirm'

const props = defineProps({
  company: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved', 'open-application', 'add-application', 'reload', 'notify'])

const form = reactive({
  name: props.company ? props.company.name : '',
  link: props.company ? props.company.link || '' : '',
  referral_code: props.company ? props.company.referral_code || '' : '',
  notes: props.company ? props.company.notes || '' : '',
})
const applications = ref(props.company ? props.company.applications || [] : [])
const saving = ref(false)
const error = ref('')

const aiText = ref('')
const aiLoading = ref(false)
const aiError = ref('')
const aiNote = ref('')
const aiProviderNote = ref('')

onMounted(async () => {
  try {
    const s = await api('/api/recruitment/settings')
    const names = { deepseek: 'DeepSeek', openai: 'OpenAI', kimi: 'Kimi', custom: '自定义' }
    aiProviderNote.value = s.ai_provider
      ? `使用 ${names[s.ai_provider] || s.ai_provider} · ${s.ai_model || '默认模型'}`
      : '尚未配置 AI 服务'
  } catch {
    aiProviderNote.value = ''
  }
})

function statusStyle(s) {
  return { background: STATUS_COLORS[s] + '1a', color: STATUS_COLORS[s] }
}

async function runAi() {
  if (!aiText.value.trim()) return
  aiLoading.value = true
  aiError.value = ''
  aiNote.value = ''
  try {
    const r = await api('/api/recruitment/ai/parse', { method: 'POST', body: { text: aiText.value } })
    Object.assign(form, r.fields)
    aiNote.value = '识别完成，已填入公司信息，请校对后保存'
  } catch (e) {
    aiError.value = e.message
  } finally {
    aiLoading.value = false
  }
}

async function save() {
  if (!form.name.trim()) {
    error.value = '请填写公司名'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (props.company) {
      await api(`/api/recruitment/companies/${props.company.id}`, { method: 'PUT', body: { ...form } })
    } else {
      await api('/api/recruitment/companies', { method: 'POST', body: { ...form } })
    }
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function removeCompany() {
  const ok = await confirmDialog({
    title: '删除公司',
    message: `确定删除「${props.company.name}」吗？其下全部投递、节点、笔记将一并删除，不可恢复。`,
  })
  if (!ok) return
  await api(`/api/recruitment/companies/${props.company.id}`, { method: 'DELETE' })
  emit('saved')
  emit('close')
}
</script>

<style scoped>
.cm-ai { margin-top: 0; }
.cm-ai-box {
  border: 1px dashed #d3dcf0;
  background: #f8fafd;
  border-radius: 12px;
  padding: 12px 14px;
}
.cm-ai-hint { font-size: 12px; color: var(--tk-faint); font-weight: 400; }
.cm-ai-text { width: 100%; min-height: 76px; }
.cm-ai-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.cm-ai-note { font-size: 12px; color: var(--tk-muted); }
.cm-ai-provider { color: var(--tk-faint); }
.cm-ai-error {
  margin-top: 10px;
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
}
.cm-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}
.cm-no-apps {
  font-size: 12.5px;
  color: var(--tk-faint);
  padding: 12px;
  background: #f8fafc;
  border: 1px dashed #d8dee7;
  border-radius: 10px;
}
.cm-app-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #edf0f5;
  border-radius: 10px;
  margin-bottom: 8px;
}
.cm-app-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cm-app-pos { font-size: 13px; font-weight: 600; color: var(--tk-text); }
.tl-status { font-size: 11px; padding: 2px 9px; border-radius: 999px; }
.cm-app-chip {
  background: #f1f4f8;
  color: #5d6878;
  border-radius: 7px;
  padding: 2px 9px;
  font-size: 11.5px;
  white-space: nowrap;
}
.cm-app-view { flex: none; color: var(--tk-blue); border-color: #bcd0f2; background: #fff; }
</style>
