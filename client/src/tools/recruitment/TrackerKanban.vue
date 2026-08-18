<template>
  <div class="kb-wrap">
    <div
      class="kb-col"
      v-for="s in STATUSES"
      :key="s"
      :class="{ over: dragOver === s }"
      @dragover.prevent="dragOver = s"
      @dragleave="dragOver = null"
      @drop="drop(s)"
    >
      <div class="kb-col-head" :style="{ borderColor: STATUS_COLORS[s] }">
        <span class="kb-col-dot" :style="{ background: STATUS_COLORS[s] }"></span>
        {{ s }}
        <span class="kb-col-count">{{ columns[s].length }}</span>
      </div>
      <div class="kb-col-body">
        <div
          class="kb-card"
          v-for="a in columns[s]"
          :key="a.id"
          draggable="true"
          @dragstart="dragStart($event, a.id)"
          @dragend="dragEnd"
          @click="$emit('open-application', a)"
        >
          <div class="kb-card-top">
            <span class="kb-company">{{ a.company_name }}</span>
            <span
              class="tk-badge kb-pri"
              :style="{
                background: PRIORITY_COLORS[a.priority].bg,
                color: PRIORITY_COLORS[a.priority].color,
              }"
              >{{ a.priority }}</span
            >
          </div>
          <div class="kb-pos">{{ a.position || '未填写岗位' }}</div>
          <div v-if="latestNode(a)" class="kb-node">
            <span class="kb-node-name">{{ latestNode(a).name }}</span>
            <span
              v-if="latestNode(a).result !== 'none'"
              class="kb-node-result"
              :style="resultStyle(latestNode(a).result)"
              >{{ resultLabel(latestNode(a).result) }}</span
            >
          </div>
        </div>
        <div v-if="!columns[s].length" class="kb-empty">拖拽卡片到这里</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { STATUSES, STATUS_COLORS, PRIORITY_COLORS, RESULT_COLORS } from '../../api'

const props = defineProps({ companies: { type: Array, default: () => [] } })
const emit = defineEmits(['open-application', 'move', 'notify'])

const dragOver = ref(null)
let draggingId = null

const applications = computed(() => {
  const out = []
  for (const c of props.companies) {
    for (const a of c.applications) {
      out.push({ ...a, company_name: c.name, company_link: c.link })
    }
  }
  return out
})

const columns = computed(() => {
  const m = {}
  for (const s of STATUSES) m[s] = []
  for (const a of applications.value) {
    if (!m[a.status]) m[a.status] = []
    m[a.status].push(a)
  }
  return m
})

function latestNode(a) {
  if (!a.milestones || !a.milestones.length) return null
  return a.milestones[a.milestones.length - 1]
}
function resultLabel(r) {
  return { none: '无结果', waiting: '等待中', pass: '通过', fail: '未通过' }[r] || ''
}
function resultStyle(r) {
  const c = RESULT_COLORS[r] || RESULT_COLORS.none
  return { color: c.color, background: c.bg }
}

function dragStart(e, id) {
  draggingId = id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', String(id))
}

function dragEnd() {
  draggingId = null
  dragOver.value = null
}

function drop(status) {
  dragOver.value = null
  if (!draggingId) return
  emit('move', { id: draggingId, status })
  draggingId = null
}
</script>

<style scoped>
.kb-wrap {
  display: grid;
  grid-template-columns: repeat(6, minmax(175px, 1fr));
  gap: 12px;
  align-items: start;
  overflow-x: hidden;
}
.kb-col {
  background: #f1f3f8;
  border-radius: 14px;
  min-height: 180px;
  border: 2px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.kb-col.over {
  border-color: var(--tk-blue);
  background: #e5edfb;
}
.kb-col-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px;
  font-size: 13px;
  font-weight: 700;
  border-bottom: 2px solid;
  color: var(--tk-text);
}
.kb-col-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 3px rgba(255,255,255,0.7); }
.kb-col-count {
  margin-left: auto;
  background: #fff;
  border-radius: 999px;
  padding: 1px 9px;
  font-size: 11px;
  font-weight: 600;
  color: var(--tk-muted);
  box-shadow: var(--tk-shadow-sm);
}
.kb-col-body { padding: 10px; display: grid; gap: 8px; }
.kb-card {
  background: #fff;
  border: 1px solid #e7ebf2;
  border-radius: 10px;
  padding: 10px 12px;
  min-width: 0;
  cursor: grab;
  box-shadow: var(--tk-shadow-sm);
  transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
.kb-card:hover { box-shadow: var(--tk-shadow-md); transform: translateY(-2px); border-color: #cfd9ec; }
.kb-card:active { cursor: grabbing; }
.kb-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.kb-company {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--tk-text);
  letter-spacing: -0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-pri { flex: none; font-size: 10px; padding: 1px 7px; }
.kb-pos {
  font-size: 12px;
  color: var(--tk-muted);
  margin-top: 4px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-node {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  min-width: 0;
}
.kb-node-name {
  font-size: 11.5px;
  color: var(--tk-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-node-result {
  flex: none;
  font-size: 10px;
  border-radius: 999px;
  padding: 1px 7px;
  font-weight: 600;
}
.kb-empty {
  text-align: center;
  color: #b6bdc9;
  font-size: 12px;
  padding: 30px 0;
  border: 1.5px dashed #d3dae2;
  border-radius: 12px;
}

@media (max-width: 1100px) {
  .kb-wrap { grid-template-columns: repeat(6, 200px); overflow-x: auto; }
}
</style>
