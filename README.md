# GOLD Workspace - 个人工具站

基于 Vue 3 + Express + SQLite 的个人工作坊，内置「秋招追踪器」与「文献分析」两个工具，支持邮箱验证码注册登录、游客即用、多用户数据隔离。

## 内置工具

- **秋招追踪器**：求职投递进度管理（记录、追踪、看板、仪表盘、Markdown 复盘笔记、邮件提醒、AI 智能识别）。
- **文献分析**：上传 PDF/txt/md，AI 按自定义字段自动分析（研究方法、核心结论等），一键导出 Excel；扫描版 PDF 自动 OCR。

## 账号体系

- **打开即用，无需注册**：首次访问自动获得一个「游客空间」，数据直接保存在服务器，按空间隔离互不可见。
- **邮箱验证码注册**：注册页填写邮箱 → 获取验证码 → 输入验证码完成注册（验证码 6 位、10 分钟有效、60 秒内不可重发、一次性使用）。不再要求昵称，系统自动生成内部用户名；同时支持管理员开启的**邀请码注册**，注册页会跟随管理员设置自动显示/隐藏邀请码输入框。
- **登录两种方式**：邮箱 + 密码，或邮箱 + 验证码。
- **找回密码**：通过注册邮箱验证码设置新密码，重置后旧会话全部失效。
- **游客数据自动合并**：注册/登录时绑定游客空间，游客期间产生的记录自动合并到账号，任意设备同步同一份数据。
- **管理员账号由服务器端预设**（`server/.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` / 邮箱），服务启动时自动创建或同步，前端注册永远不会产生管理员；管理员可使用邮箱+密码登录。
- 每位用户的投递记录、节点、笔记、提醒、接收邮箱相互隔离；游客与每个账号都会自动获得一份**内置初始招聘信息**（47 家公司），已有记录的空间不会被重复导入。
- 默认开放注册；管理员可在「秋招追踪器 → 设置 → 注册邀请」中开启邀请码，限制陌生人注册。
- **请尽快修改 `server/.env` 中预设的管理员默认密码。**
- 登录会话有效期 30 天，退出登录后令牌立即失效。

## 目录结构

```
client/                         Vue 3 前端（Vite 构建）
└── src/
    ├── router.js               路由（/ 主页、/tools/<工具> 各工具页面）
    ├── tools/
    │   ├── index.js            内置工具注册清单（主页卡片从这里渲染）
    │   ├── recruitment/        秋招追踪器（组件 + 样式）
    │   └── literature/         文献分析（组件 + 样式）
    ├── ui/                     跨工具通用组件与工具函数
    │   ├── MarkdownEditor.vue  Markdown 编辑/预览
    │   ├── ConfirmDialog.vue   全局确认弹窗
    │   └── markdown.js         轻量 Markdown 渲染器
    ├── views/HomeView.vue      主页（Hero、工具卡片、经历时间轴）
    ├── views/AuthView.vue      登录 / 注册 / 找回密码
    └── styles/tokens.css       全局设计令牌（颜色、圆角变量）
server/                         Express + better-sqlite3 后端（数据存于 server/data.db）
├── routes/
│   ├── auth.js                 注册 / 登录 / 验证码 / 找回密码
│   ├── recruitment/            秋招追踪器接口
│   └── literature/             文献分析接口
├── db.js                       数据库（全部工具共用）
├── mailer.js                   邮件发送服务（验证码、节点提醒、沉默提醒）
├── auth.js                     用户 / 会话 / 权限
└── index.js                    服务入口（托管前端构建产物并挂载 /api/*）
```

## 工具模块约定（新增工具时）

1. 前端：在 `client/src/tools/` 下新建工具目录，组件、样式全部放里面；
2. 注册：在 `client/src/tools/index.js` 加一行（名称/图标/描述/路由路径），在 `client/src/router.js` 挂载路由；
3. 后端：在 `server/routes/` 下新建工具目录，路由统一挂到 `/api/<工具名>/` 前缀；
4. 数据表：新工具使用独立表名（如 `literature_papers`）；
5. 通用能力（Markdown 编辑器、确认弹窗、邮件发送）优先复用 `client/src/ui/` 与 `server/mailer.js`，不要复制。

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
3. **在服务器上创建 `server/.env`**（该文件被 git 忽略，必须手动创建）：复制 `server/.env.example` 为 `server/.env`，至少填写管理员账号、密码与邮箱：

   ```env
   ADMIN_USERNAME=GOLD
   ADMIN_PASSWORD=你的管理员密码
   MAIL_TO=you@example.com
   ```

   管理员邮箱用于登录与接收提醒邮件；也可以用系统环境变量注入，优先级高于 `.env`。
4. 用 `systemd` 守护后端（启动 `node server/index.js`）。
5. 配置 Nginx 反向代理：

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
        root /opt/gold-workspace/client/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

6. 更新代码后：重新构建前端 → `systemctl restart gold-workspace` → `systemctl reload nginx`。

## 秋招追踪器功能

- **投递记录**：公司、岗位、部门、城市、薪资、链接、内推码、备注、职位描述的增删改查；一家公司可挂多个岗位投递。
- **进展追踪**：自定义节点（投递/笔试/群面/一面/二面/三面/HR面/背调/Offer…），节点结果四态（待进行/待结果/通过/未通过），新增后置节点时自动将前面节点联动为「通过」；节点按流程顺序排序展示。
- **状态体系**：未投递 / 已投递 / 笔试 / 面试 / Offer / 已淘汰；没有任何投递的公司自动归入「未投递」，列表与看板一致。
- **筛选搜索**：按状态筛选 + 公司/岗位/城市/备注关键词实时搜索。
- **AI 智能识别**：粘贴招聘文本，自动识别公司（或岗位投递）并填入表单（需在「设置」页配置 API Key）。
- **导入导出**：JSON 备份，支持「合并」与「完全覆盖」两种导入模式；笔记库也支持独立的笔记导入导出。
- **看板视图**：按状态分列，拖拽卡片即更新状态；无投递的公司以虚拟卡片展示在「未投递」列，与列表实时同步。
- **数据仪表盘**：总投递、状态分布（柱状/环形图）、转化率、各阶段平均耗时；支持自定义日期范围与近一周/近一月/全部快捷筛选。
- **复盘笔记（Markdown）**：节点下可记 Markdown 笔记，支持编辑/预览与原地编辑；「笔记库」支持按公司/岗位/节点多选筛选、按公司/岗位/节点查看方式切换、点击卡片弹出大窗口查看编辑，新建笔记自动填充「公司-岗位-节点笔记」标题。
- **邮件提醒**：全局规则（阶段提醒：提前 N 天/小时 + 指定时间点；沉默提醒：超过 N 天无进展自动跟进），每 60 秒检查一次；节点时间已过则不生成提醒记录，发送失败会在「最近提醒记录」中显示失败原因；保存规则后自动重新同步所有待进行节点。

## 文献分析工具

- 支持拖拽/选择批量上传 PDF、txt、md（单篇 ≤ 20MB，批量 ≤ 300 篇），上传带进度与并发队列。
- 文本型 PDF 直接提取文本；扫描版 PDF 自动 OCR（中英文），OCR 最多处理前 15 页。
- 分析字段可自定义：预设发表时间（日期）、研究方法、研究问题、核心结论、创新点、局限性等字段，字段类型支持文本/日期/是或否/单选/多选，可拖拽排序、自动保存。
- 分析为手动触发（勾选后点「开始分析」），后端队列逐篇处理，前端实时显示进度；AI 未配置时记录失败状态，配置后可在「查看/编辑」中重新保存或重试。
- 导出 Excel / JSON 均按当前启用的字段生成，Excel 首列带序号。
- **每个用户独立的 AI 服务配置**：任何用户（含游客）都能在「文献分析 → AI 设置」中配置自己的服务商 / 接口地址 / 模型 / API Key，各自隔离互不影响；选择服务商时自动带出默认接口地址与模型列表，可手动修改或选「自定义」。

### 部署注意（OCR）

OCR 语言包（`chi_sim`、`eng`，约 30MB）放在 `server/tessdata/`，该目录已被 git 忽略，**部署时需单独拷贝或下载**：

```bash
cd /opt/gold-workspace/server
mkdir -p tessdata
curl -L -o tessdata/eng.traineddata.gz https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz
curl -L -o tessdata/chi_sim.traineddata.gz https://tessdata.projectnaptha.com/4.0.0/chi_sim.traineddata.gz
```

上传的文献文件保存在 `server/uploads/literature/`（git 忽略）。服务器内存较小（2GB）时，OCR 大批量任务建议分批处理。

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

重启服务后在追踪器「设置」页点「发送测试邮件」验证。也可以用系统环境变量（`MAIL_TO`、`SMTP_HOST` 等）配置，优先级高于 `.env`。邮件模板内嵌 logo 并适配 QQ 邮箱（不会因拦截外链图片而丢失品牌区）。

### AI 智能识别

进入「设置」页选择服务商并填写 API Key（密钥仅保存在你自己的服务器数据库中），选择服务商时自动带出接口地址与模型：

| 服务商 | 接口地址（自动填充） | 预置模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash`、`deepseek-v4-pro` |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.4`、`gpt-5.4-mini`、`gpt-5.4-nano`、`gpt-5.3-chat-latest`、`gpt-5.2`、`gpt-5.1`、`gpt-5-mini` |
| Kimi | `https://api.moonshot.cn/v1` | `kimi-k3`、`kimi-k2.6`、`kimi-k2.7-code`、`kimi-k2.7-code-highspeed` |
| 自定义 | 任意 OpenAI 兼容接口 | 手动填写 |

## 数据备份

所有数据存于 `server/data.db`（SQLite）。可在秋招追踪器「列表 → 导出」导出 JSON 备份；直接复制该文件也可完整备份。
