const express = require('express');
const auth = require('../auth');
const { seedSpace } = require('../seed-data');
const spaces = require('../spaces');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password, invite_code } = req.body || {};
  const name = String(username || '').trim();
  const pwd = String(password || '');
  if (!name || !pwd) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (name.length < 2) return res.status(400).json({ error: '用户名至少 2 个字符' });
  if (pwd.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });
  const r = auth.register(name, pwd, invite_code);
  if (r.error) return res.status(400).json({ error: r.error });
  const user = auth.userById(r.userId);
  const token = auth.createSession(r.userId);
  // 绑定游客空间（若有），实现游客数据合并；否则创建账号空间
  let space = null;
  if (req.body.guest_token) {
    const b = spaces.bindSpaceToUser(String(req.body.guest_token), r.userId);
    if (b.ok) space = b.space;
  }
  space = space || spaces.ensureUserSpace(r.userId);
  seedSpace(space.id);
  res.json({ token, user: auth.publicUser(user), is_first_user: r.isAdmin });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const r = auth.login(String(username || '').trim(), String(password || ''));
  if (r.error) return res.status(400).json({ error: r.error });
  const token = auth.createSession(r.user.id);
  let space = spaces.ensureUserSpace(r.user.id);
  if (req.body.guest_token) {
    const b = spaces.bindSpaceToUser(String(req.body.guest_token), r.user.id);
    if (b.ok) space = b.space;
  }
  seedSpace(space.id);
  res.json({ token, user: auth.publicUser(r.user) });
});

router.post('/logout', auth.requireAuth, (req, res) => {
  auth.destroySession(req.token);
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

module.exports = router;
