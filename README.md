# Gold Workspace - 个人工具站

基于 Vue 3 + Express + SQLite 的个人工作坊，内置「秋招追踪器」求职投递进度管理工具，支持多用户注册与数据隔离。

## 用户与登录

- 打开网站后需要**注册/登录**才能使用（数据保存在服务器，跨设备登录同一账号即可同步进度）。
- **管理员账号由服务器端预设**（`server/.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`），服务启动时自动创建或同步，前端注册永远不会产生管理员，防止被他人抢注。
- 管理员接管升级前已有的历史数据。
- 每位用户的投递记录、节点、笔记、提醒、接收邮箱相互隔离，互不可见。
- 新注册用户会自动获得一份**内置初始招聘信息**（字节跳动、搜狐畅游、汇川技术、4399、好未来、科大讯飞、联想、叠纸、博西家电、亿联网络、新东方、帆软等），可作为起步参考并自由编辑；已有记录的用户不会被重复导入。
- 管理员可额外管理全局配置：AI 智能识别服务、注册邀请码、主页工具列表。
- 默认开放注册；管理员可在「追踪器 → 设置 → 注册邀请」中开启邀请码，限制陌生人注册。
- **请尽快修改 `server/.env` 中预设的管理员默认密码**。
- 登录会话有效期 30 天，退出登录后令牌立即失效。

## 目录结构

```
client/                         Vue 3 前端（Vite 构建）
└── src/
    ├── router.js               路由（/ 主页、/tools/<工具> 各工具页面）
    ├── tools/
    │   ├── index.js            内置工具注册清单（主页卡片从这里渲染）
    │   └── recruitment/        秋招追踪器（组件 + 样式）
    ├── ui/                     跨工具通用组件（RichEditor 等）
    ├── views/HomeView.vue      主页（Hero、工具卡片、经历时间轴）
    └── styles/tokens.css       全局设计令牌（颜色、圆角变量）
server/                         Express + better-sqlite3 后端（数据存于 server/data.db）
├── routes/
│   └── recruitment/            秋招追踪器接口（按工具模块隔离）
├── db.js                       数据库（全部工具共用，settings 表存共享配置）
├── mailer.js                   邮件发送服务
└── index.js                    服务入口（/api/recruitment/* 挂载工具接口）
```

## 工具模块约定（新增工具时）

1. 前端：在 `client/src/tools/` 下新建工具目录（如 `literature/`），组件、样式全部放里面；
2. 注册：在 `client/src/tools/index.js` 加一行（名称/图标/描述/路由路径），在 `client/src/router.js` 挂载路由；
3. 后端：在 `server/routes/` 下新建工具目录，路由统一挂到 `/api/<工具名>/` 前缀；
4. 数据表：新工具使用独立表名（如 `literature_papers`），共享的 AI 配置复用公共 `settings` 表；
5. 通用能力（富文本编辑器、邮件发送）优先复用 `client/src/ui/` 与 `server/mailer.js`，不要复制。

每个工具页面使用独立 URL（如 `/tools/recruitment`），可直接分享、浏览器可前进后退。

## 本地运行

要求 Node.js ≥ 20（better-sqlite3 v12 的最低要求）。

```bash
# 1. 安装依赖
cd client && npm install
cd ../server && npm install

# 2. 一键开发模式（在项目根目录执行，同时启动前端与后端）
cd .. && npm run dev
# 前端 http://localhost:5173（/api 自动代理到后端）
# 后端 http://127.0.0.1:3000

# 2b. 也可以分开启动（两个终端）
cd client && npm run dev      # http://localhost:5173，/api 自动代理到 3000
cd server && npm start        # 后端 http://127.0.0.1:3000

# 3. 生产构建（前端产物输出到 client/dist）
cd client && npm run build
```

服务端若检测到 `client/dist` 存在，会自动托管前端静态文件，单进程即可访问完整站点。

项目根目录还提供了 `npm run build`（构建前端）和 `npm start`（仅启动后端）两个快捷命令。

## 部署到阿里云 ECS

1. 在服务器安装 Node.js 20/22 LTS（`better-sqlite3` v12 不支持 Node 18 及以下）。
2. 拉取代码后执行上述安装与构建步骤。
3. 用 `pm2` 守护后端：`pm2 start server/index.js --name mytools`。
4. 配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        root /path/to/gold-workspace/client/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

5. 重启服务：`pm2 restart mytools`。

## 秋招追踪器功能

- **投递记录**：公司、岗位、部门、城市、薪资、渠道、链接、内推码、备注的增删改查。
- **进展追踪**：自定义节点（投递/笔试/一面/二面/HR面/Offer/群面/背调…），节点名与日期可自由编辑，自动推断当前阶段。
- **自动优先级**：按进度深度与最近节点距今天数自动计算高/中/低。
- **筛选搜索**：按状态筛选 + 公司/岗位/城市/备注关键词实时搜索。
- **AI 智能识别**：粘贴招聘文本，调用 DeepSeek / OpenAI / Kimi 自动提取字段（需在「设置」页配置 API Key）。
- **内推码复制**：列表与看板卡片一键复制。
- **导入导出**：JSON 备份，支持「合并」与「完全覆盖」两种导入模式。
- **批量推进**：勾选多条记录统一推进到下一阶段并自动追加节点。
- **看板视图**：按状态分列，拖拽卡片即更新状态并追加节点，与列表实时同步。
- **数据仪表盘**：总投递、状态分布（柱状/环形图）、投递→面试、面试→Offer 转化率、各阶段平均耗时，支持近一周/近一月/全部筛选。
- **复盘笔记**：每个节点下可记多条富文本笔记并打标签，按标签在「笔记库」全局聚合，形成面经知识库。
- **邮件提醒**：绑定邮箱 + SMTP 后，节点可设置提前 N 小时/天提醒；投递超过 N 天无进展时自动发送「沉默提醒」（每 60 秒检查一次）。

## 配置说明

### 邮件提醒（SMTP）

邮件配置在服务器端完成，网页设置页不再需要填写 SMTP（避免暴露账号信息）。复制 `server/.env.example` 为 `server/.env` 并填写：

```env
MAIL_TO=you@example.com            # 提醒邮件收件地址（站长邮箱）
SMTP_HOST=smtp.qq.com              # SMTP 主机
SMTP_PORT=465
SMTP_SECURE=ssl
SMTP_USER=you@example.com          # 登录账号
SMTP_PASS=your-smtp-authorization-code  # 授权码（非登录密码）
```

重启服务后在追踪器「设置」页点「发送测试邮件」验证。也可以直接用系统环境变量（`MAIL_TO`、`SMTP_HOST` 等）配置，优先级高于 `.env`。

### AI 智能识别

进入「设置」页选择服务商并填写 API Key（密钥仅保存在你自己的服务器数据库中）：

| 服务商 | 接口地址（自动填充） | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 自定义 | 任意 OpenAI 兼容接口 | 自行填写 |

## 数据备份

所有数据存于 `server/data.db`（SQLite）。可在「设置 → 数据管理」导出 JSON 备份；直接复制该文件也可完整备份。
