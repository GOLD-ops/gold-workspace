<template>
  <div class="re-wrap">
    <div class="re-toolbar">
      <button type="button" @mousedown.prevent @click="cmd('bold')"><b>B</b></button>
      <button type="button" @mousedown.prevent @click="cmd('italic')"><i>I</i></button>
      <button type="button" @mousedown.prevent @click="cmd('underline')"><u>U</u></button>
      <span class="re-sep"></span>
      <button type="button" @mousedown.prevent @click="cmd('formatBlock', 'h3')">H2</button>
      <button type="button" @mousedown.prevent @click="cmd('insertUnorderedList')">• 列表</button>
      <button type="button" @mousedown.prevent @click="addLink">链接</button>
    </div>
    <div
      ref="editor"
      class="re-editor"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="sync"
    ></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '记录面试中的关键问题、回答思路与复盘心得…' },
})
const emit = defineEmits(['update:modelValue'])
const editor = ref(null)

function sync() {
  emit('update:modelValue', editor.value.innerHTML)
}

function cmd(name, value = null) {
  editor.value.focus()
  document.execCommand(name, false, value)
  sync()
}

function addLink() {
  const url = window.prompt('请输入链接地址（https://…）')
  if (url) cmd('createLink', url)
}

onMounted(() => {
  editor.value.innerHTML = props.modelValue || ''
})

watch(
  () => props.modelValue,
  (val) => {
    if (editor.value && editor.value.innerHTML !== (val || '')) {
      editor.value.innerHTML = val || ''
    }
  }
)
</script>

<style scoped>
.re-wrap { border: 1px solid #d8dee7; border-radius: 8px; overflow: hidden; background: #fff; }
.re-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid #eef1f5;
  background: #fafbfc;
  flex-wrap: wrap;
}
.re-toolbar button {
  border: none;
  background: transparent;
  width: 28px;
  height: 26px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
  color: #4b5563;
}
.re-toolbar button:hover { background: #e8eef6; color: var(--tk-blue, #4a90d9); }
.re-sep { width: 1px; height: 16px; background: #e2e6ec; margin: 0 4px; }
.re-editor {
  min-height: 96px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  outline: none;
  color: #1f2937;
}
.re-editor:empty::before {
  content: attr(data-placeholder);
  color: #b0b7c2;
}
.re-editor :deep(h3) { font-size: 15px; margin: 6px 0; }
.re-editor :deep(ul) { padding-left: 18px; }
.re-editor :deep(a) { color: #4a90d9; }
</style>
