<template>
  <div class="sp" ref="root">
    <button ref="triggerEl" type="button" class="sp-trigger" :class="{ open }" @click="toggle">
      <span class="sp-label">{{ label }}</span>
      <svg class="sp-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <!-- 菜单挂到 body 上并使用 fixed 定位：避免被弹窗的滚动区域裁切，也不会撑高弹窗 -->
    <Teleport to="body">
      <div v-if="open" ref="menuEl" class="sp-menu" :style="menuStyle" @click.stop>
        <input
          v-if="showSearch"
          v-model="keyword"
          type="text"
          class="sp-search"
          :placeholder="`搜索${placeholder || '选项'}…`"
        />
        <div class="sp-scroll">
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
            v-for="opt in filteredOptions"
            :key="String(opt.value)"
            class="sp-item"
            :class="{ active: isActive(opt) }"
            @click="pick(opt)"
          >
            <span class="sp-check">{{ isActive(opt) ? '✓' : '' }}</span>
            <span>{{ opt.label }}</span>
          </button>
          <div v-if="!filteredOptions.length" class="sp-empty">无匹配选项</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, Array], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  multiple: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

const root = ref(null)
const triggerEl = ref(null)
const menuEl = ref(null)
const open = ref(false)
const keyword = ref('')
const menuPos = reactive({ top: 0, left: 0, width: 0, maxHeight: 300, placed: false })

const menuStyle = computed(() => ({
  top: `${menuPos.top}px`,
  left: `${menuPos.left}px`,
  width: `${menuPos.width}px`,
  maxHeight: `${menuPos.maxHeight}px`,
  visibility: menuPos.placed ? 'visible' : 'hidden',
}))

const showSearch = computed(() => props.options.length >= 8)

const filteredOptions = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return props.options
  return props.options.filter((o) =>
    String(o.label ?? o.value)
      .toLowerCase()
      .includes(k)
  )
})

watch(open, async (v) => {
  if (!v) {
    menuPos.placed = false
    return
  }
  keyword.value = ''
  menuPos.placed = false
  await nextTick()
  placeMenu()
})

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

// 菜单固定在触发按钮附近；向上或向下弹出取决于可用空间，始终不超过视口
function placeMenu() {
  const trigger = triggerEl.value
  if (!trigger || !open.value) return
  const rect = trigger.getBoundingClientRect()
  const gap = 6
  const margin = 10
  const spaceBelow = window.innerHeight - rect.bottom - gap - margin
  const spaceAbove = rect.top - gap - margin
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow
  const maxHeight = Math.max(140, Math.min(300, openUp ? spaceAbove : spaceBelow))
  const measured = menuEl.value ? menuEl.value.offsetHeight : maxHeight
  const height = Math.min(measured, maxHeight)

  menuPos.maxHeight = maxHeight
  menuPos.width = Math.max(160, Math.min(rect.width, window.innerWidth - margin * 2))
  menuPos.left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuPos.width - margin))
  menuPos.top = openUp
    ? Math.max(margin, rect.top - gap - height)
    : Math.min(rect.bottom + gap, window.innerHeight - margin - height)
  menuPos.placed = true
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
  if (root.value?.contains(e.target)) return
  if (menuEl.value?.contains(e.target)) return
  open.value = false
}

function onScroll(e) {
  if (!open.value) return
  // 菜单内部滚动（如搜索后翻列表）不应关闭菜单
  if (menuEl.value?.contains(e.target)) return
  open.value = false
}

function onResize() {
  placeMenu()
}

onMounted(() => {
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
  position: fixed;
  /* 需高于弹窗遮罩（rm-overlay 为 1000），否则在弹窗内会被遮挡 */
  z-index: 1200;
  background: #fff;
  border: 1px solid var(--tk-border);
  border-radius: 10px;
  box-shadow: var(--tk-shadow-lg);
  padding: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sp-scroll {
  display: grid;
  gap: 1px;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 280px;
  overflow-y: auto;
}
.sp-search {
  flex: none;
  margin-bottom: 3px;
  border: 1px solid #dbe1ea;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  background: #f8fafd;
  color: var(--tk-text);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.sp-search:focus {
  border-color: var(--tk-blue);
  background: #fff;
}
.sp-empty {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--tk-faint);
  text-align: center;
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
