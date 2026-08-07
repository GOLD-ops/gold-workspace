<template>
  <div>
    <!-- 上传区 -->
    <div
      class="lt-card lt-upload"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <div class="lt-upload-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <p class="lt-upload-title">拖拽文献到这里，或点击选择文件</p>
      <p class="lt-upload-hint">支持 PDF / txt / md，单篇不超过 20MB，可批量上传；扫描版 PDF 会自动 OCR 识别</p>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".pdf,.txt,.md,.markdown"
        style="display: none"
        @change="onPick"
      />
      <button class="lt-btn lt-btn-primary lt-btn-sm" @click="fileInput.click()" :disabled="uploading">
        {{ uploading ? '上传中…' : '选择文件' }}
      </button>
    </div>

    <!-- 分析字段配置（与列表同页） -->
    <LiteratureFields @notify="notify" />

    <!-- 工具栏 -->
    <div class="lt-card lt-list-card">
      <div class="lt-toolbar lt-list-toolbar">
        <input v-model="q" class="lt-input lt-search" placeholder="搜索文件名…" />
        <span style="flex: 1"></span>
        <button class="lt-btn lt-btn-primary lt-btn-sm" :disabled="!selectedIds.length || analyzing" @click="startAnalysis">
          {{ analyzing ? '分析中…' : `开始分析${selectedIds.length ? '（' + selectedIds.length + '）' : ''}` }}
        </button>
        <button
          class="lt-btn lt-btn-danger lt-btn-sm"
          :disabled="!selectedIds.length"
          @click="removeSelected"
        >
          删除选中{{ selectedIds.length ? '（' + selectedIds.length + '）' : '' }}
        </button>
        <button class="lt-btn lt-btn-sm" :disabled="!papers.length" @click="showExport = true">导出</button>
      </div>

      <!-- 分析进度 -->
      <div v-if="progress.total" class="lt-progress">
        <div class="lt-progress-bar">
          <div
            class="lt-progress-fill"
            :style="{ width: progressPct + '%' }"
          ></div>
        </div>
        <span class="lt-progress-text">
          分析进度 {{ progress.done + progress.failed }} / {{ progress.total }}（失败 {{ progress.failed }}）
        </span>
      </div>

      <!-- 列表 -->
      <div v-if="!filtered.length && !uploadQueue.length" class="lt-empty">
        {{ papers.length ? '没有匹配的文献' : '还没有文献，先上传一批 PDF 吧' }}
      </div>
      <div v-else class="lt-table">
        <div class="lt-row lt-row-head">
          <span class="lt-check">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="someSelected"
              @change="toggleAll"
            />
          </span>
          <span>文件名</span>
          <span>正文状态</span>
          <span>分析状态</span>
          <span>操作</span>
        </div>
        <div class="lt-row lt-row-uploading" v-for="item in uploadQueue" :key="'up-' + item.key">
          <span class="lt-check">
            <input type="checkbox" disabled />
          </span>
          <div class="lt-name">
            <div class="lt-filename" :title="item.name">{{ item.name }}</div>
            <div class="lt-filesize">
              <template v-if="item.state === 'pending'">等待上传</template>
              <template v-else-if="item.state === 'uploading'">上传中 {{ item.progress }}%</template>
              <template v-else-if="item.state === 'done'">上传完成</template>
              <template v-else>上传失败：{{ item.error }}</template>
            </div>
          </div>
          <span>
            <span v-if="item.state === 'uploading'" class="lt-uploading-cell">
              <span class="lt-uploading-bar">
                <span :style="{ width: item.progress + '%' }"></span>
              </span>
            </span>
            <span v-else-if="item.state === 'done'" class="lt-badge lt-st-done">✓ 已上传</span>
            <span v-else-if="item.state === 'error'" class="lt-badge lt-st-error">失败</span>
            <span v-else class="lt-badge lt-ts-pending">等待中</span>
          </span>
          <span class="lt-faint">—</span>
          <span class="lt-actions"></span>
        </div>
        <div class="lt-row" v-for="p in filtered" :key="p.id">
          <span class="lt-check">
            <input type="checkbox" :checked="selectedIds.includes(p.id)" @change="toggle(p.id)" />
          </span>
          <div class="lt-name">
            <div class="lt-filename" :title="p.filename">{{ p.filename }}</div>
            <div class="lt-filesize">{{ formatSize(p.file_size) }} · {{ p.created_at.slice(0, 10) }}</div>
          </div>
          <span>
            <span class="lt-badge" :class="'lt-ts-' + p.text_status">{{ textStatusLabel(p.text_status) }}</span>
            <span v-if="p.error" class="lt-error-tip" :title="p.error">⚠</span>
          </span>
          <span>
            <span class="lt-badge" :class="'lt-st-' + p.status">{{ statusLabel(p.status) }}</span>
          </span>
          <span class="lt-actions">
            <button class="lt-btn lt-btn-sm" @click="openPaper(p)">查看/编辑</button>
            <button class="lt-btn lt-btn-danger lt-btn-sm" @click="remove(p)">删除</button>
          </span>
        </div>
      </div>
    </div>

    <PaperModal v-if="editing" :paper="editing" @close="editing = null" @saved="reload" @notify="notify" />

    <!-- 导出格式选择 -->
    <div v-if="showExport" class="lt-modal-overlay" @click.self="showExport = false">
      <div class="lt-modal lt-export-modal">
        <div class="lt-modal-header">
          <h3>导出分析结果</h3>
          <button class="lt-modal-close" @click="showExport = false">✕</button>
        </div>
        <div class="lt-modal-body">
          <div class="lt-export-options">
            <button class="lt-export-option" @click="doExport('xlsx')">
              <span class="lt-export-name">Excel 表格</span>
              <span class="lt-export-sub">适合表格整理与分享</span>
            </button>
            <button class="lt-export-option" @click="doExport('json')">
              <span class="lt-export-name">JSON 备份</span>
              <span class="lt-export-sub">适合数据备份与迁移</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, getToken, getGuestToken } from '../../api'
import PaperModal from './PaperModal.vue'
import LiteratureFields from './LiteratureFields.vue'

const emit = defineEmits(['notify'])
const papers = ref([])
const q = ref('')
const selectedIds = ref([])
const editing = ref(null)
const showExport = ref(false)
const uploading = ref(false)
const dragging = ref(false)
const fileInput = ref(null)
const progress = ref({ total: 0, done: 0, failed: 0, queued: 0, running: false })
const uploadQueue = ref([])
const UPLOAD_CONCURRENCY = 3
let pollTimer = null
let lastProgressKey = ''

const filtered = computed(() => {
  let list = papers.value
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase()
    list = list.filter((p) => p.filename.toLowerCase().includes(k))
  }
  return list
})
const allSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((p) => selectedIds.value.includes(p.id))
)
const someSelected = computed(() => selectedIds.value.length > 0 && !allSelected.value)
const analyzing = computed(() => progress.value.running || progress.value.queued > 0)
const progressPct = computed(() =>
  progress.value.total ? Math.min(100, Math.round(((progress.value.done + progress.value.failed) / progress.value.total) * 100)) : 0
)

onMounted(() => {
  reload()
  pollTimer = setInterval(pollStatus, 2000)
})
onBeforeUnmount(() => clearInterval(pollTimer))

async function reload() {
  papers.value = await api('/api/literature/papers')
  pollStatus()
}

async function pollStatus() {
  try {
    const p = await api('/api/literature/analysis/status')
    progress.value = p
    // 分析进度有变化时，同步刷新列表，保证「分析状态」列实时更新
    const key = `${p.total}|${p.done}|${p.failed}|${p.queued}|${p.running}`
    if (key !== lastProgressKey) {
      lastProgressKey = key
      papers.value = await api('/api/literature/papers')
    }
  } catch {
    // 忽略
  }
}

function formatSize(n) {
  if (!n) return ''
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n > 1024) return Math.round(n / 1024) + ' KB'
  return n + ' B'
}

function textStatusLabel(s) {
  return { pending: '提取中', text: '已提取', ocr: 'OCR 识别', failed: '提取失败' }[s] || s
}
function statusLabel(s) {
  return { pending: '待分析', analyzing: '分析中', done: '已完成', error: '失败' }[s] || s
}

function uploadOne(item) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('files', item.file)
    xhr.open('POST', '/api/literature/papers/upload')
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    else xhr.setRequestHeader('X-Space-Token', getGuestToken())
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) item.progress = Math.round((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data.error || '上传失败'))
      } catch {
        reject(new Error('上传失败'))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.ontimeout = () => reject(new Error('上传超时'))
    xhr.timeout = 300000
    xhr.send(fd)
  })
}

async function uploadFiles(fileList) {
  const files = Array.from(fileList || [])
  if (!files.length) return
  uploading.value = true
  uploadQueue.value = files.map((f, i) => ({
    key: i,
    file: f,
    name: f.name,
    size: f.size,
    state: 'pending',
    progress: 0,
    error: '',
  }))

  let ok = 0
  let fail = 0
  let next = 0

  async function worker() {
    while (next < uploadQueue.value.length) {
      const i = next++
      const item = uploadQueue.value[i]
      item.state = 'uploading'
      try {
        await uploadOne(item)
        item.state = 'done'
        ok++
      } catch (e) {
        item.state = 'error'
        item.error = e.message || '上传失败'
        fail++
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, uploadQueue.value.length) },
    worker
  )
  await Promise.all(workers)

  uploading.value = false
  emit('notify', `上传完成：成功 ${ok} 篇${fail ? `，失败 ${fail} 篇` : ''}`)
  await reload()

  // 全部成功时短暂展示后收起进度面板
  if (!fail) {
    setTimeout(() => (uploadQueue.value = []), 2500)
  }
}

function onPick(e) {
  uploadFiles(e.target.files)
  e.target.value = ''
}

function onDrop(e) {
  dragging.value = false
  uploadFiles(e.dataTransfer.files)
}

function toggle(id) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((x) => x !== id)
    : [...selectedIds.value, id]
}

function toggleAll(e) {
  if (e.target.checked) selectedIds.value = filtered.value.map((p) => p.id)
  else selectedIds.value = []
}

async function startAnalysis() {
  if (!selectedIds.value.length) return
  try {
    const r = await api('/api/literature/analysis/start', {
      method: 'POST',
      body: { paper_ids: selectedIds.value },
    })
    emit('notify', `已加入分析队列 ${r.queued} 篇`)
    await reload()
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}

async function remove(p) {
  if (!window.confirm(`确定删除「${p.filename}」及其分析结果？`)) return
  await api(`/api/literature/papers/${p.id}`, { method: 'DELETE' })
  selectedIds.value = selectedIds.value.filter((x) => x !== p.id)
  emit('notify', '已删除')
  await reload()
}

async function removeSelected() {
  const ids = selectedIds.value
  if (!ids.length) return
  if (!window.confirm(`确定删除选中的 ${ids.length} 篇文献及其分析结果？`)) return
  try {
    await Promise.all(ids.map((id) => api(`/api/literature/papers/${id}`, { method: 'DELETE' })))
    selectedIds.value = []
    emit('notify', `已删除 ${ids.length} 篇文献`)
    await reload()
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}

function openPaper(p) {
  editing.value = p
}

async function downloadBlob(path) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token
  else headers['X-Space-Token'] = getGuestToken()
  const res = await fetch(path, { headers })
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = path.includes('xlsx') ? '文献分析结果.xlsx' : '文献分析结果.json'
  a.click()
  URL.revokeObjectURL(a.href)
}

async function doExport(format) {
  showExport.value = false
  try {
    await downloadBlob(`/api/literature/export?format=${format}`)
    emit('notify', format === 'xlsx' ? 'Excel 已导出' : 'JSON 已导出')
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}
</script>

<style scoped>
.lt-upload {
  padding: 26px 20px;
  text-align: center;
  margin-bottom: 16px;
  border: 1.5px dashed #c6d7f0;
  background: linear-gradient(180deg, #f5f9fe 0%, #fbfcfe 100%);
  transition: all 0.18s ease;
}
.lt-upload.dragging {
  border-color: var(--tk-blue);
  background: #eef4fd;
  transform: scale(1.005);
}
.lt-upload-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
  box-shadow: 0 4px 12px rgba(61, 110, 224, 0.12);
}
.lt-upload-title { font-size: 15px; font-weight: 700; margin: 0 0 5px; color: var(--tk-text); }
.lt-upload-hint { font-size: 12px; color: var(--tk-faint); margin: 0 0 14px; }
.lt-list-card { overflow: hidden; }
.lt-list-toolbar { padding: 14px 16px 0; }
.lt-search { width: 260px; flex: none; }
.lt-row-uploading { background: #f7faff; }
.lt-row-uploading:hover { background: #f2f7ff; }
.lt-uploading-cell {
  display: inline-flex;
  align-items: center;
  width: 76px;
  height: 14px;
}
.lt-uploading-bar {
  width: 100%;
  height: 6px;
  background: #e4eaf4;
  border-radius: 3px;
  overflow: hidden;
}
.lt-uploading-bar span {
  display: block;
  height: 100%;
  background: var(--tk-blue);
  border-radius: 3px;
  transition: width 0.2s ease;
}
.lt-faint { color: var(--tk-faint); }
.lt-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 12px;
}
.lt-progress-bar {
  flex: 1;
  height: 8px;
  background: #eef1f6;
  border-radius: 4px;
  overflow: hidden;
}
.lt-progress-fill {
  height: 100%;
  background: var(--tk-blue);
  border-radius: 4px;
  transition: width 0.3s ease;
}
.lt-progress-text { font-size: 12px; color: var(--tk-muted); white-space: nowrap; }
.lt-table { border-top: 1px solid #edf0f5; }
.lt-row {
  display: grid;
  grid-template-columns: 34px minmax(220px, 1.6fr) 110px 110px 170px;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #edf0f5;
  transition: background 0.15s ease;
}
.lt-row:last-child { border-bottom: none; }
.lt-row:hover { background: #f8fafd; }
.lt-row-head {
  font-size: 12px;
  color: var(--tk-faint);
  background: #fafbfd;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.lt-check input { width: 15px; height: 15px; accent-color: var(--tk-blue); cursor: pointer; }
.lt-filename {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--tk-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lt-filesize { font-size: 11.5px; color: var(--tk-faint); margin-top: 2px; }
.lt-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}
.lt-ts-pending { background: #f1f5f9; color: #64748b; }
.lt-ts-text { background: #e8f5ee; color: #0e9f6e; }
.lt-ts-ocr { background: #fdf3e0; color: #b45309; }
.lt-ts-failed { background: #fee2e2; color: #dc2626; }
.lt-st-pending { background: #f1f5f9; color: #64748b; }
.lt-st-analyzing { background: #e0edfc; color: #1d4ed8; }
.lt-st-done { background: #e8f5ee; color: #0e9f6e; }
.lt-st-error { background: #fee2e2; color: #dc2626; }
.lt-error-tip { margin-left: 4px; color: #dc2626; cursor: help; }
.lt-actions { display: flex; gap: 6px; }
.lt-export-modal { max-width: 420px; }
.lt-export-options { display: grid; gap: 10px; }
.lt-export-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  border: 1px solid var(--tk-border);
  background: #fff;
  border-radius: 12px;
  padding: 14px 18px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  font-family: inherit;
}
.lt-export-option:hover { border-color: var(--tk-blue); background: #f7faff; transform: translateY(-1px); }
.lt-export-name { font-size: 14px; font-weight: 700; color: var(--tk-text); }
.lt-export-sub { font-size: 12px; color: var(--tk-faint); }
@media (max-width: 700px) {
  .lt-row {
    grid-template-columns: 30px minmax(0, 1fr);
    grid-template-areas:
      'check name'
      'check status'
      'check actions';
    row-gap: 6px;
  }
  .lt-row-head { display: none; }
  .lt-check { grid-area: check; }
  .lt-name { grid-area: name; }
  .lt-row > span:nth-of-type(3) { grid-area: status; }
  .lt-row > span:nth-of-type(4) { display: none; }
  .lt-actions { grid-area: actions; }
}
</style>
