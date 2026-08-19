const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const mailer = require('../mailer');
const { seedSpace } = require('../seed-data');
const spaces = require('../spaces');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_TTL_MS = 10 * 60 * 1000; // 验证码有效期 10 分钟
const CODE_COOLDOWN_MS = 60 * 1000; // 重发间隔 60 秒
const PURPOSE_TEXT = { register: '注册账号', login: '验证码登录', reset: '重置密码' };

// 注册页公开配置：是否开启邀请码（不返回邀请码本身，避免泄露）
router.get('/invite-config', (req, res) => {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'invite_required'`).get();
  res.json({ invite_required: row && row.value === '1' ? '1' : '0' });
});

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 注册不再要求昵称：由邮箱前缀自动生成唯一用户名（仅作内部标识）
function genUsername(email) {
  let base = String(email.split('@')[0])
    .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '')
    .slice(0, 20);
  if (!base) base = 'user';
  let name = base;
  let i = 1;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(name)) {
    name = `${base}${i++}`;
  }
  return name;
}

// 查找有效验证码（不标记已用；成功后由调用方消耗）
function findValidCode(email, purpose, code) {
  const row = db
    .prepare(
      `SELECT * FROM email_codes
       WHERE email = ? AND purpose = ? AND used = 0 AND expires_at > ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(email, purpose, new Date().toISOString());
  if (!row || row.code !== String(code || '').trim()) return null;
  return row;
}

function consumeCode(id) {
  db.prepare('UPDATE email_codes SET used = 1 WHERE id = ?').run(id);
}

// 发送邮箱验证码：register / login / reset
router.post('/send-code', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const purpose = String((req.body || {}).purpose || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: '请输入正确的邮箱地址' });
  if (!PURPOSE_TEXT[purpose]) return res.status(400).json({ error: '验证码用途不正确' });

  if (purpose === 'register') {
    if (auth.userByEmail(email)) {
      return res.status(400).json({ error: '该邮箱已注册，请直接登录' });
    }
  } else if (!auth.userByEmail(email)) {
    return res.status(400).json({ error: '该邮箱尚未注册' });
  }

  const last = db
    .prepare(
      'SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1'
    )
    .get(email, purpose);
  if (last && Date.now() - new Date(last.created_at).getTime() < CODE_COOLDOWN_MS) {
    return res.status(429).json({ error: '发送太频繁，请 60 秒后再试' });
  }

  const code = genCode();
  db.prepare(
    'INSERT INTO email_codes (email, purpose, code, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(email, purpose, code, new Date(Date.now() + CODE_TTL_MS).toISOString(), new Date().toISOString());

  try {
    const r = await mailer.sendMail(
      email,
      `【GOLD 秋招追踪器】${PURPOSE_TEXT[purpose]}`,
      mailer.mailTemplate(`${PURPOSE_TEXT[purpose]}`, [
        ['邮箱', email],
        ['验证码', code],
        ['有效期', '10 分钟'],
      ])
    );
    if (!r.ok) {
      return res.status(400).json({ error: '邮件发送失败：' + (r.reason || '邮箱服务未配置') });
    }
  } catch (e) {
    return res.status(400).json({ error: '邮件发送失败：' + (e.message || '未知错误') });
  }

  res.json({ ok: true, message: `验证码已发送至 ${email}` });
});

router.post('/register', (req, res) => {
  const { password, email, code, invite_code } = req.body || {};
  const pwd = String(password || '');
  const mail = String(email || '').trim().toLowerCase();
  if (!pwd) return res.status(400).json({ error: '密码不能为空' });
  if (pwd.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });
  if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: '请填写正确的邮箱并完成验证' });
  const valid = findValidCode(mail, 'register', code);
  if (!valid) return res.status(400).json({ error: '验证码错误或已过期' });

  const name = genUsername(mail);
  const r = auth.register(name, pwd, invite_code, mail);
  if (r.error) return res.status(400).json({ error: r.error });
  consumeCode(valid.id);

  const user = auth.userById(r.userId);
  const token = auth.createSession(r.userId);
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
  const { email, password } = req.body || {};
  const r = auth.login(String(email || '').trim().toLowerCase(), String(password || ''));
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

// 验证码登录：邮箱 + 验证码
router.post('/login-code', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: '请输入正确的邮箱地址' });
  const valid = findValidCode(email, 'login', code);
  if (!valid) return res.status(400).json({ error: '验证码错误或已过期' });
  const user = auth.userByEmail(email);
  if (!user) return res.status(400).json({ error: '该邮箱尚未注册' });
  consumeCode(valid.id);

  const token = auth.createSession(user.id);
  let space = spaces.ensureUserSpace(user.id);
  if (req.body.guest_token) {
    const b = spaces.bindSpaceToUser(String(req.body.guest_token), user.id);
    if (b.ok) space = b.space;
  }
  seedSpace(space.id);
  res.json({ token, user: auth.publicUser(user) });
});

// 找回密码：邮箱 + 验证码 + 新密码
router.post('/reset-password', (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const code = String((req.body || {}).code || '');
  const pwd = String((req.body || {}).password || '');
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: '请输入正确的邮箱地址' });
  if (pwd.length < 4) return res.status(400).json({ error: '新密码至少 4 个字符' });
  const valid = findValidCode(email, 'reset', code);
  if (!valid) return res.status(400).json({ error: '验证码错误或已过期' });
  const user = auth.userByEmail(email);
  if (!user) return res.status(400).json({ error: '该邮箱尚未注册' });

  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(
    auth.hashPassword(pwd, salt),
    salt,
    user.id
  );
  consumeCode(valid.id);
  // 密码已重置，让该账号所有旧会话失效
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
});

router.post('/logout', auth.requireAuth, (req, res) => {
  auth.destroySession(req.token);
  res.json({ ok: true });
});

router.get('/me', auth.requireAuth, (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
});

module.exports = router;
