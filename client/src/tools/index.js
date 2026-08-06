// 内置工具注册清单：新增工具 = 新建目录 + 在此登记一行
// 主页工具卡片会从这里渲染，路由在 router.js 中按 path 挂载
export const builtinTools = [
  {
    id: 'recruitment',
    name: '秋招追踪器',
    icon: '🎯',
    desc: '求职投递进度管理：记录、追踪、复盘、分析与提醒全流程',
    path: '/tools/recruitment',
  },
]
