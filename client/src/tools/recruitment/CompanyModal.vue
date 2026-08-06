<template>
  <div class="tk-modal-overlay" @click.self="$emit('close')">
    <div class="tk-modal">
      <div class="tk-modal-header">
        <h3>{{ company ? '编辑投递记录' : '新增投递记录' }}</h3>
        <button class="tk-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="tk-modal-body">
        <div v-if="error" class="cm-error">{{ error }}</div>

        <!-- AI 智能识别（仅新增时显示） -->
        <div v-if="!company" class="tk-section cm-ai">
          <div class="tk-section-title">
            AI 智能识别
            <span class="cm-ai-hint">粘贴招聘文本，自动提取并填入下方表单</span>
          </div>
          <div class="cm-ai-box">
            <textarea
              v-model="aiText"
              class="tk-textarea cm-ai-text"
              placeholder="粘贴招聘 JD、内推帖或 HR 消息，例如：&#10;【字节跳动】2027届秋招正式开启，招聘后端开发工程师，工作地点北京…"
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

        <!-- 基本信息 -->
        <div class="tk-section">
          <div class="tk-section-title">基本信息</div>
          <div class="tk-form-grid">
            <div class="tk-field">
              <label>公司名 *</label>
              <input v-model="form.company" class="tk-input" placeholder="如：字节跳动" />
            </div>
            <div class="tk-field">
              <label>应聘岗位</label>
              <input v-model="form.position" class="tk-input" placeholder="如：后端开发工程师" />
            </div>
            <div class="tk-field">
              <label>部门</label>
              <input v-model="form.department" class="tk-input" placeholder="如：抖音电商" />
            </div>
            <div class="tk-field">
              <label>城市</label>
              <input v-model="form.city" class="tk-input" placeholder="如：北京 / 远程" />
            </div>
            <div class="tk-field">
              <label>薪资</label>
              <input v-model="form.salary" class="tk-input" placeholder="如：25k-35k·15薪" />
            </div>
            <div class="tk-field">
              <label>投递渠道</label>
              <input v-model="form.channel" class="tk-input" placeholder="如：牛客内推 / 官网" />
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
              <label>备注</label>
              <textarea v-model="form.notes" class="tk-textarea" placeholder="补充说明，如岗位要求、截止时间等"></textarea>
            </div>
          </div>
        </div>

        <!-- 进展节点 -->
        <div class="tk-section">
          <div class="tk-section-title">
            进展节点
            <button class="tk-btn tk-btn-sm" @click="addMilestone">+ 添加节点</button>
          </div>
          <p class="cm-tip">按时间顺序记录 投递 → 笔试 → 一面 → 二面 → HR面 → Offer 等节点，系统会根据节点名自动更新所处阶段。</p>

          <div class="tk-milestone" v-for="(m, idx) in milestones" :key="idx">
            <div class="tk-milestone-row">
              <input
                v-model="m.name"
                class="tk-input"
                style="flex: 1; min-width: 170px; max-width: 280px"
                list="milestone-suggestions"
                placeholder="节点名称，如：一面"
              />
              <input v-model="m.date" type="date" class="tk-input" />
              <label class="cm-remind-toggle">
                <input v-model="m.hasRemind" type="checkbox" />
                邮件提醒
              </label>
              <template v-if="m.hasRemind">
                <input v-model="m.remindValue" class="tk-input" style="width: 76px" type="number" min="0" placeholder="提前" />
                <select v-model="m.remindUnit" class="tk-select">
                  <option value="hour">小时</option>
                  <option value="day">天</option>
                </select>
              </template>
              <button class="tk-btn tk-btn-danger tk-btn-icon" title="删除节点" @click="removeMilestone(idx)">删除</button>
            </div>
            <div v-if="remindPreview(m)" class="cm-remind-preview">将于 {{ remindPreview(m) }} 发送提醒邮件</div>

            <!-- 复盘笔记 -->
            <div style="margin-top: 8px">
              <button class="tk-notes-toggle" @click="m.showNotes = !m.showNotes">
                复盘笔记（{{ m.notes.length }}）{{ m.showNotes ? '▾' : '▸' }}
              </button>
              <div v-if="m.showNotes" class="cm-notes">
                <div class="tk-note-item" v-for="(n, ni) in m.notes" :key="ni">
                  <div class="cm-note-head">
                    <strong>{{ n.title || '无标题' }}</strong>
                    <span class="cm-note-actions">
                      <button class="tk-btn tk-btn-icon" @click="editNote(m, n)">编辑</button>
                      <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeNote(m, n)">删除</button>
                    </span>
                  </div>
                  <div class="cm-note-content" v-html="n.content"></div>
                  <div v-if="n.tags.length"><span class="tk-tag" v-for="t in n.tags" :key="t">{{ t }}</span></div>
                </div>

                <div v-if="m.editingNote" class="cm-note-editor">
                  <input v-model="m.editingNote.title" class="tk-input" placeholder="笔记标题，如：算法题 - 最长回文子串" />
                  <RichEditor v-model="m.editingNote.content" />
                  <input v-model="m.editingNote.tagsText" class="tk-input" placeholder="标签，用空格或逗号分隔，如：算法 行为面试" />
                  <div class="cm-note-editor-actions">
                    <button class="tk-btn tk-btn-sm" @click="cancelNote(m)">取消</button>
                    <button class="tk-btn tk-btn-primary tk-btn-sm" @click="commitNote(m)">保存笔记</button>
                  </div>
                </div>
                <button v-else class="tk-btn tk-btn-sm" style="margin-top: 8px" @click="m.editingNote = { title: '', content: '', tagsText: '' }">
                  + 添加复盘笔记
                </button>
              </div>
            </div>
          </div>
          <datalist id="milestone-suggestions">
            <option v-for="s in ['投递', '笔试', '一面', '二面', '三面', 'HR面', '群面', '背调', 'Offer', '已淘汰']" :key="s" :value="s" />
          </datalist>
        </div>
      </div>

      <div class="tk-modal-footer">
        <button v-if="company" class="tk-btn tk-btn-danger" style="margin-right: auto" @click="removeCompany">删除记录</button>
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
import { api, todayStr, formatDateTime, parseTagsText } from '../../api'
import RichEditor from '../../ui/RichEditor.vue'

const props = defineProps({
  company: { type: Object, default: null },
  initial: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const BASE = {
  company: '',
  position: '',
  department: '',
  city: '',
  salary: '',
  channel: '',
  link: '',
  referral_code: '',
  notes: '',
}

const form = reactive({
  ...BASE,
  ...(props.initial || {}),
  ...(props.company
    ? {
        company: props.company.company,
        position: props.company.position,
        department: props.company.department,
        city: props.company.city,
        salary: props.company.salary,
        channel: props.company.channel,
        link: props.company.link,
        referral_code: props.company.referral_code,
        notes: props.company.notes,
      }
    : {}),
})

const milestones = ref(
  props.company
    ? props.company.milestones.map((m) => ({
        id: m.id,
        name: m.name,
        date: m.date || '',
        hasRemind: !!(m.reminders && m.reminders.length && m.reminders[0].remind_at),
        remindValue: m.reminders && m.reminders.length ? m.reminders[0].remind_value || '' : '',
        remindUnit: m.reminders && m.reminders.length ? m.reminders[0].remind_unit || 'day' : 'day',
        showNotes: false,
        editingNote: null,
        notes: (m.notes || []).map((n) => ({
          id: n.id,
          title: n.title || '',
          content: n.content || '',
          tags: n.tags || [],
          tagsText: (n.tags || []).join(' '),
        })),
      }))
    : [
        {
          id: null,
          name: '投递',
          date: todayStr(),
          hasRemind: false,
          remindValue: '',
          remindUnit: 'day',
          showNotes: false,
          editingNote: null,
          notes: [],
        },
      ]
)

const removedMilestones = ref([])
const removedNotes = ref([])
const saving = ref(false)
const error = ref('')

// AI 智能识别
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

async function runAi() {
  if (!aiText.value.trim()) return
  aiLoading.value = true
  aiError.value = ''
  aiNote.value = ''
  try {
    const r = await api('/api/recruitment/ai/parse', { method: 'POST', body: { text: aiText.value } })
    Object.assign(form, r.fields)
    aiNote.value = '识别完成，已填入下方表单，请校对后保存'
  } catch (e) {
    aiError.value = e.message
  } finally {
    aiLoading.value = false
  }
}

function addMilestone() {
  milestones.value.push({
    id: null,
    name: '',
    date: todayStr(),
    hasRemind: false,
    remindValue: '',
    remindUnit: 'day',
    showNotes: false,
    editingNote: null,
    notes: [],
  })
}

function removeMilestone(idx) {
  const m = milestones.value[idx]
  if (m.id) removedMilestones.value.push(m.id)
  for (const n of m.notes) if (n.id) removedNotes.value.push(n.id)
  milestones.value.splice(idx, 1)
}

function removeNote(m, n) {
  if (n.id) removedNotes.value.push(n.id)
  m.notes = m.notes.filter((x) => x !== n)
}

function commitNote(m) {
  const draft = m.editingNote
  if (!draft.title.trim() && !draft.content.trim()) {
    m.editingNote = null
    return
  }
  if (draft.id) {
    const target = m.notes.find((x) => x.id === draft.id)
    if (target) {
      target.title = draft.title.trim()
      target.content = draft.content
      target.tags = parseTagsText(draft.tagsText)
      target.tagsText = draft.tagsText
    }
  } else {
    m.notes.push({
      id: null,
      title: draft.title.trim(),
      content: draft.content,
      tags: parseTagsText(draft.tagsText),
      tagsText: draft.tagsText,
    })
  }
  m.editingNote = null
}

function cancelNote(m) {
  m.editingNote = null
}

function editNote(m, n) {
  m.editingNote = {
    id: n.id,
    title: n.title,
    content: n.content,
    tagsText: n.tags.join(' '),
  }
}

function remindPreview(m) {
  if (!m.hasRemind || !m.remindValue || !m.date) return ''
  const base = new Date(m.date + 'T09:00:00')
  if (Number.isNaN(base.getTime())) return ''
  const ms = m.remindUnit === 'hour' ? Number(m.remindValue) * 3600000 : Number(m.remindValue) * 86400000
  return formatDateTime(new Date(base.getTime() - ms).toISOString())
}

async function save() {
  if (!form.company.trim()) {
    error.value = '请填写公司名'
    return
  }
  saving.value = true
  error.value = ''
  try {
    let companyId = props.company ? props.company.id : null
    if (props.company) {
      await api(`/api/recruitment/companies/${props.company.id}`, { method: 'PUT', body: { ...form } })
    } else {
      const created = await api('/api/recruitment/companies', { method: 'POST', body: { ...form } })
      companyId = created.id
    }

    for (const rid of removedMilestones.value) {
      await api(`/api/recruitment/companies/milestones/${rid}`, { method: 'DELETE' })
    }

    for (const m of milestones.value) {
      if (!m.name.trim()) continue
      const remind =
        m.hasRemind && String(m.remindValue) !== ''
          ? { value: m.remindValue, unit: m.remindUnit }
          : null
      if (m.id) {
        await api(`/api/recruitment/companies/milestones/${m.id}`, {
          method: 'PUT',
          body: { name: m.name, date: m.date, remind },
        })
      } else {
        const r = await api(`/api/recruitment/companies/${companyId}/milestones`, {
          method: 'POST',
          body: { name: m.name, date: m.date, remind },
        })
        const match = r.milestones.find(
          (x) => x.name === m.name.trim() && x.date === (m.date || '')
        )
        m.id = match ? match.id : null
      }
    }

    for (const rid of removedNotes.value) {
      await api(`/api/recruitment/notes/${rid}`, { method: 'DELETE' })
    }

    for (const m of milestones.value) {
      if (!m.id) continue
      for (const n of m.notes) {
        const payload = {
          title: n.title,
          content: n.content,
          tags: parseTagsText(n.tagsText),
        }
        if (n.id) {
          await api(`/api/recruitment/notes/${n.id}`, { method: 'PUT', body: payload })
        } else {
          await api(`/api/recruitment/notes/companies/${companyId}/notes`, {
            method: 'POST',
            body: { milestone_id: m.id, ...payload },
          })
        }
      }
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
  if (!window.confirm(`确定删除「${props.company.company}」的全部记录（含节点、笔记）？此操作不可恢复。`)) return
  await api(`/api/recruitment/companies/${props.company.id}`, { method: 'DELETE' })
  emit('saved')
  emit('close')
}
</script>

<style scoped>
.cm-ai-box {
  border: 1px dashed #d3dcf0;
  background: #f8fafd;
  border-radius: 12px;
  padding: 14px;
}
.cm-ai-hint { font-size: 12px; color: var(--tk-faint); font-weight: 400; }
.cm-ai-text { min-height: 96px; }
.cm-ai-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
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
.cm-tip { font-size: 12px; color: #9ca3af; margin-bottom: 12px; }
.cm-remind-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  cursor: pointer;
}
.cm-remind-preview { font-size: 12px; color: #4a90d9; margin-top: 6px; }
.cm-notes { margin-top: 8px; }
.cm-note-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.cm-note-actions { display: flex; gap: 4px; }
.cm-note-content {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
  word-break: break-word;
}
.cm-note-content :deep(p) { margin: 4px 0; }
.cm-note-content :deep(ul) { padding-left: 18px; }
.cm-note-editor {
  margin-top: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px dashed #d8dee7;
  border-radius: 8px;
  display: grid;
  gap: 8px;
}
.cm-note-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
