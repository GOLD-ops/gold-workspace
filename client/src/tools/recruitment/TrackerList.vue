<template>
  <div>
    <div class="tk-card tl-toolbar-card">
      <div class="tk-toolbar">
        <button class="tk-btn tk-btn-primary" @click="$emit('open', null)">新增记录</button>
        <button class="tk-btn" :disabled="!selected.size" @click="advance">
          批量推进<template v-if="selected.size">（{{ selected.size }}）</template>
        </button>
        <span style="flex: 1"></span>
        <button class="tk-btn" @click="exportData">导出</button>
        <label class="tk-btn" style="cursor: pointer">
          导入
          <input type="file" accept=".json,application/json" style="display: none" @change="importFile" />
        </label>
      </div>
      <div class="tk-toolbar">
        <input
          v-model="q"
          class="tk-input tl-search"
          placeholder="搜索公司 / 岗位 / 部门 / 城市 / 备注…"
        />
        <select v-model="sortBy" class="tk-select">
          <option value="updated">按最近更新</option>
          <option value="priority">按优先级</option>
          <option value="company">按公司名</option>
          <option value="created">按创建时间</option>
        </select>
      </div>
      <div class="tl-chips">
        <button class="tk-chip" :class="{ active: statusFilter === '' }" @click="statusFilter = ''">
          全部 {{ companies.length }}
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

    <div v-if="!filtered.length" class="tk-card tk-empty">
      {{ companies.length ? '没有符合条件的记录' : '还没有投递记录，点击「新增记录」开始吧' }}
    </div>

    <div v-else class="tk-card tl-table">
      <div class="tk-row tk-row-head">
        <input class="tl-check" type="checkbox" :checked="allSelected" @change="toggleAll" />
        <span>公司 / 岗位</span>
        <span>进展轨迹</span>
        <span>内推码</span>
        <span>操作</span>
      </div>
      <div
        class="tk-row"
        :class="{ selected: selected.has(c.id) }"
        v-for="c in filtered"
        :key="c.id"
      >
        <input class="tl-check" type="checkbox" :checked="selected.has(c.id)" @change="toggle(c.id)" />
        <div class="tl-cell-main">
          <div class="tl-company-row">
            <span class="tl-company">{{ c.company }}</span>
            <span
              class="tk-badge tl-priority"
              :style="{
                background: PRIORITY_COLORS[c.priority].bg,
                color: PRIORITY_COLORS[c.priority].color,
              }"
              >{{ c.priority }}</span
            >
          </div>
          <div v-if="c.position" class="tl-position">{{ c.position }}</div>
          <div class="tl-meta">
            <span v-if="c.department" class="tl-meta-chip">{{ c.department }}</span>
            <span v-if="c.city" class="tl-meta-chip">{{ c.city }}</span>
            <span v-if="c.salary" class="tl-meta-chip">{{ c.salary }}</span>
            <span v-if="c.channel" class="tl-meta-chip">{{ c.channel }}</span>
          </div>
          <div v-if="c.notes" class="tl-sub">{{ c.notes }}</div>
        </div>
        <div class="tl-cell-timeline">
          <div v-if="c.milestones.length" class="tl-track">
            <template v-for="(m, i) in c.milestones" :key="m.id">
              <span
                class="tl-node"
                :class="{ done: i < currentIdx(c), current: m.name === c.current_stage }"
                :title="`${m.name} ${m.date || ''}`"
              >
                <i class="tl-dot"></i>
                <span class="tl-label">{{ m.name }}</span>
                <em v-if="m.date" class="tl-date">{{ m.date.slice(5) }}</em>
              </span>
              <i v-if="i < c.milestones.length - 1" class="tl-link"></i>
            </template>
          </div>
          <span v-else class="tl-none">—</span>
        </div>
        <div class="tl-cell-code">
          <span v-if="c.referral_code" class="tl-code" @click="copy(c)">{{ c.referral_code }}</span>
          <span v-else class="tl-none">—</span>
        </div>
        <div class="tl-actions">
          <button
            v-if="c.status !== '未投递'"
            class="tk-btn tk-btn-icon tl-view-btn"
            @click="$emit('open', c)"
          >
            查看进度
          </button>
          <button
            v-else
            class="tk-btn tk-btn-icon tl-apply-btn"
            :disabled="!c.link"
            :title="c.link ? '前往官网投递' : '未填写投递链接'"
            @click="apply(c)"
          >
            一键投递
          </button>
          <button class="tk-btn tk-btn-icon" @click="$emit('open', c)">编辑</button>
          <button class="tk-btn tk-btn-danger tk-btn-icon" @click="remove(c)">删除</button>
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
            文件：<strong>{{ pendingImport.name }}</strong>（{{ pendingImport.count }} 条记录）
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
import { ref, computed } from 'vue'
import { api, STATUSES, PRIORITY_COLORS, copyText, todayStr } from '../../api'

const props = defineProps({ companies: { type: Array, default: () => [] } })
const emit = defineEmits(['open', 'reload', 'notify'])

const q = ref('')
const statusFilter = ref('')
const sortBy = ref('updated')
const selected = ref(new Set())
const pendingImport = ref(null)

const countBy = computed(() => {
  const m = {}
  for (const c of props.companies) m[c.status] = (m[c.status] || 0) + 1
  return m
})

const filtered = computed(() => {
  let list = props.companies
  if (statusFilter.value) list = list.filter((c) => c.status === statusFilter.value)
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase()
    list = list.filter((c) =>
      [c.company, c.position, c.department, c.city, c.channel, c.referral_code, c.notes]
        .join(' ')
        .toLowerCase()
        .includes(k)
    )
  }
  const arr = [...list]
  if (sortBy.value === 'priority') arr.sort((a, b) => b.priority_score - a.priority_score)
  else if (sortBy.value === 'company') arr.sort((a, b) => a.company.localeCompare(b.company, 'zh'))
  else if (sortBy.value === 'created') arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  else arr.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return arr
})

const allSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((c) => selected.value.has(c.id))
)

function currentIdx(c) {
  return c.milestones.findIndex((m) => m.name === c.current_stage)
}

function toggle(id) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function toggleAll(e) {
  const s = new Set(selected.value)
  if (e.target.checked) for (const c of filtered.value) s.add(c.id)
  else for (const c of filtered.value) s.delete(c.id)
  selected.value = s
}

async function advance() {
  if (!selected.value.size) return
  const count = selected.value.size
  const ok = window.confirm(`确定将选中的 ${count} 条记录统一推进到下一阶段吗？\n系统会自动追加对应节点并填写今天日期。`)
  if (!ok) return
  try {
    const r = await api('/api/recruitment/companies/batch-advance', {
      method: 'POST',
      body: { ids: [...selected.value] },
    })
    selected.value = new Set()
    emit('reload')
    const skip = r.skipped.map((x) => x.company).join('、')
    emit(
      'notify',
      `已推进 ${r.advanced.length} 条${skip ? `；${skip} 已到最终阶段，未变动` : ''}`
    )
  } catch (e) {
    emit('notify', e.message)
  }
}

async function remove(c) {
  if (!window.confirm(`确定删除「${c.company}」吗？相关节点与笔记会一并删除。`)) return
  await api(`/api/recruitment/companies/${c.id}`, { method: 'DELETE' })
  emit('reload')
  emit('notify', `已删除「${c.company}」`)
}

function apply(c) {
  if (!c.link) return
  window.open(c.link, '_blank', 'noopener')
}

async function copy(c) {
  await copyText(c.referral_code)
  emit('notify', `已复制「${c.company}」的内推码`)
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
    pendingImport.value = {
      name: file.name,
      count: data.companies.length,
      data,
    }
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
    emit('notify', `导入完成：新增 ${r.imported} 条，合并 ${r.merged} 条`)
  } catch (err) {
    emit('notify', `导入失败：${err.message}`)
  }
}

</script>

<style scoped>
.tl-toolbar-card { padding: 18px 20px; margin-bottom: 20px; }
.tl-search { flex: 1; min-width: 220px; }
.tl-chips { display: flex; gap: 10px; flex-wrap: wrap; }

.tl-table { overflow-x: auto; }
.tk-row {
  display: grid;
  grid-template-columns: 26px minmax(210px, 1.9fr) minmax(210px, 1.5fr) 104px 178px;
  gap: 16px;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #edf0f5;
  transition: background 0.15s ease;
}
.tk-row:last-child { border-bottom: none; }
.tk-row:hover { background: #f8fafd; }
.tk-row.selected { background: #eef4fd; }
.tk-row-head {
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
.tl-check {
  width: 15px;
  height: 15px;
  accent-color: var(--tk-blue);
  cursor: pointer;
}
.tl-company-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tl-company { font-size: 15px; font-weight: 700; color: var(--tk-text); letter-spacing: -0.2px; }
.tl-position { font-size: 13px; color: var(--tk-muted); font-weight: 500; margin-top: 3px; }
.tl-priority { flex: none; font-size: 11px; padding: 2px 9px; }
.tl-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.tl-meta-chip {
  background: #f1f4f8;
  color: #5d6878;
  border-radius: 7px;
  padding: 2px 9px;
  font-size: 12px;
  white-space: nowrap;
}
.tl-sub {
  font-size: 12px;
  color: var(--tk-faint);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 360px;
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
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s ease;
}
.tl-code:hover { background: #fff3d6; }
.tl-none { color: #cbd5e1; font-size: 12px; }
.tl-actions { display: flex; gap: 6px; }
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
    grid-template-columns: 26px minmax(0, 1fr);
    grid-template-areas:
      'cb main'
      'cb timeline'
      'cb actions';
    row-gap: 10px;
    padding: 14px 16px;
  }
  .tk-row > input { grid-area: cb; align-self: start; margin-top: 4px; }
  .tk-row-head { display: none; }
  .tl-cell-main { grid-area: main; }
  .tl-cell-timeline { grid-area: timeline; }
  .tk-row > div:nth-of-type(4) { display: none; } /* 内推码 */
  .tl-actions { grid-area: actions; }
}
</style>
