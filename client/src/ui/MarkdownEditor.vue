<template>
  <div class="md-wrap">
    <div class="md-bar">
      <div class="md-mode">
        <button
          type="button"
          :class="{ 'md-active': mode === 'edit' }"
          @click="mode = 'edit'"
        >
          编辑
        </button>
        <button
          type="button"
          :class="{ 'md-active': mode === 'preview' }"
          @click="mode = 'preview'"
        >
          预览
        </button>
      </div>
      <span class="md-hint">支持 Markdown：**加粗** · *斜体* · # 标题 · - 列表 · `代码` · [链接](url)</span>
    </div>

    <textarea
      v-if="mode === 'edit'"
      v-model="content"
      class="md-textarea"
      :style="{ minHeight: minHeight + 'px' }"
      :placeholder="placeholder"
      spellcheck="false"
    ></textarea>
    <div
      v-else
      class="md-preview"
      :style="{ minHeight: minHeight + 'px' }"
      v-html="renderMarkdown(content)"
    ></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { renderMarkdown } from './markdown'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: {
    type: String,
    default: '使用 Markdown 编写笔记，例如：\n## 面试问题\n- 问题一\n- 问题二\n\n**总结**：…',
  },
  minHeight: { type: Number, default: 120 },
})
const emit = defineEmits(['update:modelValue'])

const mode = ref('edit')

const content = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<style scoped>
.md-wrap {
  border: 1px solid var(--tk-border);
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.md-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--tk-border);
  background: #f8fafc;
}
.md-mode {
  display: inline-flex;
  background: #eef1f6;
  border-radius: 7px;
  padding: 2px;
  flex: none;
}
.md-mode button {
  border: none;
  background: transparent;
  font-size: 12px;
  line-height: 1;
  padding: 5px 12px;
  border-radius: 5px;
  color: var(--tk-muted);
  cursor: pointer;
  transition: all 0.12s ease;
}
.md-mode button:hover {
  color: var(--tk-text);
}
.md-mode .md-active {
  background: #fff;
  color: var(--tk-blue);
  font-weight: 600;
  box-shadow: var(--tk-shadow-sm);
}
.md-hint {
  font-size: 11.5px;
  color: var(--tk-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.md-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  resize: vertical;
  min-height: 120px;
  padding: 10px 12px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.7;
  color: var(--tk-text);
  background: #fff;
}
.md-textarea::placeholder {
  color: #b0b7c2;
}
.md-preview {
  min-height: 120px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  color: #3f4858;
  word-break: break-word;
}
.md-preview :deep(h1),
.md-preview :deep(h2),
.md-preview :deep(h3),
.md-preview :deep(h4),
.md-preview :deep(h5),
.md-preview :deep(h6) {
  color: var(--tk-text);
  margin: 8px 0 4px;
}
.md-preview :deep(h1) { font-size: 17px; }
.md-preview :deep(h2) { font-size: 15px; }
.md-preview :deep(h3) { font-size: 14px; }
.md-preview :deep(h4) { font-size: 13.5px; }
.md-preview :deep(h5) { font-size: 13px; }
.md-preview :deep(h6) { font-size: 13px; color: var(--tk-muted); }
.md-preview :deep(p) { margin: 4px 0; }
.md-preview :deep(ul),
.md-preview :deep(ol) { padding-left: 20px; margin: 4px 0; }
.md-preview :deep(ol) { list-style: decimal; }
.md-preview :deep(ul) { list-style: disc; }
.md-preview :deep(li) { margin: 2px 0; }
.md-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--tk-border);
  margin: 10px 0;
}
.md-preview :deep(.md-task) {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.md-preview :deep(.md-task input) {
  margin: 0;
  accent-color: var(--tk-blue);
}
.md-preview :deep(a) { color: var(--tk-blue); }
.md-preview :deep(code) {
  background: #f0f3f8;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
.md-preview :deep(pre) {
  background: #f6f8fb;
  border: 1px solid var(--tk-border);
  border-radius: 7px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 6px 0;
}
.md-preview :deep(pre code) {
  background: transparent;
  padding: 0;
}
.md-preview :deep(blockquote) {
  margin: 6px 0;
  padding: 2px 10px;
  border-left: 3px solid var(--tk-blue);
  color: var(--tk-muted);
  background: #f8fafd;
  border-radius: 0 6px 6px 0;
}
.md-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
  font-size: 12.5px;
}
.md-preview :deep(th),
.md-preview :deep(td) {
  border: 1px solid var(--tk-border);
  padding: 5px 9px;
  text-align: left;
  vertical-align: top;
  word-break: break-word;
}
.md-preview :deep(th) {
  background: #f3f6fb;
  color: var(--tk-text);
  font-weight: 600;
  white-space: nowrap;
}
.md-preview :deep(tbody tr:nth-child(even) td) { background: #fafbfd; }
</style>
