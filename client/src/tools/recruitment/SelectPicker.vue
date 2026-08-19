<template>
  <div class="sp" ref="root">
    <button type="button" class="sp-trigger" :class="{ open }" @click="toggle">
      <span class="sp-label">{{ label }}</span>
      <svg class="sp-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <div v-if="open" class="sp-menu" @click.stop>
      <button
        v-if="multiple && selectedValues.length"
        type="button"
        class="sp-item sp-clear"
        @click="clearAll"
      >
        <span class="sp-check"></span>
        <span class="sp-clear-label">清除筛选</span>
      </button>
      <button
        type="button"
        v-for="opt in options"
        :key="String(opt.value)"
        class="sp-item"
        :class="{ active: isActive(opt) }"
        @click="pick(opt)"
      >
        <span class="sp-check">{{ isActive(opt) ? '✓' : '' }}</span>
        <span>{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Array], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  multiple: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

const root = ref(null)
const open = ref(false)

const selectedValues = computed(() =>
  Array.isArray(props.modelValue) ? props.modelValue.map(String) : []
)

const label = computed(() => {
  if (props.multiple) {
    if (!selectedValues.value.length) return props.placeholder
    const selected = props.options.filter((o) =>
      selectedValues.value.includes(String(o.value))
    )
    if (selected.length === 1) return selected[0].label
    return `已选 ${selected.length} 项`
  }
  const opt = props.options.find((o) => String(o.value) === String(props.modelValue))
  return opt ? opt.label : props.placeholder
})

function isActive(opt) {
  if (props.multiple) return selectedValues.value.includes(String(opt.value))
  return String(opt.value) === String(props.modelValue)
}

function toggle() {
  open.value = !open.value
}

function pick(opt) {
  if (props.multiple) {
    const key = String(opt.value)
    const next = selectedValues.value.includes(key)
      ? selectedValues.value.filter((v) => v !== key)
      : [...selectedValues.value, key]
    emit('update:modelValue', next)
    emit('change', next)
    return
  }
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  open.value = false
}

function clearAll() {
  emit('update:modelValue', [])
  emit('change', [])
}

function onClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<style scoped>
.sp {
  position: relative;
  display: inline-flex;
  width: 100%;
}
.sp-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #dbe1ea;
  border-radius: 10px;
  background: #fff;
  color: var(--tk-text);
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.sp-trigger:hover,
.sp-trigger.open {
  border-color: #bcd0f2;
}
.sp-trigger.open {
  border-color: var(--tk-blue);
  box-shadow: 0 0 0 3px rgba(61, 110, 224, 0.12);
}
.sp-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-arrow {
  width: 12px;
  height: 12px;
  color: var(--tk-muted);
  flex: none;
  transition: transform 0.15s ease;
}
.sp-trigger.open .sp-arrow {
  transform: rotate(180deg);
  color: var(--tk-blue);
}
.sp-menu {
  position: absolute;
  top: calc(100% + 5px);
  left: 0;
  z-index: 40;
  min-width: 100%;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: var(--tk-shadow-lg);
  padding: 4px;
  display: grid;
}
.sp-item {
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
.sp-item:hover {
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
}
.sp-item.active {
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  font-weight: 600;
}
.sp-item.sp-clear {
  border-bottom: 1px solid var(--tk-border);
  border-radius: 7px 7px 0 0;
  color: var(--tk-muted);
}
.sp-item.sp-clear:hover {
  background: #f5f7fa;
  color: var(--tk-text);
}
.sp-check {
  width: 14px;
  flex: none;
  color: var(--tk-blue);
  font-weight: 700;
}
</style>
