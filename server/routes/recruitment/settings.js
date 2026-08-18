const express = require('express');
const db = require('../../db');
const mailer = require('../../mailer');
const auth = require('../../auth');

const router = express.Router();

const SECRET_KEYS = ['ai_api_key'];
const USER_KEYS = ['email', 'silence_days'];
const ADMIN_KEYS = ['ai_provider', 'ai_base_url', 'ai_model', 'ai_api_key', 'invite_required', 'invite_code'];

function mask(value) {
  if (!value) return '';
  if (value.length <= 6) return '******';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function readGlobalSettings(masked = true) {
  const s = mailer.getSettings();
  const out = {
    ai_provider: s.ai_provider || 'deepseek',
    ai_base_url: s.ai_base_url || '',
    ai_model: s.ai_model || '',
    ai_api_key: s.ai_api_key || '',
    invite_required: s.invite_required || '0',
    invite_code: s.invite_code || '',
  };
  if (masked && out.ai_api_key) out.ai_api_key = mask(out.ai_api_key);
  return out;
}

// 当前用户的个性化设置（接收邮箱、沉默天数）
function readUserSettings(userId) {
  const u = auth.userById(userId);
  return {
    email: (u && u.email) || '',
    silence_days: (u && u.silence_days) || '14',
  };
}

router.get('/', (req, res) => {
  const uid = req.user ? req.user.id : null;
  const out = {
    ...readUserSettings(uid),
    ai_provider: '',
    ai_model: '',
    ai_base_url: '',
  };
  const g = readGlobalSettings(true);
  if (req.user && req.user.is_admin) {
    out.ai_provider = g.ai_provider;
    out.ai_model = g.ai_model;
    out.ai_base_url = g.ai_base_url;
    out.ai_api_key = g.ai_api_key;
    out.invite_required = g.invite_required;
    out.invite_code = g.invite_code;
  } else {
    // 普通用户可看到 AI 服务商与模型（用于识别提示），但不含密钥与配置项
    out.ai_provider = g.ai_provider;
    out.ai_model = g.ai_model;
  }
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};

  // 用户级设置：所有人可修改自己的
  const userPatch = {};
  for (const key of USER_KEYS) {
    if (body[key] !== undefined) userPatch[key] = String(body[key]);
  }
  if (Object.keys(userPatch).length && req.user) {
    const sets = Object.keys(userPatch)
      .map((k) => `${k} = ?`)
      .join(', ');
    const vals = Object.keys(userPatch).map((k) => userPatch[k]);
    db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...vals, req.user.id);
  }

  // 全局配置：仅管理员
  const adminPatch = {};
  for (const key of ADMIN_KEYS) {
    if (body[key] !== undefined) adminPatch[key] = String(body[key]);
  }
  if (Object.keys(adminPatch).length && !(req.user && req.user.is_admin)) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  if (Object.keys(adminPatch).length) {
    const current = readGlobalSettings(false);
    for (const [key, value] of Object.entries(adminPatch)) {
      let v = value;
      if (SECRET_KEYS.includes(key)) {
        if (v === '' || v.startsWith('****')) v = current[key] || '';
      }
      db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(key, v);
    }
  }

  const uid = req.user ? req.user.id : null;
  const out = {
    ...readUserSettings(uid),
    ai_provider: readGlobalSettings(true).ai_provider,
    ai_model: readGlobalSettings(true).ai_model,
  };
  if (req.user && req.user.is_admin) {
    Object.assign(out, readGlobalSettings(true));
  }
  res.json(out);
});

router.post('/test-mail', async (req, res) => {
  if (!req.user) return res.status(400).json({ error: '游客请先登录后使用邮件提醒' });
  const to = auth.userById(req.user.id).email;
  if (!to) return res.status(400).json({ error: '请先填写接收提醒的邮箱' });
  try {
    const r = await mailer.sendMail(
      to,
      '【秋招追踪器】测试邮件',
      mailer.mailTemplate('邮件配置测试成功', [
        ['说明', '这是一封来自秋招追踪器的测试邮件'],
        ['时间', new Date().toLocaleString('zh-CN')],
      ])
    );
    if (r.skipped) return res.status(400).json({ error: r.reason || '发信账号未配置' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `发送失败：${err.message}` });
  }
});

router.post('/mail-check', async (req, res) => {
  if (!req.user) return res.status(400).json({ error: '游客请先登录后使用邮件提醒' });
  const r = await mailer.checkReminders(req.user.id);
  res.json(r);
});

router.get('/reminders', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, c.name AS company, a.position, m.name AS milestone_name
       FROM reminders r
       JOIN applications a ON a.id = r.application_id
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN milestones m ON m.id = r.milestone_id
       WHERE r.space_id = ?
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT 100`
    )
    .all(req.spaceId);
  res.json(rows);
});

module.exports = router;
