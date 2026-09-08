<template>
  <div class="tk-modal-overlay">
    <div class="tk-modal am-modal">
      <div class="tk-modal-header">
        <h3>{{ companyName }}{{ application ? ' · 编辑投递' : ' · 新增投递' }}</h3>
        <button class="tk-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="tk-modal-body">
        <div v-if="error" class="am-error">{{ error }}</div>

        <!-- AI 智能识别（仅新增时显示，识别投递级字段） -->
        <div v-if="!application" class="tk-section am-ai">
          <div class="tk-section-title">
            AI 智能识别
            <span class="am-ai-hint">粘贴官网投递记录，自动识别岗位、城市、薪资等并填入下方表单</span>
          </div>
          <div class="am-ai-box">
            <textarea
              v-model="aiText"
              class="tk-textarea am-ai-text"
              placeholder="粘贴官网投递成功页 / 投递记录，例如：&#10;字节跳动 - 后端开发工程师（北京）已投递，薪资 30k-40k…"
            ></textarea>
            <div class="am-ai-actions">
              <button
                class="tk-btn tk-btn-primary tk-btn-sm"
                :disabled="aiLoading || !aiText.trim()"
                @click="runAi"
              >
                {{ aiLoading ? '识别中…' : '开始识别' }}
              </button>
              <span v-if="aiNote" class="am-ai-note">{{ aiNote }}</span>
              <span v-else class="am-ai-note am-ai-provider">{{ aiProviderNote }}</span>
            </div>
            <div v-if="aiError" class="am-ai-error">{{ aiError }}</div>
          </div>
        </div>

        <!-- 岗位信息 -->
        <div class="tk-section">
          <div class="tk-section-title">岗位信息</div>
          <div class="tk-form-grid">
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
              <label>当前阶段</label>
              <SelectPicker
                v-model="form.status"
                :options="statusOptions"
                class="am-status-picker"
              />
            </div>
            <div class="tk-field" style="grid-column: 1 / -1">
              <label>投递备注</label>
              <textarea v-model="form.notes" class="tk-textarea" placeholder="与该投递相关的补充说明"></textarea>
            </div>
            <div class="tk-field" style="grid-column: 1 / -1">
              <label>职位描述</label>
              <textarea
                v-model="form.requirements"
                class="tk-textarea"
                rows="4"
                placeholder="职位描述、职责、技能要求等 JD 内容，笔试/面试前可随时查看"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 进展节点 -->
        <div class="tk-section">
          <div class="tk-section-title">
            进展节点
            <button class="tk-btn tk-btn-sm" @click="addMilestone">+ 添加节点</button>
          </div>
          <p class="am-tip">按时间记录 投递 → 笔试 → 一面 → 二面 → HR面 → Offer 等节点；节点结果会自动更新所处阶段（未通过 → 已淘汰）。</p>

          <div class="tk-milestone" v-for="(m, idx) in milestones" :key="idx">
            <div class="tk-milestone-row">
              <div class="am-name-wrap">
                <input
                  v-model="m.name"
                  class="tk-input"
                  placeholder="节点名称，如：一面"
                  @focus="openPicker(m)"
                  @blur="closePicker(m)"
                />
                <button type="button" class="am-name-picker" title="常用节点" @mousedown.prevent="togglePicker(m)">▾</button>
                <div v-if="m.pickerOpen" class="am-name-menu">
                  <button
                    type="button"
                    v-for="s in NAME_SUGGESTIONS"
                    :key="s"
                    @mousedown.prevent="pickName(m, s)"
                  >
                    {{ s }}
                  </button>
                </div>
              </div>
              <input v-model="m.date" type="datetime-local" class="tk-input am-node-date" />
              <SelectPicker
                v-if="resultRequired(m.name)"
                v-model="m.result"
                :options="RESULT_OPTIONS"
                class="am-result-picker"
              />
              <button class="tk-btn tk-btn-danger tk-btn-icon am-milestone-del" title="删除节点" @click="removeMilestone(idx)">删除</button>
            </div>

            <!-- 复盘笔记 -->
            <div style="margin-top: 8px">
              <button class="tk-notes-toggle" @click="m.showNotes = !m.showNotes">
                复盘笔记（{{ m.notes.length }}）{{ m.showNotes ? '▾' : '▸' }}
              </button>
              <div v-if="m.showNotes" class="am-notes">
                <div
                  class="tk-note-item"
                  v-for="n in m.notes"
                  :key="n.key"
                  :class="{ editing: m.editingNote && m.editingNote.key === n.key }"
                >
                  <template v-if="m.editingNote && m.editingNote.key === n.key">
                    <input v-model="m.editingNote.title" class="tk-input" placeholder="笔记标题，如：算法题 - 最长回文子串" />
                    <MarkdownEditor v-model="m.editingNote.content" />
                    <div class="am-note-editor-actions">
                      <button class="tk-btn tk-btn-sm" @click="cancelNote(m)">取消</button>
                      <button class="tk-btn tk-btn-primary tk-btn-sm" @click="commitNote(m)">保存笔记</button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="am-note-head">
                      <div class="am-note-title">
                        <svg
                          class="am-note-title-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
                        </svg>
                        <strong>{{ n.title || '无标题' }}</strong>
                      </div>
                      <span class="am-note-actions">
                        <button class="tk-btn tk-btn-icon" @click="editNote(m, n)">编辑</button>
                        <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeNote(m, n)">删除</button>
                      </span>
                    </div>
                    <div class="am-note-content" v-html="renderMarkdown(n.content)"></div>
                    <div v-if="n.updated_at" class="am-note-foot">
                      <span v-if="n.updated_at" class="am-note-date">{{ formatDateTime(n.updated_at) }}</span>
                    </div>
                  </template>
                </div>

                <!-- 新增笔记（未关联已有笔记）时，在下方显示编辑区 -->
                <div v-if="m.editingNote && !m.editingNote.key" class="am-note-editor">
                  <input v-model="m.editingNote.title" class="tk-input" placeholder="笔记标题，如：算法题 - 最长回文子串" />
                  <MarkdownEditor v-model="m.editingNote.content" />
                  <div class="am-note-editor-actions">
                    <button class="tk-btn tk-btn-sm" @click="cancelNote(m)">取消</button>
                    <button class="tk-btn tk-btn-primary tk-btn-sm" @click="commitNote(m)">保存笔记</button>
                  </div>
                </div>
                <button v-if="!m.editingNote" class="tk-btn tk-btn-sm" style="margin-top: 8px" @click="addNote(m)">
                  + 添加复盘笔记
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="tk-modal-footer">
        <button v-if="application" class="tk-btn tk-btn-danger" style="margin-right: auto" @click="removeApplication">
          删除投递
        </button>
        <button class="tk-btn" @click="$emit('close')">取消</button>
        <button class="tk-btn tk-btn-primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { api, STATUSES, RESULT_OPTIONS, nowStr, formatDateTime } from '../../api'
import MarkdownEditor from '../../ui/MarkdownEditor.vue'
import { renderMarkdown } from '../../ui/markdown'
import { confirmDialog } from '../../ui/confirm'
import SelectPicker from './SelectPicker.vue'

const props = defineProps({
  application: { type: Object, default: null },
  companyId: { type: Number, default: null },
})
const emit = defineEmits(['close', 'saved', 'notify'])

const NAME_SUGGESTIONS = ['投递', '笔试', '群面', '一面', '二面', '三面', 'HR面', '背调', 'Offer']
const statusOptions = STATUSES.map((s) => ({ value: s, label: s }))
const companyList = ref([])
let noteSeq = 0

const form = reactive({
  company_id: props.companyId || (props.application && props.application.company_id) || null,
  position: props.application ? props.application.position || '' : '',
  department: props.application ? props.application.department || '' : '',
  city: props.application ? props.application.city || '' : '',
  salary: props.application ? props.application.salary || '' : '',
  notes: props.application ? props.application.notes || '' : '',
  requirements: props.application ? props.application.requirements || '' : '',
  status: props.application ? props.application.status || '已投递' : '已投递',
})

const milestones = ref(
  props.application
    ? (props.application.milestones || []).map((m) => {
        return {
          id: m.id,
          name: m.name,
          date: m.date && !String(m.date).includes('T') ? m.date + 'T00:00' : m.date || '',
          result: m.result || 'waiting',
          pickerOpen: false,
          showNotes: false,
          editingNote: null,
          notes: (m.notes || []).map((n) => ({
            key: n.id != null ? `db-${n.id}` : `new-${++noteSeq}`,
            id: n.id != null ? n.id : null,
            title: n.title || '',
            content: n.content || '',
          })),
        }
      })
    : [
        {
          id: null,
          name: '投递',
          date: nowStr(),
          result: 'waiting',
          pickerOpen: false,
          showNotes: false,
          editingNote: null,
          notes: [],
        },
      ]
)

const companyName = computed(() => {
  if (props.application) {
    const c = companyList.value.find((x) => x.id === props.application.company_id)
    return c ? c.name : `公司 #${props.application.company_id}`
  }
  const c = companyList.value.find((x) => x.id === form.company_id)
  return c ? c.name : ''
})

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
  companyList.value = await api('/api/recruitment/companies')
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
    const r = await api('/api/recruitment/ai/parse-application', {
      method: 'POST',
      body: { text: aiText.value },
    })
    Object.assign(form, r.fields)
    aiNote.value = '识别完成，已填入岗位信息，请校对后保存'
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
    date: nowStr(),
    result: 'waiting',
    pickerOpen: false,
    showNotes: false,
    editingNote: null,
    notes: [],
  })
}

function togglePicker(m) {
  m.pickerOpen = !m.pickerOpen
}
function openPicker(m) {
  m.pickerOpen = true
}
function closePicker(m) {
  m.pickerOpen = false
}
function pickName(m, s) {
  m.name = s
  m.pickerOpen = false
}

// 无需结果状态的节点（投递/Offer/已淘汰等）不显示四态
function resultRequired(name) {
  const n = String(name || '').toLowerCase()
  if (!n) return true
  if (['投递', '内推', '网申', '申请'].some((k) => n.includes(k))) return false
  if (n.includes('offer')) return false
  if (['淘汰', '未通过', '拒绝', '拒'].some((k) => n.includes(k))) return false
  return true
}

async function removeMilestone(idx) {
  const m = milestones.value[idx]
  const ok = await confirmDialog({
    title: '删除节点',
    message: `确定删除节点「${m.name || '未命名'}」吗？该节点下的复盘笔记会一并删除，不可恢复。`,
  })
  if (!ok) return
  if (m.id) removedMilestones.value.push(m.id)
  for (const n of m.notes) if (n.id) removedNotes.value.push(n.id)
  milestones.value.splice(idx, 1)
}

async function removeNote(m, n) {
  const ok = await confirmDialog({
    title: '删除笔记',
    message: `确定删除笔记「${n.title || '无标题'}」吗？删除后不可恢复。`,
  })
  if (!ok) return
  if (n.id) removedNotes.value.push(n.id)
  m.notes = m.notes.filter((x) => x !== n)
}

function commitNote(m) {
  const draft = m.editingNote
  if (!draft.title.trim() && !draft.content.trim()) {
    m.editingNote = null
    return
  }
  if (draft.key) {
    const target = m.notes.find((x) => x.key === draft.key)
    if (target) {
      target.title = draft.title.trim()
      target.content = draft.content
    }
    m.editingNote = null
    return
  }
  m.notes.push({
    key: `new-${++noteSeq}`,
    id: null,
    title: draft.title.trim(),
    content: draft.content,
  })
  m.editingNote = null
}

function cancelNote(m) {
  m.editingNote = null
}

// 新增笔记时按「公司-岗位-节点笔记」自动填充标题
function addNote(m) {
  const parts = [companyName.value, form.position, m.name].filter(Boolean)
  m.editingNote = {
    title: parts.length ? `${parts.join('-')}笔记` : '',
    content: '',
  }
}

function editNote(m, n) {
  m.editingNote = {
    key: n.key,
    title: n.title,
    content: n.content,
  }
}

async function save() {
  if (!form.company_id) {
    error.value = '请选择所属公司'
    return
  }
  if (!form.position.trim()) {
    error.value = '请填写应聘岗位'
    return
  }
  saving.value = true
  error.value = ''
  try {
    let appId = props.application ? props.application.id : null
    if (props.application) {
      await api(`/api/recruitment/applications/${props.application.id}`, {
        method: 'PUT',
        body: { ...form },
      })
    } else {
      const created = await api('/api/recruitment/applications', {
        method: 'POST',
        body: { ...form },
      })
      appId = created.id
    }

    for (const rid of removedMilestones.value) {
      await api(`/api/recruitment/applications/milestones/${rid}`, { method: 'DELETE' })
    }

    for (const m of milestones.value) {
      if (!m.name.trim()) continue
      if (m.id) {
        await api(`/api/recruitment/applications/milestones/${m.id}`, {
          method: 'PUT',
          body: { name: m.name, date: m.date, result: m.result },
        })
      } else {
        const r = await api(`/api/recruitment/applications/${appId}/milestones`, {
          method: 'POST',
          body: { name: m.name, date: m.date, result: m.result },
        })
        const matches = r.milestones.filter(
          (x) => x.name === m.name.trim() && x.date === (m.date || '')
        )
        m.id = matches.length ? matches[matches.length - 1].id : null
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
        }
        if (n.id) {
          await api(`/api/recruitment/notes/${n.id}`, { method: 'PUT', body: payload })
        } else {
          await api(`/api/recruitment/notes/applications/${appId}/notes`, {
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

async function removeApplication() {
  const ok = await confirmDialog({
    title: '删除投递',
    message: `确定删除投递「${form.position || '未填写岗位'}」吗？相关节点与笔记会一并删除，不可恢复。`,
  })
  if (!ok) return
  await api(`/api/recruitment/applications/${props.application.id}`, { method: 'DELETE' })
  emit('saved')
  emit('close')
}
</script>

<style scoped>
.am-modal { max-width: 720px; }
.am-ai { margin-top: 0; }
.am-ai-box {
  border: 1px dashed #d3dcf0;
  background: #f8fafd;
  border-radius: 12px;
  padding: 12px 14px;
}
.am-ai-hint { font-size: 12px; color: var(--tk-faint); font-weight: 400; }
.am-ai-text { width: 100%; min-height: 76px; }
.am-ai-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.am-ai-note { font-size: 12px; color: var(--tk-muted); }
.am-ai-provider { color: var(--tk-faint); }
.am-ai-error {
  margin-top: 10px;
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
}
.am-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}
.am-tip { font-size: 12px; color: #9ca3af; margin-bottom: 12px; }
.am-result-picker { flex: none; width: 96px; }
.am-result-picker :deep(.sp-trigger) { height: 32px; padding: 0 8px; }
.am-status-picker { width: 100%; }
.am-status-picker :deep(.sp-trigger) { height: 36px; }
.am-node-date {
  width: 210px;
  flex: none;
  padding: 7px 10px;
}
.am-milestone-del {
  margin-left: auto;
  flex: none;
}
.am-name-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 140px;
  max-width: 200px;
}
.am-name-wrap .tk-input {
  width: 100%;
  padding-right: 30px;
}
.am-name-picker {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1;
}
.am-name-picker:hover {
  color: var(--tk-blue);
  background: var(--tk-blue-soft);
}
.am-name-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: var(--tk-shadow-md);
  padding: 4px;
  min-width: 132px;
  display: grid;
}
.am-name-menu button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--tk-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease;
}
.am-name-menu button:hover {
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
}
.am-notes { margin-top: 8px; }
.am-notes .tk-note-item {
  position: relative;
  background: #fff;
  border: 1px solid #e8ecf3;
  border-radius: 10px;
  padding: 12px 14px 10px;
  box-shadow: 0 1px 2px rgba(23, 32, 56, 0.04);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.am-notes .tk-note-item:hover {
  border-color: #d5dcea;
  box-shadow: 0 4px 12px rgba(23, 32, 56, 0.07);
}
.tk-note-item.editing {
  border: 1px dashed #d8dee7;
  border-radius: 8px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 8px;
}
.tk-note-item.editing :deep(.md-wrap) { background: #fff; }
.am-notes .tk-note-item.editing:hover { border-color: #d8dee7; box-shadow: none; }
.am-note-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.am-note-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.am-note-title strong {
  font-size: 13.5px;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.am-note-title-icon {
  width: 14px;
  height: 14px;
  flex: none;
  color: var(--tk-blue);
}
.am-note-actions { display: flex; gap: 6px; }
.am-note-actions .tk-btn {
  border: 1px solid #e4e8f0;
  background: #fff;
  color: var(--tk-muted);
  box-shadow: none;
  padding: 4px 10px;
  border-radius: 7px;
  font-size: 12px;
}
.am-note-actions .tk-btn:hover {
  color: var(--tk-blue);
  border-color: #bcd0f2;
  background: var(--tk-blue-soft);
  transform: none;
}
.am-note-actions .tk-btn-danger {
  color: #dc2626;
  border-color: #f0d3d3;
}
.am-note-actions .tk-btn-danger:hover {
  color: #dc2626;
  border-color: #fecaca;
  background: #fef2f2;
}
.am-note-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #eef1f6;
}
.am-note-date {
  font-size: 11px;
  color: #b0b7c2;
  flex: none;
  white-space: nowrap;
}
.am-note-content {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
  word-break: break-word;
}
.am-note-content :deep(p) { margin: 4px 0; }
.am-note-content :deep(h1),
.am-note-content :deep(h2),
.am-note-content :deep(h3),
.am-note-content :deep(h4),
.am-note-content :deep(h5),
.am-note-content :deep(h6) { margin: 8px 0 4px; color: #1f2937; }
.am-note-content :deep(h1) { font-size: 16px; }
.am-note-content :deep(h2) { font-size: 15px; }
.am-note-content :deep(h3) { font-size: 14px; }
.am-note-content :deep(h4) { font-size: 13.5px; }
.am-note-content :deep(h5) { font-size: 13px; }
.am-note-content :deep(h6) { font-size: 13px; color: var(--tk-muted); }
.am-note-content :deep(ul),
.am-note-content :deep(ol) { padding-left: 20px; margin: 4px 0; }
.am-note-content :deep(ol) { list-style: decimal; }
.am-note-content :deep(ul) { list-style: disc; }
.am-note-content :deep(li) { margin: 2px 0; }
.am-note-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--tk-border);
  margin: 10px 0;
}
.am-note-content :deep(.md-task) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.am-note-content :deep(.md-task input) {
  margin: 0;
  accent-color: var(--tk-blue);
}
.am-note-content :deep(a) { color: var(--tk-blue); }
.am-note-content :deep(code) {
  background: #f0f3f8;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
.am-note-content :deep(pre) {
  background: #f6f8fb;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 6px 0;
}
.am-note-content :deep(pre code) { background: transparent; padding: 0; }
.am-note-content :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--tk-blue);
  color: var(--tk-muted);
  background: #f8fafd;
  border-radius: 0 6px 6px 0;
}
.am-note-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12.5px;
}
.am-note-content :deep(th),
.am-note-content :deep(td) {
  border: 1px solid var(--tk-border);
  padding: 5px 9px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}
.am-note-content :deep(th) {
  background: #f3f6fb;
  color: #1f2937;
  font-weight: 600;
  white-space: nowrap;
}
.am-note-content :deep(tbody tr:nth-child(even) td) { background: #fafbfd; }
.am-note-editor {
  margin-top: 10px;
  padding: 12px;
  background: #f8fafc;
  border: 1px dashed #d8dee7;
  border-radius: 8px;
  display: grid;
  gap: 8px;
}
.am-note-editor-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
