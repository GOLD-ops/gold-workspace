const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const mailer = require('./mailer');

const recruitmentRouter = require('./routes/recruitment');
const authRouter = require('./routes/auth');
const literatureRouter = require('./routes/literature');
const roomieRouter = require('./routes/roomie');
const auth = require('./auth');

// 服务启动时确保预设管理员存在
auth.ensureAdmin();
// 重置上次未完成的分析状态
require('./routes/literature/analysis').resetAll();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 用户认证
app.use('/api/auth', authRouter);

// 原有主页工具接口
app.get('/api/tools', (req, res) => {
  const tools = db.prepare('SELECT * FROM tools ORDER BY created_at DESC').all();
  res.json(tools);
});
app.post('/api/tools', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const { name, description } = req.body;
  const stmt = db.prepare('INSERT INTO tools (name, description) VALUES (?, ?)');
  const result = stmt.run(name, description);
  res.json({ id: result.lastInsertRowid, name, description });
});

// 秋招追踪器接口（按工具模块挂载，未来新工具追加独立前缀）
app.use('/api/recruitment', recruitmentRouter);

// 文献分析工具接口
app.use('/api/literature', literatureRouter);

// 合租生活管家接口
app.use('/api/roomie', auth.requireAuth, roomieRouter);

// 若存在前端构建产物，直接托管（同时兼容 Nginx 反向代理部署）
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

// 统一错误出口：同步异常与未捕获的异步拒绝都返回 JSON，避免前端只看到 HTML 报错页
app.use((err, req, res, next) => {
  console.error('[server]', req.method, req.originalUrl, err && err.message);
  if (res.headersSent) return next(err);
  res.status(err && err.status ? err.status : 500).json({
    error: (err && err.status && err.message) || '服务器开小差了，请稍后重试',
  });
});

// 兜底：任何未处理的异常都记录下来但不退出进程，避免一个请求把整站带崩
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', (reason && reason.stack) || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', (err && err.stack) || err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  mailer.startMailScheduler();
});
