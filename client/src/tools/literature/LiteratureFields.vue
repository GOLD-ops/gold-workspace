<template>
  <div class="lt-card lt-fields">
    <div class="lt-fields-head">
      <div class="lt-fields-title">
        <h3>分析字段</h3>
      </div>
      <div class="lt-fields-head-actions">
        <span class="lt-fields-count">{{ enabledCount }}/{{ fields.length }} 已启用</span>
        <label class="lt-fields-all-label" title="全选/取消全选">
          <input type="checkbox" class="lt-fields-all" :checked="allEnabled" @change="toggleAllEnabled" />
          全选
        </label>
      </div>
    </div>

    <div class="lt-fields-strip">
      <div
        v-for="(f, i) in fields"
        :key="f.field_key"
        class="lt-chip"
        :class="[f.enabled ? 'on' : 'off', { dragging: dragIndex === i }]"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOver(i)"
        @dragend="onDragEnd"
        :title="f.enabled ? '点击停用该字段' : '点击启用该字段'"
        @click="toggleField(f)"
      >
        <span class="lt-chip-icon" v-html="typeIcon(f.type)"></span>
        <span class="lt-chip-name">{{ f.label }}</span>
        <button
          class="lt-chip-config"
          :title="'配置「' + f.label + '」'"
          @click.stop="openField(f)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <button class="lt-add-chip" title="添加字段" @click="showAdd = true">＋</button>
    </div>
  </div>

  <!-- 字段配置弹窗 -->
  <div v-if="editing" class="lt-modal-overlay" @click.self="editing = null">
    <div class="lt-modal lt-field-modal">
      <div class="lt-modal-header">
        <h3>配置字段</h3>
        <button class="lt-modal-close" @click="editing = null">✕</button>
      </div>
      <div class="lt-modal-body">
        <div class="fm-field">
          <label>字段名称</label>
          <input v-model="editing.label" class="lt-input" />
        </div>
        <div class="fm-field">
          <label>类型</label>
          <select v-model="editing.type" class="lt-select">
            <option value="text">文本</option>
            <option value="date">日期（2026-08）</option>
            <option value="boolean">布尔（是/否）</option>
            <option value="number">数值</option>
            <option value="category">单选分类</option>
            <option value="multi">多选分类</option>
          </select>
        </div>
        <div v-if="isCategoryType(editing.type)" class="fm-field">
          <label>候选选项</label>
          <div class="fm-options">
            <span v-for="o in editingOptionList" :key="o" class="fm-option">
              {{ o }}
              <button type="button" title="删除该选项" @click="removeEditOption(o)">✕</button>
            </span>
            <div class="fm-option-add">
              <input
                v-model="editOptionInput"
                class="lt-input"
                placeholder="输入选项，回车或点 ＋ 添加"
                @keydown.enter.prevent="addEditOption"
              />
              <button type="button" class="lt-btn lt-btn-sm" @click="addEditOption">＋</button>
            </div>
          </div>
        </div>
        <div class="fm-field">
          <label>说明（对 AI 的要求，可选）</label>
          <textarea
            v-model="editing.description"
            class="lt-textarea"
            :placeholder="'例如：重点说明「' + (editing.label || '该字段') + '」需要 AI 关注的具体要求'"
          ></textarea>
        </div>
        <label class="fm-enable">
          <input v-model="editing.enabled" type="checkbox" />
          参与分析（启用）
        </label>
      </div>
      <div class="lt-modal-footer">
        <button class="lt-btn lt-btn-danger" @click="removeField">删除字段</button>
        <span style="flex: 1"></span>
        <button class="lt-btn" @click="editing = null">取消</button>
        <button class="lt-btn lt-btn-primary" @click="confirmField">确定</button>
      </div>
    </div>
  </div>

  <!-- 添加字段弹窗 -->
  <div v-if="showAdd" class="lt-modal-overlay" @click.self="showAdd = false">
    <div class="lt-modal lt-field-modal">
      <div class="lt-modal-header">
        <h3>添加字段</h3>
        <button class="lt-modal-close" @click="showAdd = false">✕</button>
      </div>
      <div class="lt-modal-body">
        <div class="fm-field">
          <label>名称</label>
          <input v-model="newLabel" class="lt-input" placeholder="如：数据规模" />
        </div>
        <div class="fm-field">
          <label>类型（默认文本）</label>
          <select v-model="newType" class="lt-select">
            <option value="text">文本</option>
            <option value="date">日期</option>
            <option value="boolean">是/否</option>
            <option value="number">数值</option>
            <option value="category">单选分类</option>
            <option value="multi">多选分类</option>
          </select>
        </div>
        <div v-if="isCategoryType(newType)" class="fm-field">
          <label>候选选项</label>
          <div class="fm-options">
            <span v-for="o in newOptionList" :key="o" class="fm-option">
              {{ o }}
              <button type="button" title="删除该选项" @click="removeNewOption(o)">✕</button>
            </span>
            <div class="fm-option-add">
              <input
                v-model="newOptionInput"
                class="lt-input"
                placeholder="输入选项，回车或点 ＋ 添加"
                @keydown.enter.prevent="addNewOption"
              />
              <button type="button" class="lt-btn lt-btn-sm" @click="addNewOption">＋</button>
            </div>
          </div>
        </div>
        <div class="fm-field">
          <label>说明（对 AI 的要求，可选）</label>
          <textarea
            v-model="newDesc"
            class="lt-textarea"
            :placeholder="'例如：重点说明「' + (newLabel || '该字段') + '」需要 AI 关注的具体要求'"
          ></textarea>
        </div>
      </div>
      <div class="lt-modal-footer">
        <button class="lt-btn" @click="showAdd = false">取消</button>
        <button class="lt-btn lt-btn-primary" @click="addField">添加</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '../../api'
import { confirmDialog } from '../../ui/confirm'

const emit = defineEmits(['notify'])
const fields = ref([])
const editing = ref(null)
const showAdd = ref(false)
const dragIndex = ref(null)
const newLabel = ref('')
const newType = ref('text')
const newDesc = ref('')
const newOptionList = ref([])
const newOptionInput = ref('')
const editOptionInput = ref('')
const loaded = ref(false)
let saveTimer = null

const allEnabled = computed(() => fields.value.length > 0 && fields.value.every((f) => f.enabled))
const enabledCount = computed(() => fields.value.filter((f) => f.enabled).length)

function typeIcon(t) {
  const icons = {
    text: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    date: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    year: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    month: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    boolean: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    number: '<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>',
    category: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/>',
    multi: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  }
  const d = icons[t] || icons.text
  return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
}

function isCategoryType(t) {
  return t === 'category' || t === 'multi'
}

const editingOptionList = computed(() =>
  (editing.value?.options || '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
)
function addEditOption() {
  if (!editOptionInput.value.trim()) return
  editing.value.options = [...editingOptionList.value, editOptionInput.value.trim()].join('、')
  editOptionInput.value = ''
}
function removeEditOption(o) {
  editing.value.options = editingOptionList.value.filter((x) => x !== o).join('、')
}
function addNewOption() {
  if (!newOptionInput.value.trim()) return
  if (!newOptionList.value.includes(newOptionInput.value.trim())) {
    newOptionList.value.push(newOptionInput.value.trim())
  }
  newOptionInput.value = ''
}
function removeNewOption(o) {
  newOptionList.value = newOptionList.value.filter((x) => x !== o)
}

function genKey(label) {
  let base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!/^[a-z]/.test(base)) base = 'field'
  let key = base
  let i = 1
  while (fields.value.some((f) => f.field_key === key)) key = `${base}_${i++}`
  return key
}

onMounted(async () => {
  fields.value = await api('/api/literature/fields')
  loaded.value = true
})

// 字段任何修改自动保存（防抖）
watch(
  fields,
  () => {
    if (loaded.value) scheduleSave()
  },
  { deep: true }
)
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 600)
}

function toggleAllEnabled(e) {
  fields.value.forEach((f) => (f.enabled = e.target.checked))
}

// 点击胶囊直接切换启用/停用
function toggleField(f) {
  f.enabled = !f.enabled
}

function onDragStart(i) {
  dragIndex.value = i
}

function onDragOver(i) {
  if (dragIndex.value === null || dragIndex.value === i) return
  const arr = [...fields.value]
  const [f] = arr.splice(dragIndex.value, 1)
  arr.splice(i, 0, f)
  fields.value = arr
  dragIndex.value = i
}

function onDragEnd() {
  dragIndex.value = null
}

function openField(f) {
  editing.value = { ...f }
}

function confirmField() {
  if (!editing.value.label.trim()) {
    emit('notify', '字段名称不能为空', 'error')
    return
  }
  const target = fields.value.find((x) => x.field_key === editing.value.field_key)
  if (target) Object.assign(target, editing.value)
  editing.value = null
}

async function removeField() {
  if (fields.value.length <= 1) {
    emit('notify', '至少保留一个字段', 'error')
    return
  }
  const ok = await confirmDialog({
    title: '删除字段',
    message: `确定删除字段「${editing.value.label}」吗？后续分析将不再提取该字段。`,
  })
  if (!ok) return
  fields.value = fields.value.filter((x) => x.field_key !== editing.value.field_key)
  editing.value = null
}

function addField() {
  const label = newLabel.value.trim()
  if (!label) {
    emit('notify', '请填写字段名称', 'error')
    return
  }
  const key = genKey(label)
  if (fields.value.some((f) => f.field_key === key)) {
    emit('notify', '字段已存在', 'error')
    return
  }
  fields.value.push({
    field_key: key,
    label,
    type: newType.value,
    description: newDesc.value.trim(),
    options: isCategoryType(newType.value) ? newOptionList.value.join('、') : '',
    enabled: true,
  })
  newLabel.value = ''
  newType.value = 'text'
  newDesc.value = ''
  newOptionList.value = []
  newOptionInput.value = ''
  showAdd.value = false
}

async function save() {
  try {
    const payload = fields.value.map((f) => ({
      field_key: f.field_key,
      label: f.label.trim() || f.field_key,
      type: f.type || 'text',
      description: f.description || '',
      options: f.options || '',
      enabled: !!f.enabled,
    }))
    await api('/api/literature/fields', { method: 'PUT', body: { fields: payload } })
  } catch (e) {
    emit('notify', e.message, 'error')
  }
}
</script>

<style scoped>
.lt-fields { margin-bottom: 16px; }
.lt-fields-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.lt-fields-title { display: flex; align-items: center; min-width: 0; }
.lt-fields h3 { font-size: 15px; margin: 0; }
.lt-fields-count {
  font-size: 11.5px;
  color: var(--tk-faint);
  margin-left: 8px;
  background: #f1f3f7;
  border-radius: 999px;
  padding: 1px 9px;
}
.lt-fields-head-actions { display: flex; align-items: center; gap: 10px; flex: none; }
.lt-fields-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  padding: 4px 16px 16px;
}
.lt-fields-all-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--tk-muted);
  cursor: pointer;
  white-space: nowrap;
}
.lt-fields-all { width: 15px; height: 15px; accent-color: var(--tk-blue); cursor: pointer; }
.lt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 5px 8px 5px 13px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: grab;
  transition: all 0.16s ease;
  user-select: none;
}
.lt-chip:active { cursor: grabbing; }
.lt-chip.dragging { opacity: 0.45; }
.lt-chip-icon {
  display: flex;
  align-items: center;
  flex: none;
  opacity: 0.85;
}
.lt-chip.on {
  background: var(--tk-blue);
  color: #fff;
  box-shadow: 0 2px 8px rgba(61, 110, 224, 0.22);
}
.lt-chip.on:hover { background: var(--tk-blue-dark); transform: translateY(-1px); }
.lt-chip.off {
  background: #f1f3f7;
  color: #a6aebd;
}
.lt-chip.off .lt-chip-name { text-decoration: line-through; }
.lt-chip.off:hover { background: #e9edf4; transform: translateY(-1px); }
.lt-chip-type {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 999px;
  letter-spacing: 0.02em;
}
.lt-chip.on .lt-chip-type { background: rgba(255, 255, 255, 0.22); }
.lt-chip.off .lt-chip-type { background: rgba(120, 130, 150, 0.16); }
.lt-chip-config {
  border: none;
  background: transparent;
  width: 20px;
  height: 20px;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex: none;
  transition: all 0.15s ease;
}
.lt-chip.on .lt-chip-config { color: rgba(255, 255, 255, 0.78); }
.lt-chip.on .lt-chip-config:hover { background: rgba(255, 255, 255, 0.22); color: #fff; }
.lt-chip.off .lt-chip-config { color: #9aa4b4; }
.lt-chip.off .lt-chip-config:hover { background: rgba(120, 130, 150, 0.16); }
.lt-add-chip {
  border: 1px dashed #bcd0f2;
  background: #f7faff;
  color: var(--tk-blue);
  width: 28px;
  height: 28px;
  border-radius: 999px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  transition: all 0.15s ease;
}
.lt-add-chip:hover { background: var(--tk-blue); color: #fff; border-color: var(--tk-blue); }
.lt-field-modal { max-width: 480px; }
.fm-field { margin-bottom: 14px; }
.fm-field label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--tk-muted);
  margin-bottom: 6px;
}
.fm-field .lt-input, .fm-field .lt-select, .fm-field .lt-textarea { width: 100%; }
.lt-textarea {
  border: 1px solid #dbe1ea;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
  resize: vertical;
  min-height: 64px;
  font-family: inherit;
  box-sizing: border-box;
}
.lt-textarea:focus { border-color: var(--tk-blue); box-shadow: 0 0 0 4px rgba(61, 110, 224, 0.12); }
.fm-enable {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--tk-muted);
  cursor: pointer;
}
.fm-enable input { width: 15px; height: 15px; accent-color: var(--tk-blue); }
.fm-options { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.fm-option {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--tk-blue-soft);
  color: var(--tk-blue);
  border-radius: 999px;
  padding: 3px 5px 3px 11px;
  font-size: 12.5px;
  font-weight: 500;
}
.fm-option button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  transition: all 0.12s ease;
}
.fm-option button:hover { background: rgba(61, 110, 224, 0.18); }
.fm-option-add { display: flex; gap: 6px; flex: 1; min-width: 200px; }
.fm-option-add .lt-input { flex: 1; min-width: 0; }
@media (max-width: 700px) {
  .lt-fields-head { flex-wrap: wrap; }
}
</style>
