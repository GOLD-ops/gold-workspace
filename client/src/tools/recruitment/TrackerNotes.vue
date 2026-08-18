<template>
  <div>
    <div class="tk-card nt-toolbar-card">
      <div class="tk-toolbar">
        <h3 class="nt-title">面试复盘笔记库</h3>
        <span style="flex: 1"></span>
        <input v-model="q" class="tk-input nt-search" placeholder="搜索标题 / 内容 / 公司…" />
      </div>
      <div class="tk-chips">
        <button class="tk-chip" :class="{ active: tagFilter === '' }" @click="tagFilter = ''">
          全部标签 {{ notes.length }}
        </button>
        <button
          class="tk-chip"
          :class="{ active: tagFilter === t.tag }"
          v-for="t in tags"
          :key="t.tag"
          @click="tagFilter = t.tag"
        >
          {{ t.tag }} {{ t.count }}
        </button>
      </div>
    </div>

    <div v-if="!grouped.length" class="tk-card tk-empty">
      还没有复盘笔记。在「列表 → 编辑记录 → 节点下的复盘笔记」中添加，会按标签自动聚合到这里。
    </div>

    <div v-for="g in grouped" :key="g.tag" class="nt-group">
      <div class="nt-group-title"># {{ g.tag }}<span>{{ g.notes.length }}</span></div>
      <div class="nt-grid">
        <div class="tk-card nt-note" v-for="n in g.notes" :key="n.id">
          <template v-if="editingId === n.id">
            <input v-model="editDraft.title" class="tk-input" placeholder="标题" />
            <RichEditor v-model="editDraft.content" />
            <input v-model="editDraft.tagsText" class="tk-input" placeholder="标签，空格或逗号分隔" />
            <div class="nt-actions">
              <button class="tk-btn tk-btn-sm" @click="editingId = null">取消</button>
              <button class="tk-btn tk-btn-primary tk-btn-sm" @click="saveEdit(n)">保存</button>
            </div>
          </template>
          <template v-else>
            <div class="nt-note-head">
              <span class="nt-company">{{ n.company_name }}</span>
              <span v-if="n.company_position" class="nt-position">{{ n.company_position }}</span>
              <span v-if="n.milestone_name" class="nt-milestone">{{ n.milestone_name }}</span>
            </div>
            <div class="nt-note-title">{{ n.title || '无标题' }}</div>
            <div class="nt-note-content" v-html="n.content"></div>
            <div class="nt-tags">
              <span class="tk-tag" v-for="t in n.tags" :key="t" @click="tagFilter = t">{{ t }}</span>
            </div>
            <div class="nt-actions">
              <span class="nt-date">{{ formatDateTime(n.updated_at) }}</span>
              <span style="flex: 1"></span>
              <button class="tk-btn tk-btn-icon" @click="startEdit(n)">编辑</button>
              <button class="tk-btn tk-btn-danger tk-btn-icon" @click="remove(n)">删除</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, formatDateTime, parseTagsText } from '../../api'
import RichEditor from '../../ui/RichEditor.vue'

const emit = defineEmits(['notify'])
const notes = ref([])
const tags = ref([])
const tagFilter = ref('')
const q = ref('')
const editingId = ref(null)
const editDraft = ref({ title: '', content: '', tagsText: '' })

onMounted(load)

async function load() {
  notes.value = await api('/api/recruitment/notes')
  tags.value = await api('/api/recruitment/notes/tags')
}

const filtered = computed(() => {
  let list = notes.value
  if (tagFilter.value) list = list.filter((n) => n.tags.includes(tagFilter.value))
  if (q.value.trim()) {
    const k = q.value.trim().toLowerCase()
    list = list.filter((n) =>
      [n.title, n.content.replace(/<[^>]*>/g, ' '), n.company_name, n.milestone_name]
        .join(' ')
        .toLowerCase()
        .includes(k)
    )
  }
  return list
})

const grouped = computed(() => {
  const map = new Map()
  if (tagFilter.value) {
    map.set(tagFilter.value, [])
  }
  for (const n of filtered.value) {
    const list = n.tags.length ? n.tags : ['未分类']
    for (const t of list) {
      if (tagFilter.value && t !== tagFilter.value) continue
      if (!map.has(t)) map.set(t, [])
      map.get(t).push(n)
    }
  }
  return [...map.entries()].map(([tag, list]) => ({ tag, notes: list }))
})

function startEdit(n) {
  editingId.value = n.id
  editDraft.value = {
    title: n.title,
    content: n.content,
    tagsText: n.tags.join(' '),
  }
}

async function saveEdit(n) {
  const payload = {
    title: editDraft.value.title,
    content: editDraft.value.content,
    tags: parseTagsText(editDraft.value.tagsText),
  }
  await api(`/api/recruitment/notes/${n.id}`, { method: 'PUT', body: payload })
  editingId.value = null
  emit('notify', '笔记已更新')
  await load()
}

async function remove(n) {
  if (!window.confirm(`确定删除笔记「${n.title || '无标题'}」？`)) return
  await api(`/api/recruitment/notes/${n.id}`, { method: 'DELETE' })
  emit('notify', '笔记已删除')
  await load()
}
</script>

<style scoped>
.nt-toolbar-card { padding: 14px 16px; margin-bottom: 16px; }
.nt-title { font-size: 17px; margin: 0; }
.nt-search { width: 260px; }
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
.nt-note { padding: 14px 16px; display: grid; gap: 8px; }
.nt-note-head { display: flex; align-items: center; gap: 6px; }
.nt-company { font-size: 12px; font-weight: 700; color: #111827; }
.nt-milestone {
  font-size: 11px;
  background: #f1f5f9;
  color: #64748b;
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
  max-height: 160px;
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
  height: 32px;
  background: linear-gradient(transparent, #fff);
}
.nt-note-content :deep(p) { margin: 4px 0; }
.nt-note-content :deep(ul) { padding-left: 18px; }
.nt-tags { display: flex; flex-wrap: wrap; }
.nt-tags .tk-tag { cursor: pointer; }
.nt-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.nt-date { font-size: 11px; color: #b0b7c2; }

@media (max-width: 700px) {
  .nt-search { width: 100%; }
}
</style>
