<template>
  <div class="tk-modal-overlay" @click.self="$emit('close')">
    <div class="tk-modal am-modal">
      <div class="tk-modal-header">
        <h3>{{ application ? '编辑投递' : '新增投递' }}</h3>
        <button class="tk-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="tk-modal-body">
        <div v-if="error" class="am-error">{{ error }}</div>

        <!-- 公司 -->
        <div class="tk-section">
          <div class="tk-section-title">所属公司</div>
          <div v-if="!application && !companyId" class="tk-field">
            <select v-model="form.company_id" class="tk-select am-company-select">
              <option :value="null" disabled>请选择公司</option>
              <option v-for="c in companyList" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div v-else class="am-company-name">{{ companyName }}</div>
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
              <select v-model="form.status" class="tk-select">
                <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="tk-field" style="grid-column: 1 / -1">
              <label>投递备注</label>
              <textarea v-model="form.notes" class="tk-textarea" placeholder="与该投递相关的补充说明"></textarea>
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
              <input
                v-model="m.name"
                class="tk-input"
                style="flex: 1; min-width: 150px; max-width: 240px"
                list="am-milestone-suggestions"
                placeholder="节点名称，如：一面"
              />
              <select v-model="m.result" class="tk-select am-result-select" title="节点结果">
                <option v-for="opt in RESULT_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <input v-model="m.date" type="date" class="tk-input" />
              <label class="am-remind-toggle">
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
            <div v-if="remindPreview(m)" class="am-remind-preview">将于 {{ remindPreview(m) }} 发送提醒邮件</div>

            <!-- 复盘笔记 -->
            <div style="margin-top: 8px">
              <button class="tk-notes-toggle" @click="m.showNotes = !m.showNotes">
                复盘笔记（{{ m.notes.length }}）{{ m.showNotes ? '▾' : '▸' }}
              </button>
              <div v-if="m.showNotes" class="am-notes">
                <div class="tk-note-item" v-for="(n, ni) in m.notes" :key="ni">
                  <div class="am-note-head">
                    <strong>{{ n.title || '无标题' }}</strong>
                    <span class="am-note-actions">
                      <button class="tk-btn tk-btn-icon" @click="editNote(m, n)">编辑</button>
                      <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeNote(m, n)">删除</button>
                    </span>
                  </div>
                  <div class="am-note-content" v-html="n.content"></div>
                  <div v-if="n.tags.length"><span class="tk-tag" v-for="t in n.tags" :key="t">{{ t }}</span></div>
                </div>

                <div v-if="m.editingNote" class="am-note-editor">
                  <input v-model="m.editingNote.title" class="tk-input" placeholder="笔记标题，如：算法题 - 最长回文子串" />
                  <RichEditor v-model="m.editingNote.content" />
                  <input v-model="m.editingNote.tagsText" class="tk-input" placeholder="标签，用空格或逗号分隔，如：算法 行为面试" />
                  <div class="am-note-editor-actions">
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
          <datalist id="am-milestone-suggestions">
            <option v-for="s in ['投递', '笔试', '一面', '二面', '三面', 'HR面', '群面', '背调', 'Offer']" :key="s" :value="s" />
          </datalist>
        </div>
      </div>

      <div class="tk-modal-footer">
        <button v-if="application" class="tk-btn tk-btn-danger" style="margin-right: auto" @click="removeApplication">删除投递</button>
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
import { api, STATUSES, RESULT_OPTIONS, todayStr, formatDateTime, parseTagsText } from '../../api'
import RichEditor from '../../ui/RichEditor.vue'

const props = defineProps({
  application: { type: Object, default: null },
  companyId: { type: Number, default: null },
})
const emit = defineEmits(['close', 'saved', 'notify'])

const companyList = ref([])

const form = reactive({
  company_id: props.companyId || (props.application && props.application.company_id) || null,
  position: props.application ? props.application.position || '' : '',
  department: props.application ? props.application.department || '' : '',
  city: props.application ? props.application.city || '' : '',
  salary: props.application ? props.application.salary || '' : '',
  notes: props.application ? props.application.notes || '' : '',
  status: props.application ? props.application.status || '已投递' : '已投递',
})

const milestones = ref(
  props.application
    ? (props.application.milestones || []).map((m) => ({
        id: m.id,
        name: m.name,
        date: m.date || '',
        result: m.result || 'none',
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
          result: 'none',
          hasRemind: false,
          remindValue: '',
          remindUnit: 'day',
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

onMounted(async () => {
  companyList.value = await api('/api/recruitment/companies')
})

function addMilestone() {
  milestones.value.push({
    id: null,
    name: '',
    date: todayStr(),
    result: 'none',
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
  if (!form.company_id) {
    error.value = '请选择所属公司'
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
      const remind =
        m.hasRemind && String(m.remindValue) !== ''
          ? { value: m.remindValue, unit: m.remindUnit }
          : null
      if (m.id) {
        await api(`/api/recruitment/applications/milestones/${m.id}`, {
          method: 'PUT',
          body: { name: m.name, date: m.date, result: m.result, remind },
        })
      } else {
        const r = await api(`/api/recruitment/applications/${appId}/milestones`, {
          method: 'POST',
          body: { name: m.name, date: m.date, result: m.result, remind },
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
          tags: parseTagsText(n.tagsText),
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
  if (!window.confirm(`确定删除该投递「${form.position || '未填写岗位'}」吗？相关节点与笔记会一并删除，不可恢复。`)) return
  await api(`/api/recruitment/applications/${props.application.id}`, { method: 'DELETE' })
  emit('saved')
  emit('close')
}
</script>

<style scoped>
.am-modal { max-width: 720px; }
.am-company-select { width: 100%; }
.am-company-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--tk-text);
  padding: 10px 12px;
  background: var(--tk-blue-soft);
  border-radius: 10px;
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
.am-result-select { width: 96px; flex: none; }
.am-remind-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  cursor: pointer;
}
.am-remind-preview { font-size: 12px; color: #4a90d9; margin-top: 6px; }
.am-notes { margin-top: 8px; }
.am-note-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.am-note-actions { display: flex; gap: 4px; }
.am-note-content {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
  word-break: break-word;
}
.am-note-content :deep(p) { margin: 4px 0; }
.am-note-content :deep(ul) { padding-left: 18px; }
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
