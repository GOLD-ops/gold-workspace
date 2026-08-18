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
          <select v-model="sortBy" class="tk-select">
            <option value="updated">按最近更新</option>
            <option value="priority">按优先级</option>
            <option value="company">按公司名</option>
            <option value="created">按创建时间</option>
          </select>
          <span style="flex: 1"></span>
          <button class="tk-btn tk-btn-sm" @click="exportData">导出</button>
          <label class="tk-btn tk-btn-sm" style="cursor: pointer">
            导入
            <input type="file" accept=".json,application/json" style="display: none" @change="importFile" />
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
                <span class="tl-app-count">{{ c.applications.length }} 个投递</span>
                <span v-if="c.channel" class="tl-meta-chip">{{ c.channel }}</span>
              </div>
              <div v-if="c.notes" class="tl-sub">{{ c.notes }}</div>
            </div>
            <div class="tl-cell-code">
              <span v-if="c.referral_code" class="tl-code" @click.stop="copyReferral(c)">{{ c.referral_code }}</span>
              <span v-else class="tl-none">—</span>
            </div>
            <div class="tl-actions" @click.stop>
              <button
                class="tk-btn tk-btn-icon tl-apply-btn"
                :disabled="!c.link"
                :title="c.link ? '前往官网投递' : '未填写投递链接'"
                @click="applyCompany(c)"
              >
                一键投递
              </button>
              <button class="tk-btn tk-btn-icon" @click="$emit('add-application', c.id)">添加投递</button>
              <button class="tk-btn tk-btn-icon" @click="$emit('open-company', c)">编辑</button>
              <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeCompany(c)">删除</button>
            </div>
          </div>

          <!-- 投递展开区 -->
          <div v-if="expanded.has(c.id)" class="tl-app-area">
            <div v-if="!c.applications.length" class="tl-no-apps">
              暂无投递记录，点击「添加投递」记录第一个岗位。
            </div>
            <div v-for="a in c.applications" :key="a.id" class="tl-app-row">
              <div class="tl-app-main">
                <div class="tl-position-line">
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
                </div>
                <div class="tl-meta">
                  <span v-if="a.department" class="tl-meta-chip">{{ a.department }}</span>
                  <span v-if="a.city" class="tl-meta-chip">{{ a.city }}</span>
                  <span v-if="a.salary" class="tl-meta-chip">{{ a.salary }}</span>
                </div>
                <div v-if="a.notes" class="tl-sub">{{ a.notes }}</div>
              </div>
              <div class="tl-app-timeline">
                <div v-if="a.milestones.length" class="tl-track">
                  <template v-for="(m, i) in a.milestones" :key="m.id">
                    <span
                      class="tl-node"
                      :class="{ done: i < currentIdx(a), current: m.name === a.current_stage }"
                      :title="`${m.name} ${m.date || ''}`"
                    >
                      <i class="tl-dot" :style="m.result !== 'none' ? { background: RESULT_COLORS[m.result].color } : {}"></i>
                      <span class="tl-label">{{ m.name }}</span>
                      <em v-if="m.result !== 'none'" class="tl-result" :style="resultStyle(m.result)">{{ resultLabel(m.result) }}</em>
                      <em v-if="m.date" class="tl-date">{{ m.date.slice(5) }}</em>
                    </span>
                    <i v-if="i < a.milestones.length - 1" class="tl-link"></i>
                  </template>
                </div>
                <span v-else class="tl-none">尚无进展节点</span>
              </div>
              <div class="tl-app-actions">
                <button class="tk-btn tk-btn-icon tl-view-btn" @click="$emit('open-application', a)">
                  查看进度
                </button>
                <button class="tk-btn tk-btn-danger tk-btn-icon" @click="removeApplication(a)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 导入方式选择 -->
    <div v-if="pendingImport" class="tk-modal-overlay" @click.self="pendingImport = null">
      <div class="tk-modal tl-import-modal">
        <div class="tk-modal-header">
          <h3>选择导入方式</h3>
          <button class="tk-modal-close" @click="pendingImport = null">✕</button>
        </div>
        <div class="tk-modal-body">
          <p class="tl-import-file">
            文件：<strong>{{ pendingImport.name }}</strong>（{{ pendingImport.count }} 家公司）
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
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { api, STATUSES, STATUS_COLORS, PRIORITY_COLORS, RESULT_COLORS, copyText, todayStr } from '../../api'

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
const expanded = ref(new Set(props.companies.map((c) => c.id)))

// 数据到达后，新公司默认展开（用户可点击收缩）
watch(
  () => props.companies.map((c) => c.id),
  (ids) => {
    const s = new Set(expanded.value)
    for (const id of ids) s.add(id)
    expanded.value = s
  },
  { immediate: true }
)

const totalApps = computed(() => props.companies.reduce((s, c) => s + c.applications.length, 0))
const countBy = computed(() => {
  const m = {}
  for (const c of props.companies) {
    for (const a of c.applications) m[a.status] = (m[a.status] || 0) + 1
  }
  return m
})

const filtered = computed(() => {
  let list = props.companies
  if (statusFilter.value) {
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
          [a.position, a.department, a.city, a.notes, c.name, c.channel, c.referral_code]
            .join(' ')
            .toLowerCase()
            .includes(k)
        ),
      }))
      .filter((c) =>
        statusFilter.value ? c.applications.length : c.applications.length || c.name.toLowerCase().includes(k)
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
  return { none: '无结果', waiting: '等待中', pass: '通过', fail: '未通过' }[r] || ''
}
function resultStyle(r) {
  const c = RESULT_COLORS[r] || RESULT_COLORS.none
  return { color: c.color, background: c.bg }
}

async function removeCompany(c) {
  if (!window.confirm(`确定删除「${c.name}」吗？其下 ${c.applications.length} 个投递、节点与笔记会一并删除。`)) return
  emit('remove-company', c.id)
}

async function removeApplication(a) {
  if (!window.confirm(`确定删除该投递「${a.position || '未填写岗位'}」吗？相关节点与笔记会一并删除。`)) return
  emit('remove-application', a.id)
}

function applyCompany(c) {
  if (!c.link) return
  window.open(c.link, '_blank', 'noopener')
}

async function copyReferral(c) {
  await copyText(c.referral_code)
  emit('notify', `已复制「${c.name}」的内推码`)
}

async function exportData() {
  const data = await api('/api/recruitment/companies/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `秋招追踪器备份-${todayStr()}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  emit('notify', '已导出 JSON 备份')
}

async function importFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!data || !Array.isArray(data.companies)) {
      throw new Error('文件不是有效的秋招追踪器备份')
    }
    pendingImport.value = { name: file.name, count: data.companies.length, data }
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}

async function doImport(mode) {
  const info = pendingImport.value
  pendingImport.value = null
  try {
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
.tl-chips { display: flex; gap: 10px; flex-wrap: wrap; }

.tl-table { overflow-x: auto; }
.tk-empty { padding: 56px 20px; }
.tk-row {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 104px 188px;
  gap: 16px;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #edf0f5;
  transition: background 0.15s ease;
}
.tk-row:last-child { border-bottom: none; }
.tk-row:hover { background: #f8fafd; }
.tl-head {
  font-size: 12px;
  color: var(--tk-faint);
  background: #fafbfd;
  padding: 11px 20px;
  position: sticky;
  top: 0;
  z-index: 1;
  letter-spacing: 0.02em;
  font-weight: 600;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 420px;
}

/* 投递展开区 */
.tl-app-area {
  background: #f8fafd;
  border-bottom: 1px solid #edf0f5;
  padding: 4px 20px 12px 44px;
}
.tl-no-apps {
  font-size: 12.5px;
  color: var(--tk-faint);
  padding: 10px 0 6px;
}
.tl-app-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) minmax(240px, 1.8fr) auto;
  gap: 16px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed #e4e9f1;
}
.tl-app-row:last-child { border-bottom: none; }
.tl-app-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tl-position-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
.tl-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tl-apply-btn { color: var(--tk-blue); border-color: #bcd0f2; background: #f7faff; }
.tl-apply-btn:hover { background: var(--tk-blue); border-color: var(--tk-blue); color: #fff; }
.tl-view-btn { color: var(--tk-blue); border-color: #bcd0f2; background: #fff; }
.tl-import-modal { max-width: 520px; }
.tl-import-file { font-size: 13px; color: var(--tk-muted); margin-bottom: 16px; }
.tl-import-hint { font-size: 12px; color: var(--tk-faint); margin-bottom: 12px; }
.tl-import-options { display: grid; gap: 10px; }
.tl-import-options .tk-btn {
  justify-content: space-between;
  width: 100%;
  padding: 14px 18px;
  border-radius: 12px;
  flex-wrap: wrap;
}
.tl-import-sub {
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
