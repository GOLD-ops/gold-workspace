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
          v-for="c in columns[s]"
          :key="c.id"
          draggable="true"
          @dragstart="dragStart($event, c.id)"
          @dragend="dragEnd"
          @click="$emit('open', c)"
        >
          <div class="kb-card-top">
            <span class="kb-company">{{ c.company }}</span>
            <span
              class="tk-badge kb-pri"
              :style="{
                background: PRIORITY_COLORS[c.priority].bg,
                color: PRIORITY_COLORS[c.priority].color,
              }"
              >{{ c.priority }}</span
            >
          </div>
          <div class="kb-pos">{{ c.position || '未填写岗位' }}</div>
        </div>
        <div v-if="!columns[s].length" class="kb-empty">拖拽卡片到这里</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { STATUSES, STATUS_COLORS, PRIORITY_COLORS } from '../../api'

const props = defineProps({ companies: { type: Array, default: () => [] } })
const emit = defineEmits(['open', 'move', 'notify'])

const dragOver = ref(null)
let draggingId = null

const columns = computed(() => {
  const m = {}
  for (const s of STATUSES) m[s] = []
  for (const c of props.companies) {
    if (!m[c.status]) m[c.status] = []
    m[c.status].push(c)
  }
  return m
})

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
