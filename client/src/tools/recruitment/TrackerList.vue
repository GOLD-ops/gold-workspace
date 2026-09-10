<template>
  <div>
    <div class="tk-card tl-panel">
      <div class="tl-toolbar-area">
        <div class="tk-toolbar">
          <input
            v-model="q"
            class="tk-input tl-search"
            placeholder="搜索公司 / 岗位 / 城市 / 备注…"
          />
          <SelectPicker v-model="sortBy" :options="sortOptions" class="tl-sort-picker" />
          <span style="flex: 1"></span>
          <button class="tk-btn tk-btn-sm" @click="showExport = true">导出</button>
          <label class="tk-btn tk-btn-sm" style="cursor: pointer">
            导入
            <input
              type="file"
              accept=".json,.xlsx,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style="display: none"
              @change="importFile"
            />
          </label>
          <button class="tk-btn tk-btn-primary" @click="$emit('open-company', null)">新增公司</button>
        </div>
        <div class="tl-chips">
          <button class="tk-chip" :class="{ active: statusFilter === '' }" @click="statusFilter = ''">
            全部 {{ totalApps }}
          </button>
          <button
            class="tk-chip"
            :class="{ active: statusFilter === s }"
            v-for="s in STATUSES"
            :key="s"
            @click="statusFilter = s"
          >
            {{ s }} {{ countBy[s] || 0 }}
          </button>
        </div>
      </div>

      <div v-if="!filtered.length" class="tk-empty">
        {{ companies.length ? '没有符合条件的记录' : '还没有公司，点击「新增公司」开始记录吧' }}
      </div>

      <div v-else class="tl-table">
        <div class="tk-row tk-row-head tl-head">
          <span>公司</span>
          <span>内推码</span>
          <span>操作</span>
        </div>

        <div v-for="c in filtered" :key="c.id" class="tl-company-block">
          <!-- 公司行 -->
          <div class="tk-row tl-company-row" @click="toggleExpand(c.id)">
            <div class="tl-cell-main">
              <div class="tl-company-line">
                <span class="tl-expand-arrow">{{ expanded.has(c.id) ? '▾' : '▸' }}</span>
                <span class="tl-company">{{ c.name }}</span>
                <button
                  v-if="isAdmin"
                  type="button"
                  class="tl-pub"
                  :class="{ on: c.published }"
                  :title="
                    c.published
                      ? '已发布给所有用户；点击取消发布（已同步用户保留该公司）'
                      : '发布后所有用户首页均可看到该公司'
                  "
                  @click.stop="togglePublish(c)"
                >
                  {{ c.published ? '已发布' : '发布' }}
                </button>
                <span class="tl-app-count">{{ c.applications.length }} 个投递</span>
              </div>
              <div v-if="c.notes" class="tl-sub">{{ c.notes }}</div>
            </div>
            <div class="tl-cell-code">
              <span v-if="c.referral_code" class="tl-code" @click.stop="copyReferral(c)">{{ c.referral_code }}</span>
              <span v-else class="tl-none">—</span>
            </div>
            <div class="tl-actions">
              <button
                class="tk-btn tk-btn-icon tl-apply-btn"
                :disabled="!c.link"
                :title="c.link ? '打开公司招聘官网' : '未填写投递链接'"
                @click.stop="applyCompany(c)"
              >
                {{ c.applications.length ? '查看进度' : '官网投递' }}
              </button>
              <button class="tk-btn tk-btn-icon" @click.stop="$emit('add-application', c.id)">新增投递</button>
              <button class="tk-btn tk-btn-icon" @click.stop="$emit('open-company', c)">编辑</button>
              <button class="tk-btn tk-btn-danger tk-btn-icon" @click.stop="removeCompany(c)">删除</button>
            </div>
          </div>

          <!-- 投递展开区 -->
          <div v-if="expanded.has(c.id)" class="tl-app-area">
            <div v-if="!c.applications.length" class="tl-no-apps">
              暂无投递记录，点击
              <span class="tl-noapps-link" @click="$emit('add-application', c.id)">「新增投递」</span>
              记录第一个岗位。
            </div>
            <div v-for="a in c.applications" :key="a.id" class="tl-app-row">
              <div class="tl-app-head">
                <div class="tl-app-head-info">
                  <span class="tl-position">{{ a.position || '未填写岗位' }}</span>
                  <span
                    class="tk-badge tl-priority"
                    :style="{
                      background: PRIORITY_COLORS[a.priority].bg,
                      color: PRIORITY_COLORS[a.priority].color,
                    }"
                    >{{ a.priority }}</span
                  >
                  <span class="tk-badge tl-status" :style="statusStyle(a.status)">
                    {{ a.status }}
                  </span>
                  <span v-if="a.city" class="tl-meta-chip">{{ a.city }}</span>
                  <span v-if="a.department" class="tl-meta-chip">{{ a.department }}</span>
                  <span v-if="a.salary" class="tl-meta-chip">{{ a.salary }}</span>
                </div>
                <div class="tl-app-actions">
                  <button class="tk-btn tk-btn-icon tl-view-btn" @click="$emit('open-application', a)">
                    编辑
                  </button>
                  <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeApplication(a)">删除</button>
                </div>
              </div>
              <div v-if="a.notes" class="tl-app-notes">
                {{ a.notes }}
              </div>
              <div class="tl-app-timeline">
                <div v-if="a.milestones.length" class="tl-track">
                  <template v-for="(m, i) in a.milestones" :key="m.id">
                    <span
                      class="tl-node"
                      :class="{ done: i < currentIdx(a), current: m.name === a.current_stage }"
                      :title="`${m.name} ${m.date || ''}`"
                    >
                      <i class="tl-dot" :style="m.result && m.result !== 'none' ? { background: RESULT_COLORS[m.result].color } : {}"></i>
                      <span class="tl-label">{{ m.name }}</span>
                      <em v-if="m.result && m.result !== 'none'" class="tl-result" :style="resultStyle(m.result)">{{ resultLabel(m.result) }}</em>
                    <em v-if="m.date" class="tl-date">{{ fmtMilestoneDate(m.date) }}</em>
                    </span>
                    <i v-if="i < a.milestones.length - 1" class="tl-link"></i>
                  </template>
                </div>
                <span v-else class="tl-none">尚无进展节点</span>
              </div>
              <div v-if="a.requirements" class="tl-app-req">
                <div class="tl-app-req-title">职位描述</div>
                <div class="tl-app-req-body">{{ a.requirements }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 导入方式选择 -->
    <div v-if="pendingImport" class="tk-modal-overlay">
      <div class="tk-modal tl-import-modal">
        <div class="tk-modal-header">
          <h3>选择导入方式</h3>
          <button class="tk-modal-close" @click="pendingImport = null">✕</button>
        </div>
        <div class="tk-modal-body">
          <p class="tl-import-file">
            文件：<strong>{{ pendingImport.name }}</strong>（{{ pendingImport.count }} 家公司{{
              pendingImport.apps ? `、${pendingImport.apps} 条投递` : ''
            }}）
          </p>
          <p v-if="pendingImport.skipped" class="tl-import-hint">
            已跳过 {{ pendingImport.skipped }} 行没有公司名称的数据。
          </p>
          <p class="tl-import-hint">请选择导入方式：</p>
          <div class="tl-import-options">
            <button class="tk-btn tk-btn-primary" @click="doImport('merge')">
              合并导入
              <span class="tl-import-sub">保留现有记录，相同公司合并，其余追加</span>
            </button>
            <button class="tk-btn tk-btn-danger" @click="doImport('overwrite')">
              完全覆盖
              <span class="tl-import-sub">删除现有全部记录，以文件内容替换（不可恢复）</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 导出方式选择 -->
    <div v-if="showExport" class="tk-modal-overlay">
      <div class="tk-modal tl-export-modal">
        <div class="tk-modal-header">
          <h3>选择导出方式</h3>
          <button class="tk-modal-close" @click="showExport = false">✕</button>
        </div>
        <div class="tk-modal-body">
          <div class="tl-export-options">
            <button class="tk-btn tk-btn-primary" @click="doExport('xlsx')">
              导出 Excel 表格
              <span class="tl-export-sub">按投递记录逐行整理，适合查看与分享</span>
            </button>
            <button class="tk-btn" @click="doExport('json')">
              导出 JSON 备份
              <span class="tl-export-sub">完整备份公司、投递、节点与笔记，可再导入</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  api,
  getToken,
  getGuestToken,
  getStoredUser,
  STATUSES,
  STATUS_COLORS,
  PRIORITY_COLORS,
  RESULT_COLORS,
  copyText,
  todayStr,
} from '../../api'
import { confirmDialog } from '../../ui/confirm'
import SelectPicker from './SelectPicker.vue'

const props = defineProps({ companies: { type: Array, default: () => [] } })
const emit = defineEmits([
  'open-company',
  'open-application',
  'add-application',
  'remove-company',
  'remove-application',
  'reload',
  'notify',
])

const q = ref('')
const statusFilter = ref('')
const sortBy = ref('updated')
const pendingImport = ref(null)
const showExport = ref(false)
const expanded = ref(new Set())
const isAdmin = computed(() => !!(getStoredUser() && getStoredUser().is_admin))
const sortOptions = [
  { value: 'updated', label: '按最近更新' },
  { value: 'priority', label: '按优先级' },
  { value: 'company', label: '按公司名' },
  { value: 'created', label: '按创建时间' },
]

const totalApps = computed(() =>
  props.companies.reduce((s, c) => s + (c.applications.length || 1), 0)
)
const countBy = computed(() => {
  const m = {}
  for (const c of props.companies) {
    if (!c.applications.length) m['未投递'] = (m['未投递'] || 0) + 1
    for (const a of c.applications) m[a.status] = (m[a.status] || 0) + 1
  }
  return m
})

const filtered = computed(() => {
  let list = props.companies
  if (statusFilter.value === '未投递') {
    // 未投递 = 还没有任何投递记录的公司；已有投递记录的不再进入该分类
    list = props.companies.filter((c) => !c.applications.length)
  } else if (statusFilter.value) {
    list = list
      .map((c) => ({ ...c, applications: c.applications.filter((a) => a.status === statusFilter.value) }))
      .filter((c) => c.applications.length)
  }
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase()
    list = list
      .map((c) => ({
        ...c,
        applications: c.applications.filter((a) =>
          [a.position, a.department, a.city, a.notes, a.requirements, c.name, c.notes, c.referral_code]
            .join(' ')
            .toLowerCase()
            .includes(k)
        ),
      }))
      .filter((c) =>
        statusFilter.value
          ? c.applications.length ||
            (statusFilter.value === '未投递' &&
              !c.applications.length &&
              [c.name, c.notes].join(' ').toLowerCase().includes(k))
          : c.applications.length || [c.name, c.notes].join(' ').toLowerCase().includes(k)
      )
  }
  const arr = [...list]
  if (sortBy.value === 'priority')
    arr.sort(
      (a, b) =>
        (b.applications.reduce((s, x) => s + x.priority_score, 0) || 0) -
        (a.applications.reduce((s, x) => s + x.priority_score, 0) || 0)
    )
  else if (sortBy.value === 'company') arr.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  else if (sortBy.value === 'created') arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  else arr.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return arr
})

function currentIdx(a) {
  return a.milestones.findIndex((m) => m.name === a.current_stage)
}
function toggleExpand(id) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}
function statusStyle(s) {
  return { background: STATUS_COLORS[s] + '1a', color: STATUS_COLORS[s] }
}
function resultLabel(r) {
  return { none: '待进行', waiting: '待进行', done: '待结果', pass: '通过', fail: '未通过' }[r] || ''
}
function resultStyle(r) {
  const c = RESULT_COLORS[r] || RESULT_COLORS.none
  return { color: c.color, background: c.bg }
}
function fmtMilestoneDate(d) {
  if (!d) return ''
  const s = String(d)
  const datePart = s.slice(0, 10)
  const timePart = s.includes('T') ? s.slice(11, 16) : ''
  const mm = datePart.slice(5)
  return timePart ? `${mm} ${timePart}` : mm
}

async function removeCompany(c) {
  const ok = await confirmDialog({
    title: '删除公司',
    message: `确定删除「${c.name}」吗？其下 ${c.applications.length} 个投递、节点与笔记会一并删除，不可恢复。`,
  })
  if (!ok) return
  emit('remove-company', c.id)
}

async function togglePublish(c) {
  const target = !c.published
  const ok = await confirmDialog({
    title: target ? '发布公司' : '取消发布',
    message: target
      ? `确定将「${c.name}」发布给所有用户吗？发布后各用户首页都会看到这家公司，同名公司资料将同步更新。`
      : `确定取消发布「${c.name}」吗？已同步给用户的记录会保留，仅影响后续新用户。`,
    confirmText: target ? '确定发布' : '确定取消',
  })
  if (!ok) return
  try {
    await api(`/api/recruitment/companies/${c.id}/publish`, {
      method: 'PATCH',
      body: { published: target ? 1 : 0 },
    })
    emit('reload')
    emit('notify', target ? `已发布「${c.name}」给所有用户` : `已取消发布「${c.name}」`)
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}

async function removeApplication(a) {
  const ok = await confirmDialog({
    title: '删除投递',
    message: `确定删除投递「${a.position || '未填写岗位'}」吗？相关节点与笔记会一并删除，不可恢复。`,
  })
  if (!ok) return
  emit('remove-application', a.id)
}

function applyCompany(c) {
  if (!c.link) return
  let url = String(c.link).trim()
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    url = 'https://' + url
  }
  window.open(url, '_blank', 'noopener')
}

async function copyReferral(c) {
  await copyText(c.referral_code)
  emit('notify', `已复制「${c.name}」的内推码`)
}

async function downloadBlob(path, filename) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token
  else headers['X-Space-Token'] = getGuestToken()
  const res = await fetch(path, { headers })
  if (!res.ok) throw new Error('导出失败，请稍后重试')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function doExport(format) {
  showExport.value = false
  try {
    const stamp = todayStr()
    if (format === 'xlsx') {
      await downloadBlob('/api/recruitment/companies/export/xlsx', `秋招追踪器-${stamp}.xlsx`)
      emit('notify', 'Excel 已导出')
      return
    }
    const data = await api('/api/recruitment/companies/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `秋招追踪器备份-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
    emit('notify', '已导出 JSON 备份')
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}

async function importFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    if (/\.xlsx$/i.test(file.name)) {
      const { data, summary } = await uploadXlsx(file)
      pendingImport.value = {
        name: file.name,
        count: summary.companies,
        apps: summary.applications,
        skipped: summary.skipped,
        data,
      }
      return
    }
    const data = JSON.parse(await file.text())
    if (!data || !Array.isArray(data.companies)) {
      throw new Error('文件不是有效的秋招追踪器备份')
    }
    pendingImport.value = { name: file.name, count: data.companies.length, data }
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}

async function uploadXlsx(file) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = 'Bearer ' + token
  else headers['X-Space-Token'] = getGuestToken()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch('/api/recruitment/companies/import/xlsx', {
    method: 'POST',
    headers,
    body: fd,
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Excel 解析失败')
  return out
}

async function doImport(mode) {
  const info = pendingImport.value
  pendingImport.value = null
  try {
    if (mode === 'overwrite') {
      const ok = await confirmDialog({
        title: '覆盖导入',
        message: `将以「${info.name}」中的内容替换当前全部记录，现有公司、投递、节点与笔记会被删除且不可恢复。确定继续吗？`,
        confirmText: '确定覆盖',
      })
      if (!ok) return
    }
    const r = await api('/api/recruitment/companies/import', {
      method: 'POST',
      body: { mode, data: info.data },
    })
    emit('reload')
    emit('notify', `导入完成：新增 ${r.imported} 家公司，合并 ${r.merged} 家，投递 ${r.appImported || 0} 条`)
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}
</script>

<style scoped>
.tl-panel { overflow: hidden; }
.tl-toolbar-area { padding: 16px 20px; border-bottom: 1px solid #edf0f5; }
.tl-search { width: 280px; flex: none; }
.tl-sort-picker { width: 140px; flex: none; }
.tl-sort-picker :deep(.sp-trigger) { height: 36px; }
.tl-chips { display: flex; gap: 10px; flex-wrap: wrap; }

.tl-table { overflow-x: auto; }
.tk-empty { padding: 56px 20px; }
.tk-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) 140px 250px;
  gap: 16px;
  align-items: center;
  padding: 14px 14px 14px 20px;
  border-bottom: 1px solid #edf0f5;
  transition: background 0.15s ease;
}
.tk-row:last-child { border-bottom: none; }
.tk-row:hover { background: #f8fafd; }
.tl-head {
  font-size: 12px;
  color: var(--tk-faint);
  background: #fafbfd;
  padding: 11px 14px 11px 20px;
  position: sticky;
  top: 0;
  z-index: 1;
  letter-spacing: 0.02em;
  font-weight: 600;
}
.tl-head > span:nth-child(3) {
  text-align: center;
}

/* 公司行 */
.tl-company-row {
  background: #fcfdff;
  cursor: pointer;
  user-select: none;
}
.tl-company-row:hover { background: #f2f6ff; }
.tl-expand-arrow {
  color: var(--tk-blue);
  font-size: 11px;
  width: 14px;
  text-align: center;
  flex: none;
}
.tl-company-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tl-company { font-size: 15px; font-weight: 700; color: var(--tk-text); letter-spacing: -0.2px; }
.tl-pub {
  border: 1px solid #cbd7ea;
  background: #f8fafd;
  color: #5d6878;
  font-size: 11px;
  line-height: 1;
  padding: 4px 9px;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tl-pub:hover {
  border-color: var(--tk-blue);
  color: var(--tk-blue);
  background: #fff;
}
.tl-pub.on {
  border-color: #bfe3cf;
  background: #e9f7ef;
  color: #0e9f6e;
}
.tl-pub.on:hover {
  border-color: #dc2626;
  color: #dc2626;
  background: #fef2f2;
}
.tl-app-count {
  font-size: 11px;
  color: var(--tk-blue);
  background: var(--tk-blue-soft);
  border-radius: 999px;
  padding: 2px 9px;
  font-weight: 600;
}
.tl-sub {
  font-size: 12px;
  color: var(--tk-faint);
  margin-top: 5px;
  line-height: 1.6;
  word-break: break-word;
}

/* 投递展开区 */
.tl-app-area {
  background: #f8fafd;
  border-bottom: 1px solid #edf0f5;
  padding: 10px 20px 14px 44px;
  display: grid;
  gap: 10px;
}
.tl-no-apps {
  font-size: 12.5px;
  color: var(--tk-faint);
  padding: 8px 4px;
}
.tl-noapps-link {
  color: var(--tk-blue);
  font-weight: 600;
  cursor: pointer;
}
.tl-noapps-link:hover { text-decoration: underline; }
.tl-app-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e7ebf2;
  border-radius: 12px;
  box-shadow: var(--tk-shadow-sm);
  transition: box-shadow 0.15s ease;
}
.tl-app-row:hover { box-shadow: var(--tk-shadow-md); }
.tl-app-notes {
  grid-column: 1 / -1;
  font-size: 12.5px;
  color: var(--tk-muted);
  line-height: 2;
  word-break: break-word;
}
.tl-app-timeline { grid-column: 1 / -1; }
.tl-app-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: none;
}
.tl-app-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.tl-app-head-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.tl-position { font-size: 13.5px; font-weight: 600; color: #2a3446; }
.tl-priority { flex: none; font-size: 11px; padding: 2px 9px; }
.tl-status { flex: none; font-size: 11px; padding: 2px 9px; }
.tl-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.tl-meta-chip {
  background: #f1f4f8;
  color: #5d6878;
  border-radius: 7px;
  padding: 2px 9px;
  font-size: 12px;
  white-space: nowrap;
}
.tl-app-req {
  grid-column: 1 / -1;
  padding: 10px 12px;
  background: #f8fafd;
  border: 1px solid #e5ebf5;
  border-radius: 8px;
}
.tl-app-req-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--tk-blue);
  margin-bottom: 5px;
}
.tl-app-req-body {
  font-size: 12.5px;
  color: #4a5568;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 节点时间线轨道 */
.tl-track { display: flex; align-items: center; flex-wrap: wrap; row-gap: 8px; }
.tl-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  margin: -3px 0;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.tl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #d7dce6;
  flex: none;
  transition: all 0.15s ease;
}
.tl-link {
  width: 16px;
  height: 2px;
  border-radius: 1px;
  background: #e2e7ef;
  margin: 0 2px;
  flex: none;
}
.tl-label { font-size: 12px; color: var(--tk-muted); white-space: nowrap; }
.tl-date { font-style: normal; font-size: 11px; color: var(--tk-faint); }
.tl-result {
  font-style: normal;
  font-size: 10.5px;
  border-radius: 999px;
  padding: 1px 7px;
  font-weight: 600;
  white-space: nowrap;
}
.tl-node.done .tl-dot { background: var(--tk-blue); }
.tl-node.done .tl-label { color: #3a4a63; }
.tl-node.current { background: var(--tk-blue-soft); }
.tl-node.current .tl-dot {
  background: var(--tk-blue);
  box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.16);
}
.tl-node.current .tl-label { color: var(--tk-blue); font-weight: 700; }
.tl-node.current .tl-date { color: var(--tk-blue); }

.tl-code {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  background: #fffaf0;
  color: #9a6700;
  border: 1px dashed #f0d9a8;
  border-radius: 7px;
  padding: 4px 10px;
  cursor: pointer;
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-all;
  line-height: 1.5;
  transition: background 0.15s ease;
}
.tl-code:hover { background: #fff3d6; }
.tl-none { color: #cbd5e1; font-size: 12px; }
.tl-actions { display: flex; gap: 6px; flex-wrap: nowrap; justify-content: flex-end; }
.tl-apply-btn { color: var(--tk-blue); border-color: #bcd0f2; background: #f7faff; }
.tl-apply-btn:hover { background: var(--tk-blue); border-color: var(--tk-blue); color: #fff; }
.tl-view-btn { color: var(--tk-blue); border-color: #bcd0f2; background: #fff; }
.tl-import-modal { max-width: 520px; }
.tl-export-modal { max-width: 460px; }
.tl-import-file { font-size: 13px; color: var(--tk-muted); margin-bottom: 16px; }
.tl-import-hint { font-size: 12px; color: var(--tk-faint); margin-bottom: 12px; }
.tl-import-options,
.tl-export-options { display: grid; gap: 10px; }
.tl-import-options .tk-btn,
.tl-export-options .tk-btn {
  justify-content: space-between;
  width: 100%;
  padding: 14px 18px;
  border-radius: 12px;
  flex-wrap: wrap;
}
.tl-import-sub,
.tl-export-sub {
  font-size: 11.5px;
  opacity: 0.75;
  font-weight: 400;
  width: 100%;
  text-align: left;
}

@media (max-width: 980px) {
  .tk-row {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'main' 'actions';
    row-gap: 10px;
    padding: 14px 16px;
  }
  .tk-row-head { display: none; }
  .tl-cell-main { grid-area: main; }
  .tk-row > div:nth-of-type(2) { display: none; } /* 内推码 */
  .tl-actions { grid-area: actions; }
  .tl-app-area { padding: 8px 16px 12px; }
  .tl-app-row { grid-template-columns: minmax(0, 1fr); row-gap: 8px; }
  .tl-app-timeline { order: 2; }
  .tl-app-actions { order: 3; }
}
</style>
