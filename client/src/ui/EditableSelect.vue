<template>
  <div ref="root" class="esx">
    <div class="esx-box" :class="{ open }">
      <input
        ref="inputEl"
        class="esx-input"
        :value="draft"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        @click="open = true"
        @focus="open = true"
        @input="onInput"
        @compositionstart="composing = true"
        @compositionend="onCompositionEnd"
        @blur="commit"
        @keydown.enter.prevent="commit(true)"
        @keydown.escape="open = false"
      />
      <button
        type="button"
        class="esx-arrow"
        tabindex="-1"
        title="选择预置服务商"
        @mousedown.prevent
        @click.stop="open = !open"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuEl"
        class="esx-menu"
        :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px', width: menuPos.width + 'px' }"
      >
        <div class="esx-tip">{{ tip }}</div>
        <button
          v-for="opt in options"
          :key="String(opt.value)"
          type="button"
          class="esx-item"
          :class="{ active: String(opt.value) === String(modelValue) }"
          @mousedown.prevent
          @click.stop="pick(opt)"
        >
          <span class="esx-check">{{ String(opt.value) === String(modelValue) ? '✓' : '' }}</span>
          <span>{{ opt.label }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '选择或输入' },
  tip: { type: String, default: '可直接输入自定义服务商名称' },
})
const emit = defineEmits(['update:modelValue', 'change'])

const root = ref(null)
const inputEl = ref(null)
const menuEl = ref(null)
const open = ref(false)
const composing = ref(false)
const lastCommitted = ref(String(props.modelValue ?? ''))
const menuPos = reactive({ top: 0, left: 0, width: 220 })

function displayOf(v) {
  const opt = props.options.find((o) => String(o.value) === String(v ?? ''))
  return opt ? opt.label : String(v ?? '')
}

const draft = ref(displayOf(props.modelValue))

watch(
  () => props.modelValue,
  (v) => {
    if (document.activeElement !== inputEl.value) {
      draft.value = displayOf(v)
    }
  }
)

function emitLive() {
  const text = draft.value
  const match = props.options.find((o) => o.label === text)
  emit('update:modelValue', match ? match.value : text)
}

function onInput(e) {
  draft.value = e.target.value
  if (!composing.value) emitLive()
}

function onCompositionEnd(e) {
  composing.value = false
  draft.value = e.target.value
  emitLive()
}

function commit(close = false) {
  const text = draft.value.trim()
  const match = props.options.find((o) => o.label === text)
  const value = match ? match.value : text
  draft.value = match ? match.label : text
  if (close) open.value = false
  if (String(value) === lastCommitted.value) return
  lastCommitted.value = String(value)
  emit('update:modelValue', value)
  emit('change', value)
}

function pick(opt) {
  draft.value = opt.label
  lastCommitted.value = String(opt.value)
  open.value = false
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
}

function positionMenu() {
  if (!open.value || !inputEl.value) return
  const r = inputEl.value.getBoundingClientRect()
  const maxW = window.innerWidth - r.left - 16
  const width = Math.max(r.width, Math.min(280, maxW))
  const h = menuEl.value ? menuEl.value.offsetHeight : 200
  let top = r.bottom + 6
  if (top + h > window.innerHeight - 10 && r.top - h - 6 > 0) {
    top = r.top - h - 6
  }
  menuPos.width = width
  menuPos.left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
  menuPos.top = Math.max(8, top)
}

watch(open, async (v) => {
  if (v) {
    await nextTick()
    positionMenu()
  }
})

function onClickOutside(e) {
  if (
    root.value &&
    !root.value.contains(e.target) &&
    menuEl.value &&
    !menuEl.value.contains(e.target)
  ) {
    open.value = false
  }
}

function onScroll() {
  if (open.value) {
    open.value = false
  }
}

function onResize() {
  positionMenu()
}

onMounted(() => {
  lastCommitted.value = String(props.modelValue ?? '')
  draft.value = displayOf(props.modelValue)
  document.addEventListener('click', onClickOutside)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.esx {
  position: relative;
  width: 100%;
}
.esx-box {
  position: relative;
  display: flex;
  align-items: center;
}
.esx-input {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 34px 9px 14px;
  border: 1px solid #dbe1ea;
  border-radius: 10px;
  background: #fff;
  color: var(--tk-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.esx-input:focus,
.esx-box.open .esx-input {
  border-color: var(--tk-blue);
  box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12);
}
.esx-arrow {
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #98a2b3;
  cursor: pointer;
  padding: 2px;
  transition: color 0.15s ease, transform 0.15s ease;
}
.esx-box.open .esx-arrow {
  color: var(--tk-blue);
  transform: translateY(-50%) rotate(180deg);
}
.esx-menu {
  position: fixed;
  z-index: 500;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: var(--tk-shadow-md);
  padding: 4px;
  display: grid;
  gap: 1px;
  max-height: 300px;
  overflow-y: auto;
}
.esx-tip {
  padding: 6px 10px 7px;
  font-size: 11.5px;
  color: var(--tk-faint);
  border-bottom: 1px dashed #e8edf4;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.esx-item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--tk-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}
.esx-item:hover {
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
}
.esx-item.active {
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  font-weight: 600;
}
.esx-check {
  width: 14px;
  flex: none;
  color: var(--tk-blue);
  font-weight: 700;
}
</style>
