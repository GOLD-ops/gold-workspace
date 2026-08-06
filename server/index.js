const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const mailer = require('./mailer');

const recruitmentRouter = require('./routes/recruitment');
const authRouter = require('./routes/auth');
const auth = require('./auth');

// 服务启动时确保预设管理员存在
auth.ensureAdmin();

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

// 若存在前端构建产物，直接托管（同时兼容 Nginx 反向代理部署）
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  mailer.startMailScheduler();
});
