<template>
  <div>
    <div class="tk-card nt-toolbar-card">
      <div class="nt-filters">
        <SelectPicker v-model="filterCompany" :options="companyFilterOptions" multiple placeholder="全部公司" class="nt-filter" />
        <SelectPicker v-model="filterPosition" :options="positionFilterOptions" multiple placeholder="全部岗位" class="nt-filter" />
        <SelectPicker v-model="filterMilestone" :options="milestoneFilterOptions" multiple placeholder="全部节点" class="nt-filter" />
        <SelectPicker v-model="groupBy" :options="groupOptions" class="nt-group-picker" />
        <input v-model="q" class="tk-input nt-search" placeholder="搜索标题 / 内容 / 公司…" />
        <span class="nt-count">共 {{ filtered.length }} 条</span>
        <span style="flex: 1"></span>
        <button class="tk-btn tk-btn-sm" @click="exportNotes">导出</button>
        <label class="tk-btn tk-btn-sm" style="cursor: pointer">
          导入
          <input type="file" accept=".json,application/json" style="display: none" @change="importNotes" />
        </label>
        <button class="tk-btn tk-btn-primary tk-btn-sm" @click="showNew ? closeNew() : (showNew = true)">
          {{ showNew ? '收起' : '新增笔记' }}
        </button>
      </div>
    </div>

    <div v-if="showNew" class="tk-card nt-new-card">
      <div class="nt-new-grid">
        <div class="tk-field">
          <label>公司</label>
          <SelectPicker v-model="newDraft.companyId" :options="companyOptions" placeholder="选择公司" />
        </div>
        <div class="tk-field">
          <label>岗位</label>
          <SelectPicker v-model="newDraft.applicationId" :options="appOptions" placeholder="先选择公司" />
        </div>
        <div class="tk-field">
          <label>节点</label>
          <SelectPicker v-model="newDraft.milestoneId" :options="milestoneOptions" placeholder="可留空" />
        </div>
        <div class="tk-field">
          <label>标题</label>
          <input v-model="newDraft.title" class="tk-input" placeholder="笔记标题" @input="titleAuto = false" />
        </div>
      </div>
      <MarkdownEditor v-model="newDraft.content" :min-height="240" />
      <div class="nt-new-foot">
        <span style="flex: 1"></span>
        <button class="tk-btn tk-btn-sm" @click="closeNew">取消</button>
        <button class="tk-btn tk-btn-primary tk-btn-sm" :disabled="savingNew" @click="saveNew">
          {{ savingNew ? '保存中…' : '保存笔记' }}
        </button>
      </div>
    </div>

    <div v-if="!grouped.length" class="tk-card tk-empty">
      没有符合条件的笔记。点击右上角「新增笔记」，或在「列表 → 编辑记录 → 节点下的复盘笔记」中添加。
    </div>

    <div v-for="g in grouped" :key="g.tag" class="nt-group">
      <div v-if="g.tag" class="nt-group-title plain">
        {{ g.tag }}
        <span>{{ g.notes.length }}</span>
      </div>
      <div class="nt-grid">
        <div class="tk-card nt-note" v-for="n in g.notes" :key="n.id" @click="openViewer(n)">
          <div class="nt-note-head">
            <span class="nt-company">{{ n.company_name }}</span>
            <span v-if="n.company_position" class="nt-position">{{ n.company_position }}</span>
            <span v-if="n.milestone_name" class="nt-milestone">{{ n.milestone_name }}</span>
          </div>
          <div class="nt-note-title">{{ n.title || '无标题' }}</div>
          <div class="nt-note-content" v-html="renderMarkdown(n.content)"></div>
          <div class="nt-actions">
            <span class="nt-date">{{ formatDateTime(n.updated_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <NoteViewerModal
      v-if="viewer"
      :note="viewer"
      @close="viewer = null"
      @saved="onViewerSaved"
      @deleted="onViewerDeleted"
      @notify="(m, t) => emit('notify', m, t)"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { api, formatDateTime, todayStr } from '../../api'
import MarkdownEditor from '../../ui/MarkdownEditor.vue'
import { renderMarkdown } from '../../ui/markdown'
import SelectPicker from './SelectPicker.vue'
import NoteViewerModal from './NoteViewerModal.vue'

const emit = defineEmits(['notify'])
const notes = ref([])
const companies = ref([])
const q = ref('')
const filterCompany = ref([])
const filterPosition = ref([])
const filterMilestone = ref([])
const groupBy = ref('company')
const showNew = ref(false)
const savingNew = ref(false)
const viewer = ref(null)
const titleAuto = ref(true)
const newDraft = reactive({
  companyId: '',
  applicationId: '',
  milestoneId: '',
  title: '',
  content: '',
})

const groupOptions = [
  { value: 'company', label: '按公司查看' },
  { value: 'position', label: '按岗位查看' },
  { value: 'milestone', label: '按节点查看' },
  { value: 'none', label: '不分组' },
]

// 求职流程的节点顺序：投递 → 笔试 → 群面 → 一面 → 二面 → 三面 → 四面/终面 → HR面 → 背调 → Offer
const MILESTONE_RANK = [
  { k: '投递', r: 10 },
  { k: '内推', r: 10 },
  { k: '网申', r: 10 },
  { k: '申请', r: 10 },
  { k: '笔试', r: 20 },
  { k: '机试', r: 20 },
  { k: '测评', r: 20 },
  { k: '群面', r: 30 },
  { k: '一面', r: 40 },
  { k: '初面', r: 40 },
  { k: '首面', r: 40 },
  { k: '二面', r: 50 },
  { k: '复面', r: 50 },
  { k: '三面', r: 60 },
  { k: '四面', r: 70 },
  { k: '终面', r: 70 },
  { k: '主管面', r: 70 },
  { k: 'hr面', r: 80 },
  { k: '背调', r: 90 },
  { k: 'offer', r: 100 },
  { k: '淘汰', r: 110 },
  { k: '未通过', r: 110 },
  { k: '拒绝', r: 110 },
]

function milestoneRank(name) {
  const n = String(name || '').toLowerCase()
  for (const { k, r } of MILESTONE_RANK) {
    if (n.includes(k)) return r
  }
  return 200
}

onMounted(load)

async function load() {
  notes.value = await api('/api/recruitment/notes')
  companies.value = await api('/api/recruitment/companies')
}

async function exportNotes() {
  try {
    const data = await api('/api/recruitment/notes/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `秋招笔记-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    emit('notify', '已导出笔记 JSON')
  } catch (e) {
    emit('notify', `导出失败：${e.message}`, 'error')
  }
}

async function importNotes(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data || !Array.isArray(data.notes)) {
      throw new Error('文件不是有效的笔记备份')
    }
    const r = await api('/api/recruitment/notes/import', {
      method: 'POST',
      body: { notes: data.notes },
    })
    emit('notify', `导入完成：新增 ${r.imported} 条，跳过 ${r.skipped} 条`)
    await load()
  } catch (err) {
    emit('notify', `导入失败：${err.message}`, 'error')
  }
}

const uniqSorted = (arr) =>
  [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'))

const companyFilterOptions = computed(() => [
  ...uniqSorted(notes.value.map((n) => n.company_name)).map((v) => ({ value: v, label: v })),
])
const positionFilterOptions = computed(() => [
  ...uniqSorted(notes.value.map((n) => n.company_position)).map((v) => ({ value: v, label: v })),
])
const milestoneFilterOptions = computed(() => [
  ...uniqSorted(notes.value.map((n) => n.milestone_name)).map((v) => ({ value: v, label: v })),
])

const companyOptions = computed(() =>
  companies.value.map((c) => ({ value: c.id, label: c.name }))
)
const appOptions = computed(() => {
  const c = companies.value.find((x) => x.id === newDraft.companyId)
  return (c ? c.applications : []).map((a) => ({
    value: a.id,
    label: a.position || '未填写岗位',
  }))
})
const milestoneOptions = computed(() => {
  const c = companies.value.find((x) => x.id === newDraft.companyId)
  const a = c && c.applications.find((x) => x.id === newDraft.applicationId)
  return [
    { value: '', label: '不关联节点' },
    ...(a ? a.milestones : []).map((m) => ({ value: m.id, label: m.name })),
  ]
})

watch(
  () => newDraft.companyId,
  () => {
    newDraft.applicationId = ''
    newDraft.milestoneId = ''
  }
)
watch(
  () => newDraft.applicationId,
  () => {
    newDraft.milestoneId = ''
  }
)
watch(
  () => [newDraft.companyId, newDraft.applicationId, newDraft.milestoneId],
  generateTitle
)

function generateTitle() {
  if (!titleAuto.value) return
  const c = companies.value.find((x) => x.id === newDraft.companyId)
  const a = c && c.applications.find((x) => x.id === newDraft.applicationId)
  const m = a && a.milestones.find((x) => x.id === newDraft.milestoneId)
  const parts = [c && c.name, a && a.position, m && m.name].filter(Boolean)
  newDraft.title = parts.length ? `${parts.join('-')}笔记` : ''
}

function closeNew() {
  showNew.value = false
  titleAuto.value = true
  Object.assign(newDraft, {
    companyId: '',
    applicationId: '',
    milestoneId: '',
    title: '',
    content: '',
  })
}

const filtered = computed(() => {
  let list = notes.value
  const c = filterCompany.value.filter(Boolean)
  const p = filterPosition.value.filter(Boolean)
  const m = filterMilestone.value.filter(Boolean)
  if (c.length) list = list.filter((n) => c.includes(n.company_name))
  if (p.length) list = list.filter((n) => p.includes(n.company_position))
  if (m.length) list = list.filter((n) => m.includes(n.milestone_name))
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase()
    list = list.filter((n) =>
      [n.title, n.content.replace(/<[^>]*>/g, ' '), n.company_name, n.company_position, n.milestone_name]
        .join(' ')
        .toLowerCase()
        .includes(k)
    )
  }
  return list
})

const grouped = computed(() => {
  const list = filtered.value
  if (groupBy.value === 'none') return [{ tag: '', notes: list }]

  const keyOf = (n) => {
    if (groupBy.value === 'company') return n.company_name || '未关联公司'
    if (groupBy.value === 'position') return `${n.company_name || '未知公司'} · ${n.company_position || '未填写岗位'}`
    return n.milestone_name || '无节点'
  }
  const map = new Map()
  for (const n of list) {
    const k = keyOf(n)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(n)
  }
  const groups = [...map.entries()].map(([tag, notes]) => ({ tag, notes }))
  if (groupBy.value === 'milestone') {
    groups.sort(
      (a, b) => milestoneRank(a.tag) - milestoneRank(b.tag) || a.tag.localeCompare(b.tag, 'zh')
    )
  }
  return groups
})

function openViewer(n) {
  viewer.value = n
}

async function onViewerSaved() {
  viewer.value = null
  emit('notify', '笔记已更新')
  await load()
}

async function onViewerDeleted() {
  viewer.value = null
  emit('notify', '笔记已删除')
  await load()
}

async function saveNew() {
  if (!newDraft.applicationId) {
    emit('notify', '请先选择公司和岗位')
    return
  }
  if (!newDraft.title.trim() && !newDraft.content.trim()) {
    emit('notify', '标题和内容不能都为空')
    return
  }
  savingNew.value = true
  try {
    await api(`/api/recruitment/notes/applications/${newDraft.applicationId}/notes`, {
      method: 'POST',
      body: {
        milestone_id: newDraft.milestoneId || null,
        title: newDraft.title.trim(),
        content: newDraft.content,
      },
    })
    emit('notify', '笔记已保存')
    showNew.value = false
    titleAuto.value = true
    Object.assign(newDraft, {
      companyId: '',
      applicationId: '',
      milestoneId: '',
      title: '',
      content: '',
    })
    await load()
  } catch (e) {
    emit('notify', e.message, 'error')
  } finally {
    savingNew.value = false
  }
}

</script>

<style scoped>
.nt-toolbar-card { padding: 14px 16px; margin-bottom: 16px; }
.nt-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.nt-filter { flex: none; width: 132px; }
.nt-search { width: 200px; }
.nt-count { font-size: 12.5px; color: var(--tk-faint); white-space: nowrap; }
.nt-group-picker { flex: none; width: 124px; }
.nt-new-card {
  padding: 16px;
  margin-bottom: 16px;
  display: grid;
  gap: 12px;
}
.nt-new-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px 14px;
}
.nt-new-grid .tk-field { min-width: 0; }
.nt-new-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nt-group { margin-bottom: 20px; }
.nt-group-title {
  font-size: 14px;
  font-weight: 700;
  color: #4a90d9;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.nt-group-title.plain { color: var(--tk-text); }
.nt-group-title span {
  background: #e8f0fb;
  border-radius: 10px;
  padding: 0 8px;
  font-size: 11px;
  color: #4a90d9;
}
.nt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.nt-note {
  padding: 14px 16px;
  display: grid;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.nt-note:hover {
  border-color: #bcd0f2;
  box-shadow: var(--tk-shadow-md);
  transform: translateY(-1px);
}
.nt-note-head { display: flex; align-items: center; gap: 6px; }
.nt-company { font-size: 12px; font-weight: 700; color: #111827; }
.nt-milestone {
  font-size: 11px;
  background: #fef3c7;
  color: #b45309;
  border-radius: 6px;
  padding: 1px 8px;
}
.nt-position {
  font-size: 11px;
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  border-radius: 6px;
  padding: 1px 8px;
}
.nt-note-title { font-size: 14px; font-weight: 700; color: #1f2937; }
.nt-note-content {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.65;
  max-height: 96px;
  overflow: hidden;
  position: relative;
  word-break: break-word;
}
.nt-note-content::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 28px;
  background: linear-gradient(transparent, #fff);
}
.nt-note-content :deep(p) { margin: 4px 0; }
.nt-note-content :deep(h1),
.nt-note-content :deep(h2),
.nt-note-content :deep(h3),
.nt-note-content :deep(h4),
.nt-note-content :deep(h5),
.nt-note-content :deep(h6) { margin: 8px 0 4px; color: #1f2937; }
.nt-note-content :deep(h1) { font-size: 16px; }
.nt-note-content :deep(h2) { font-size: 15px; }
.nt-note-content :deep(h3) { font-size: 14px; }
.nt-note-content :deep(h4) { font-size: 13.5px; }
.nt-note-content :deep(h5) { font-size: 13px; }
.nt-note-content :deep(h6) { font-size: 13px; color: var(--tk-muted); }
.nt-note-content :deep(ul),
.nt-note-content :deep(ol) { padding-left: 20px; margin: 4px 0; }
.nt-note-content :deep(ol) { list-style: decimal; }
.nt-note-content :deep(ul) { list-style: disc; }
.nt-note-content :deep(li) { margin: 2px 0; }
.nt-note-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--tk-border);
  margin: 10px 0;
}
.nt-note-content :deep(.md-task) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.nt-note-content :deep(.md-task input) {
  margin: 0;
  accent-color: var(--tk-blue);
}
.nt-note-content :deep(a) { color: var(--tk-blue); }
.nt-note-content :deep(code) {
  background: #f0f3f8;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
.nt-note-content :deep(pre) {
  background: #f6f8fb;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 6px 0;
}
.nt-note-content :deep(pre code) { background: transparent; padding: 0; }
.nt-note-content :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--tk-blue);
  color: var(--tk-muted);
  background: #f8fafd;
  border-radius: 0 6px 6px 0;
}
.nt-note-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12.5px;
}
.nt-note-content :deep(th),
.nt-note-content :deep(td) {
  border: 1px solid var(--tk-border);
  padding: 5px 9px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}
.nt-note-content :deep(th) {
  background: #f3f6fb;
  color: #1f2937;
  font-weight: 600;
  white-space: nowrap;
}
.nt-note-content :deep(tbody tr:nth-child(even) td) { background: #fafbfd; }
.nt-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.nt-date { font-size: 11px; color: #b0b7c2; }

@media (max-width: 700px) {
  .nt-search { width: 100%; }
}
</style>
