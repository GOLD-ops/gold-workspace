<template>
  <div class="tk-modal-overlay nv-overlay">
    <div class="tk-modal nv-modal">
      <div class="tk-modal-header nv-head">
        <h3>{{ editing ? '编辑笔记' : (note.title || '无标题') }}</h3>
        <button class="tk-modal-close" @click="$emit('close')">✕</button>
      </div>

      <div class="tk-modal-body nv-body">
        <div class="nv-meta">
          <span v-if="note.company_name" class="nv-chip nv-company">{{ note.company_name }}</span>
          <span v-if="note.company_position" class="nv-chip nv-position">{{ note.company_position }}</span>
          <span v-if="note.milestone_name" class="nv-chip nv-milestone">{{ note.milestone_name }}</span>
          <span class="nv-date">{{ formatDateTime(note.updated_at) }}</span>
        </div>

        <div v-if="error" class="nv-error">{{ error }}</div>

        <template v-if="editing">
          <input v-model="draft.title" class="tk-input" placeholder="笔记标题，如：算法题 - 两数之和" />
          <MarkdownEditor v-model="draft.content" :min-height="300" />
        </template>
        <template v-else>
          <div class="nv-content" v-html="renderMarkdown(note.content)"></div>
        </template>
      </div>

      <div class="tk-modal-footer nv-foot">
        <template v-if="editing">
          <button class="tk-btn" style="margin-right: auto" @click="editing = false">取消</button>
          <button class="tk-btn tk-btn-primary" :disabled="saving" @click="save">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </template>
        <template v-else>
          <button class="tk-btn tk-btn-danger" style="margin-right: auto" @click="remove">删除笔记</button>
          <button class="tk-btn" @click="$emit('close')">关闭</button>
          <button class="tk-btn tk-btn-primary" @click="startEdit">编辑</button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { api, formatDateTime } from '../../api'
import MarkdownEditor from '../../ui/MarkdownEditor.vue'
import { renderMarkdown } from '../../ui/markdown'
import { confirmDialog } from '../../ui/confirm'

const props = defineProps({
  note: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved', 'deleted', 'notify'])

const editing = ref(false)
const saving = ref(false)
const error = ref('')
const draft = ref({ title: '', content: '' })

watch(
  () => props.note,
  () => resetDraft(),
  { immediate: true }
)

function resetDraft() {
  editing.value = false
  error.value = ''
  draft.value = {
    title: props.note.title || '',
    content: props.note.content || '',
  }
}

function startEdit() {
  resetDraft()
  editing.value = true
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await api(`/api/recruitment/notes/${props.note.id}`, {
      method: 'PUT',
      body: {
        title: draft.value.title,
        content: draft.value.content,
      },
    })
    emit('saved')
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  const ok = await confirmDialog({
    title: '删除笔记',
    message: `确定删除笔记「${props.note.title || '无标题'}」吗？删除后不可恢复。`,
  })
  if (!ok) return
  await api(`/api/recruitment/notes/${props.note.id}`, { method: 'DELETE' })
  emit('deleted')
}
</script>

<style scoped>
.nv-modal { max-width: 780px; }
.nv-head h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nv-body { display: grid; gap: 14px; }
.nv-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.nv-chip {
  font-size: 11.5px;
  border-radius: 7px;
  padding: 2px 9px;
  white-space: nowrap;
}
.nv-company { background: #eef3fc; color: var(--tk-blue); font-weight: 600; }
.nv-position { background: #f1f5f9; color: #64748b; }
.nv-milestone { background: #fef3c7; color: #b45309; }
.nv-date { font-size: 11px; color: #b0b7c2; margin-left: auto; white-space: nowrap; }
.nv-error {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12.5px;
}
.nv-content {
  font-size: 13.5px;
  color: #3f4858;
  line-height: 1.75;
  word-break: break-word;
}
.nv-content :deep(p) { margin: 6px 0; }
.nv-content :deep(h1),
.nv-content :deep(h2),
.nv-content :deep(h3),
.nv-content :deep(h4),
.nv-content :deep(h5),
.nv-content :deep(h6) { margin: 10px 0 5px; color: #1f2937; }
.nv-content :deep(h1) { font-size: 18px; }
.nv-content :deep(h2) { font-size: 16px; }
.nv-content :deep(h3) { font-size: 15px; }
.nv-content :deep(h4) { font-size: 14px; }
.nv-content :deep(h5) { font-size: 13.5px; }
.nv-content :deep(h6) { font-size: 13px; color: var(--tk-muted); }
.nv-content :deep(ul),
.nv-content :deep(ol) { padding-left: 22px; margin: 6px 0; }
.nv-content :deep(ol) { list-style: decimal; }
.nv-content :deep(ul) { list-style: disc; }
.nv-content :deep(li) { margin: 3px 0; }
.nv-content :deep(a) { color: var(--tk-blue); }
.nv-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--tk-border);
  margin: 12px 0;
}
.nv-content :deep(.md-task) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.nv-content :deep(.md-task input) {
  margin: 0;
  accent-color: var(--tk-blue);
}
.nv-content :deep(code) {
  background: #f0f3f8;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
}
.nv-content :deep(pre) {
  background: #f6f8fb;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  padding: 10px 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.nv-content :deep(pre code) { background: transparent; padding: 0; }
.nv-content :deep(blockquote) {
  margin: 8px 0;
  padding: 3px 12px;
  border-left: 3px solid var(--tk-blue);
  color: var(--tk-muted);
  background: #f8fafd;
  border-radius: 0 6px 6px 0;
}
.nv-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 10px 0;
  font-size: 13px;
}
.nv-content :deep(th),
.nv-content :deep(td) {
  border: 1px solid var(--tk-border);
  padding: 6px 10px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}
.nv-content :deep(th) {
  background: #f3f6fb;
  color: #1f2937;
  font-weight: 600;
  white-space: nowrap;
}
.nv-content :deep(tbody tr:nth-child(even) td) { background: #fafbfd; }
.nv-foot { padding: 14px 28px; }
</style>
