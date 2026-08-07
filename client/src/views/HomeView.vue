<template>
  <div>
    <!-- Hero 个人介绍区 -->
    <header class="hero">
      <p class="tagline">小工具创作者 · 持续学习中</p>
      <p class="desc">这里是我的个人工作坊，收集了我开发的各种实用小工具和成长经历。</p>
    </header>

    <!-- Tab 切换 -->
    <div class="tabs">
      <button :class="{ active: tab === 'tools' }" @click="tab = 'tools'">🧰 我的工具</button>
      <button :class="{ active: tab === 'journey' }" @click="tab = 'journey'">📍 过往经历</button>
    </div>

    <!-- 工具列表 -->
    <section v-if="tab === 'tools'" class="content">
      <div class="card-grid">
        <RouterLink
          v-for="tool in builtinTools"
          :key="tool.id"
          :to="tool.path"
          target="_blank"
          rel="noopener"
          class="card featured-tool"
        >
          <div class="featured-head">
            <span class="featured-icon">{{ tool.icon }}</span>
            <h3>{{ tool.name }}</h3>
          </div>
          <p>{{ tool.desc }}</p>
          <span class="featured-link">点击进入 ›</span>
        </RouterLink>
      </div>
    </section>

    <!-- 过往经历时间轴 -->
    <section v-if="tab === 'journey'" class="content">
      <div class="timeline">
        <div class="timeline-item" v-for="(item, i) in journey" :key="i">
          <div class="timeline-dot"></div>
          <div class="timeline-card">
            <span class="timeline-date">{{ item.date }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.desc }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { builtinTools } from '../tools'

const tab = ref('tools')

// 过往经历数据（后续可改为从API读取）
const journey = ref([
  { date: '2026-08', title: '搭建个人工作坊', desc: '使用 Node.js + Vue + SQLite 在阿里云 ECS 上部署了个人网站，作为小工具集合和成长记录平台。' },
  { date: '2026-07', title: '开始秋招准备', desc: '启动 Autumn Recruitment Tracker 项目，系统梳理求职目标和技术栈提升计划。' },
  { date: '2026-05', title: '学习全栈开发', desc: '完成 Node.js + Vue 3 全栈技术学习，掌握 Express、SQLite、Nginx 部署等核心技能。' },
  { date: '2025-12', title: '接触云计算', desc: '首次使用阿里云 ECS，学习 Linux 运维、安全组配置和远程部署流程。' },
])

</script>

<style scoped>
/* Hero区 */
.hero {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 24px 18px;
  text-align: center;
}
.tagline { font-size: 15px; font-weight: 600; color: #333; margin: 0; }
.desc { font-size: 13px; color: #888; line-height: 1.6; margin: 6px 0 0; }

/* Tabs */
.tabs { display: flex; justify-content: center; gap: 8px; padding: 0 20px 24px; }
.tabs button { padding: 10px 24px; border: none; border-radius: 20px; background: #fff; color: #666; font-size: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.tabs button.active { background: #4a90d9; color: #fff; box-shadow: 0 2px 8px rgba(74,144,217,0.3); }

/* 内容区 */
.content { max-width: 1200px; margin: 0 auto; padding: 0 24px 48px; }

/* 工具卡片网格 */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.card h3 { font-size: 16px; margin-bottom: 8px; color: #1a1a1a; }
.card p { font-size: 14px; color: #666; line-height: 1.5; margin-bottom: 8px; }
.card .time { font-size: 12px; color: #aaa; }

/* 内置工具入口卡片 */
.featured-tool {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  background: linear-gradient(135deg, #eef4fc 0%, #fff 55%);
  border: 1px solid #cfe0f3;
  position: relative;
  overflow: hidden;
}
.featured-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.featured-head .featured-icon { font-size: 24px; line-height: 1; margin: 0; }
.featured-tool h3 { color: #2b6cb0; }
.featured-tool .featured-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: #4a90d9;
  transition: transform 0.2s;
}
.featured-tool:hover .featured-link { transform: translateX(4px); }
.empty { grid-column: 1 / -1; text-align: center; padding: 40px; color: #aaa; font-size: 14px; }

/* 时间轴 */
.timeline { position: relative; padding-left: 24px; max-width: 760px; margin: 0 auto; }
.timeline::before { content: ''; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: #e0e0e0; }
.timeline-item { position: relative; margin-bottom: 24px; }
.timeline-dot { position: absolute; left: -20px; top: 8px; width: 12px; height: 12px; border-radius: 50%; background: #4a90d9; border: 2px solid #fff; box-shadow: 0 0 0 2px #e0e0e0; }
.timeline-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.timeline-date { font-size: 12px; color: #4a90d9; font-weight: 600; margin-bottom: 6px; display: block; }
.timeline-card h3 { font-size: 16px; margin-bottom: 6px; color: #1a1a1a; }
.timeline-card p { font-size: 14px; color: #666; line-height: 1.6; }

/* 移动端适配 */
@media (max-width: 600px) {
  .hero { padding: 18px 16px 14px; }
  .tagline { font-size: 13.5px; }
  .desc { font-size: 12px; }
  .card-grid { grid-template-columns: 1fr; }
  .tabs button { padding: 8px 18px; font-size: 13px; }
}
</style>
