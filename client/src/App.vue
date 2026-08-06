<template>
  <div style="max-width:600px;margin:40px auto;font-family:sans-serif">
    <h1>🛠️ My Tools</h1>
    <div style="margin-bottom:20px">
      <input v-model="name" placeholder="工具名称" style="padding:8px;margin-right:8px;width:200px" />
      <input v-model="desc" placeholder="描述" style="padding:8px;margin-right:8px;width:250px" />
      <button @click="addTool" style="padding:8px 16px">添加</button>
    </div>
    <ul>
      <li v-for="t in tools" :key="t.id"><strong>{{ t.name }}</strong> - {{ t.description }}</li>
    </ul>
    <p v-if="!tools.length" style="color:#999">暂无工具，请添加第一个小工具吧！</p>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
const tools = ref([])
const name = ref('')
const desc = ref('')
const load = async () => { const r = await fetch('/api/tools'); tools.value = await r.json() }
const addTool = async () => {
  if (!name.value) return
  await fetch('/api/tools', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.value, description: desc.value }) })
  name.value = ''; desc.value = ''; load()
}
onMounted(load)
</script>
